import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  Account,
  AccountsResponse,
  AdjustBalanceRequest,
  AdjustBalanceResponse,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';

const LAST_ACCOUNT_KEY = 'platin.lastAccount';

/** Accounts with their calculated balances. */
@Injectable({ providedIn: 'root' })
export class AccountsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<AccountsResponse>(() => `${API}/accounts`);
  readonly accounts = computed(() => this.resource.value()?.items ?? []);
  readonly totals = computed(() => this.resource.value()?.totals ?? { ARS: '0.00', USD: '0.00' });

  constructor() {
    reloadOn(this.bus, ['accounts'], () => this.resource.reload());
  }

  byId(id: string | null | undefined): Account | undefined {
    return this.accounts().find((account) => account.id === id);
  }

  /** All accounts, archived included (the default list hides archived ones). */
  async listArchived(): Promise<Account[]> {
    const response = await firstValueFrom(
      this.http.get<AccountsResponse>(`${API}/accounts`, { params: { archived: 'true' } }),
    );
    return response.items;
  }

  async create(request: CreateAccountRequest): Promise<Account> {
    const account = await firstValueFrom(this.http.post<Account>(`${API}/accounts`, request));
    this.bus.invalidate('accounts', 'dashboard');
    return account;
  }

  async update(id: string, changes: UpdateAccountRequest): Promise<Account> {
    const account = await firstValueFrom(
      this.http.patch<Account>(`${API}/accounts/${id}`, changes),
    );
    this.bus.invalidate('accounts', 'movements', 'dashboard');
    return account;
  }

  async adjust(id: string, request: AdjustBalanceRequest): Promise<AdjustBalanceResponse> {
    const result = await firstValueFrom(
      this.http.post<AdjustBalanceResponse>(`${API}/accounts/${id}/adjust`, request),
    );
    this.bus.invalidate('accounts', 'movements', 'dashboard');
    return result;
  }

  /** The account used last in the quick entry (preselected next time). */
  lastUsedId(): string | null {
    try {
      return localStorage.getItem(LAST_ACCOUNT_KEY);
    } catch {
      return null;
    }
  }

  rememberLastUsed(id: string): void {
    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, id);
    } catch {
      // Private mode: nothing to remember.
    }
  }
}
