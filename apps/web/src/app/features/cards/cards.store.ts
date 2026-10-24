import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  Card,
  Charge,
  CloseStatementRequest,
  CreateCardRequest,
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
