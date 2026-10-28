import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  Account,
  AccountsResponse,
  AdjustBalanceRequest,
  AdjustBalanceResponse,
  CreateAccountRequest,
  CreatePocketRequest,
  Pocket,
  UpdateAccountRequest,
  UpdatePocketRequest,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus, reloadOn } from '../../core/data/refresh-bus';

const LAST_POCKET_KEY = 'platin.lastPocket';

/** What a write on accounts or pockets can change. */
const AFFECTED: DataKey[] = ['accounts', 'movements', 'dashboard', 'goals'];

/** Accounts with their pockets and calculated balances (CTA-01 to 07). */
@Injectable({ providedIn: 'root' })
export class AccountsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<AccountsResponse>(() => `${API}/accounts`);
  readonly accounts = computed(() => this.resource.value()?.items ?? []);
  readonly totals = computed(() => this.resource.value()?.totals ?? { ARS: '0.00', USD: '0.00' });
  /** Every active pocket, account after account (what the selectors offer). */
  readonly pockets = computed(() =>
    this.accounts().flatMap((account) => account.pockets.filter((pocket) => !pocket.archived)),
  );

  constructor() {
    reloadOn(this.bus, ['accounts'], () => this.resource.reload());
  }

  byId(id: string | null | undefined): Account | undefined {
    return this.accounts().find((account) => account.id === id);
  }

  pocketById(id: string | null | undefined): Pocket | undefined {
    return this.pockets().find((pocket) => pocket.id === id);
  }

  /** All accounts, archived ones and archived pockets included. */
  async listArchived(): Promise<Account[]> {
    const response = await firstValueFrom(
      this.http.get<AccountsResponse>(`${API}/accounts`, { params: { archived: 'true' } }),
    );
    return response.items;
  }

  /** One account with all its pockets, archived ones included. */
  get(id: string): Promise<Account> {
    return firstValueFrom(this.http.get<Account>(`${API}/accounts/${id}`));
  }

  getPocket(id: string): Promise<Pocket> {
    return firstValueFrom(this.http.get<Pocket>(`${API}/pockets/${id}`));
  }

  create(request: CreateAccountRequest): Promise<Account> {
    return this.write(this.http.post<Account>(`${API}/accounts`, request));
  }

  update(id: string, changes: UpdateAccountRequest): Promise<Account> {
    return this.write(this.http.patch<Account>(`${API}/accounts/${id}`, changes));
  }

  createPocket(accountId: string, request: CreatePocketRequest): Promise<Pocket> {
    return this.write(this.http.post<Pocket>(`${API}/accounts/${accountId}/pockets`, request));
  }

  updatePocket(id: string, changes: UpdatePocketRequest): Promise<Pocket> {
    return this.write(this.http.patch<Pocket>(`${API}/pockets/${id}`, changes));
  }

  adjust(pocketId: string, request: AdjustBalanceRequest): Promise<AdjustBalanceResponse> {
    return this.write(
      this.http.post<AdjustBalanceResponse>(`${API}/pockets/${pocketId}/adjust`, request),
    );
  }

  /** The pocket used last in the quick entry (preselected next time). */
  lastUsedId(): string | null {
    try {
      return localStorage.getItem(LAST_POCKET_KEY);
    } catch {
      return null;
    }
  }

  rememberLastUsed(id: string): void {
    try {
      localStorage.setItem(LAST_POCKET_KEY, id);
    } catch {
      // Private mode: nothing to remember.
    }
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED);
    return result;
  }
}
