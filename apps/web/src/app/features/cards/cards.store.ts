import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  Card,
  Charge,
  CloseStatementRequest,
  CreateCardRequest,
  ChargesPage,
  CreateChargeRequest,
  PayStatementRequest,
  StatementSummary,
  UpdateCardRequest,
  UpdateChargeRequest,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** What a card write can change. */
const AFFECTED: DataKey[] = ['cards', 'movements', 'accounts', 'dashboard', 'commitments'];

@Injectable({ providedIn: 'root' })
export class CardsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<Card[]>(() => `${API}/cards`);
  readonly cards = computed(() => this.resource.value() ?? []);

  constructor() {
    reloadOn(this.bus, ['cards'], () => this.resource.reload());
  }

  byId(id: string | null | undefined): Card | undefined {
    return this.cards().find((card) => card.id === id);
  }

  create(request: CreateCardRequest): Promise<Card> {
    return this.write(this.http.post<Card>(`${API}/cards`, request));
  }

  update(id: string, changes: UpdateCardRequest): Promise<Card> {
    return this.write(this.http.patch<Card>(`${API}/cards/${id}`, changes));
  }

  createCharge(cardId: string, request: CreateChargeRequest): Promise<Charge> {
    return this.write(this.http.post<Charge>(`${API}/cards/${cardId}/charges`, request));
  }

  /** TAR-12: closed statements, newest first; `cursor` = period of the last one shown. */
  statementHistory(cardId: string, cursor?: string, limit = 12): Promise<StatementSummary[]> {
    const params: Record<string, string> = { status: 'closed', limit: String(limit) };
    if (cursor) params['cursor'] = cursor;
    return firstValueFrom(
      this.http.get<StatementSummary[]>(`${API}/cards/${cardId}/statements`, { params }),
    );
  }

  /** TAR-13: a page of the purchase history. */
  chargesPage(filters: Record<string, string | undefined>): Promise<ChargesPage> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    return firstValueFrom(this.http.get<ChargesPage>(`${API}/charges`, { params }));
  }

  getCharge(id: string): Promise<Charge> {
    return firstValueFrom(this.http.get<Charge>(`${API}/charges/${id}`));
  }

  updateCharge(id: string, changes: UpdateChargeRequest): Promise<Charge> {
    return this.write(this.http.patch<Charge>(`${API}/charges/${id}`, changes));
  }

  removeCharge(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${API}/charges/${id}`));
  }

  close(statementId: string, request: CloseStatementRequest): Promise<StatementSummary> {
    return this.write(
      this.http.post<StatementSummary>(`${API}/statements/${statementId}/close`, request),
    );
  }

  pay(statementId: string, request: PayStatementRequest): Promise<StatementSummary> {
    return this.write(
      this.http.post<StatementSummary>(`${API}/statements/${statementId}/payments`, request),
    );
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED);
    return result;
  }
}
