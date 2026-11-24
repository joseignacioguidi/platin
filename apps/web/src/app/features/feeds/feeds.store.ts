import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  ConvertTransactionRequest,
  ConvertTransactionResponse,
  FeedConnectResponse,
  FeedReserve,
  FeedsResponse,
  HeldMovement,
  RetryHeldResponse,
  UnlinkExternalMovementResponse,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** Only Mercado Pago for now (ADR 0037). */
export const MP_SLUG = 'mercado-pago';
const BASE = `${API}/feeds/${MP_SLUG}`;

/** What applying institution movements can change. */
const AFFECTED: DataKey[] = ['feeds', 'movements', 'accounts', 'dashboard', 'goals'];

/** MPG-01 to 10: the Mercado Pago connection, its reserves and "Para revisar". */
@Injectable({ providedIn: 'root' })
export class FeedsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<FeedsResponse>(() => `${API}/feeds`);
  /** Mercado Pago when the server has it configured; undefined otherwise (the section hides). */
  readonly mercadoPago = computed(() =>
    this.resource.value()?.providers.find((p) => p.provider === 'MERCADO_PAGO'),
  );
  readonly connection = computed(() => this.mercadoPago()?.connection ?? null);

  readonly reserves = httpResource<FeedReserve[]>(() =>
    this.connection() ? `${BASE}/reserves` : undefined,
  );
  readonly held = httpResource<HeldMovement[]>(() =>
    this.connection() ? `${BASE}/held` : undefined,
  );

  constructor() {
    reloadOn(this.bus, ['feeds'], () => {
      this.resource.reload();
      this.reserves.reload();
      this.held.reload();
    });
  }

  /** MPG-01: the server sets the feed_tx cookie in this response; then the browser leaves. */
  async connect(): Promise<string> {
    const res = await firstValueFrom(this.http.post<FeedConnectResponse>(`${BASE}/connect`, {}));
    return res.authorizationUrl;
  }

  setAccount(accountId: string): Promise<void> {
    return this.write(this.http.patch<void>(BASE, { accountId }));
  }

  assignReserve(reserveId: string, pocketId: string): Promise<void> {
    return this.write(this.http.put<void>(`${BASE}/reserves/${reserveId}`, { pocketId }));
  }

  retryHeld(): Promise<RetryHeldResponse> {
    return this.write(this.http.post<RetryHeldResponse>(`${BASE}/held/retry`, {}));
  }

  dismissHeld(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${BASE}/held/${id}`));
  }

  disconnect(): Promise<void> {
    return this.write(this.http.delete<void>(BASE));
  }

  /** MPG-08: "Es una transferencia mía" / "Es el pago de una tarjeta". */
  convert(
    transactionId: string,
    request: ConvertTransactionRequest,
  ): Promise<ConvertTransactionResponse> {
    return this.write(
      this.http.post<ConvertTransactionResponse>(
        `${API}/transactions/${transactionId}/convert`,
        request,
      ),
      ['cards', 'commitments'],
    );
  }

  /** MPG-06: "No es el mismo". */
  unlink(externalMovementId: string): Promise<UnlinkExternalMovementResponse> {
    return this.write(
      this.http.post<UnlinkExternalMovementResponse>(
        `${API}/external-movements/${externalMovementId}/unlink`,
        {},
      ),
    );
  }

  private async write<T>(request: Observable<T>, extra: DataKey[] = []): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED, ...extra);
    return result;
  }
}
