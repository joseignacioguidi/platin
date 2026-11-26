import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  CreateValuationsRequest,
  HoldingAdjustment,
  HoldingAdjustmentRequest,
  HoldingAdjustmentsResponse,
  HoldingRequest,
  InvestmentPocket,
  Investments,
  TermDepositRequest,
  ValuationsResponse,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** A valuation changes balances, movements, savings and the home reminder. */
const AFFECTED: DataKey[] = ['accounts', 'movements', 'dashboard', 'goals'];

/** INV-03..05: investment pockets with their summary, and the valuations. */
@Injectable({ providedIn: 'root' })
export class InvestmentsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<Investments>(() => `${API}/investments`);
  readonly investments = computed(() => this.resource.value());
  /** Every investment pocket, account after account. */
  readonly pockets = computed(() =>
    (this.investments()?.accounts ?? []).flatMap((account) => account.pockets),
  );

  constructor() {
    reloadOn(this.bus, ['accounts', 'movements'], () => this.resource.reload());
  }

  valuationsOf(pocketId: string): Promise<ValuationsResponse> {
    return firstValueFrom(
      this.http.get<ValuationsResponse>(`${API}/pockets/${pocketId}/valuations`),
    );
  }

  saveValuations(request: CreateValuationsRequest): Promise<ValuationsResponse> {
    return this.write(this.http.post<ValuationsResponse>(`${API}/investments/valuations`, request));
  }

  /** One investment with its pricing (also archived), for its detail. */
  pocket(pocketId: string): Promise<InvestmentPocket> {
    return firstValueFrom(this.http.get<InvestmentPocket>(`${API}/pockets/${pocketId}/investment`));
  }

  /** INV-12: the terms of a term deposit; changing them renews it. */
  saveTermDeposit(pocketId: string, request: TermDepositRequest): Promise<InvestmentPocket> {
    return this.write(
      this.http.put<InvestmentPocket>(`${API}/pockets/${pocketId}/term-deposit`, request),
    );
  }

  /** INV-07: links the investment to an instrument with the units it has. */
  link(pocketId: string, request: HoldingRequest): Promise<InvestmentPocket> {
    return this.write(
      this.http.put<InvestmentPocket>(`${API}/pockets/${pocketId}/holding`, request),
    );
  }

  /** "Pasar a manual": the history stays. */
  unlink(pocketId: string): Promise<InvestmentPocket> {
    return this.write(this.http.delete<InvestmentPocket>(`${API}/pockets/${pocketId}/holding`));
  }

  adjustments(pocketId: string): Promise<HoldingAdjustmentsResponse> {
    return firstValueFrom(
      this.http.get<HoldingAdjustmentsResponse>(`${API}/pockets/${pocketId}/holding/adjustments`),
    );
  }

  /** INV-10: corrects the units without moving money. */
  addAdjustment(pocketId: string, request: HoldingAdjustmentRequest): Promise<HoldingAdjustment> {
    return this.write(
      this.http.post<HoldingAdjustment>(`${API}/pockets/${pocketId}/holding/adjustments`, request),
    );
  }

  removeAdjustment(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${API}/holding-adjustments/${id}`));
  }

  /** The pricing of an investment from the loaded list, when it is linked to an instrument. */
  marketPricing(pocketId: string | null | undefined) {
    const pricing = this.pockets().find((p) => p.id === pocketId)?.pricing;
    return pricing?.mode === 'MARKET' ? pricing : null;
  }

  removeValuation(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${API}/valuations/${id}`));
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED);
    return result;
  }
}
