import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { HoldingAdjustmentsResponse, InvestmentPocket } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { formatDate, PlBottomSheet, PlButton, PlMoney } from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { errorMessage } from '../../core/errors';
import { AdjustUnitsSheet } from './adjust-units-sheet';
import { PRICED_INSTRUMENTS } from './holding-fields';
import { HoldingSheet } from './holding-sheet';
import { formatRate, formatUnits, percentFromTna } from './investment-format';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';
import { TermDepositSheet } from './term-deposit-sheet';

/**
 * The detail of an investment in its pocket: a linked one with its units, price and live value
 * (INV-08, 10), or a term deposit with its terms (INV-12). One that goes by hand offers to link
 * it when its type has prices.
 */
@Component({
  selector: 'pl-investment-card',
  imports: [PlMoney, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (investment(); as inv) {
      @if (inv.pricing.termDeposit; as terms) {
        <section class="flex flex-col gap-3 rounded-tile bg-surface p-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-[17px] font-semibold">{{ t.terms.title }}</h2>
            @if (terms.matured) {
              <span
                class="rounded-full bg-pending-soft px-3 py-1 text-sm font-semibold text-pending-ink"
              >
                {{ t.pricing.matured }}
              </span>
            } @else if (terms.redeemed) {
              <span class="rounded-full bg-field px-3 py-1 text-sm text-muted">
                {{ t.pricing.redeemed }}
              </span>
            }
          </div>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.card.value }}</dt>
              <dd>
                <pl-money
                  class="text-xl font-semibold"
                  [amount]="inv.pricing.marketValue"
                  [currency]="inv.currency"
                />
              </dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.card.interest }}</dt>
              <dd class="font-amount text-xl" [class.text-brand-strong]="!negative()">
                <pl-money [amount]="inv.pricing.liveYield" [currency]="inv.currency" sign="always" />
              </dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.terms.principal }}</dt>
              <dd><pl-money [amount]="terms.principal" [currency]="inv.currency" /></dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.card.tna }}</dt>
              <dd class="font-amount">{{ tna() }}</dd>
            </div>
          </dl>
          <p class="font-amount text-sm text-muted">{{ period() }}</p>
          <p class="text-sm text-muted">{{ t.card.monthEnd }}</p>
          @if (!archived()) {
            <button plButton="secondary" type="button" class="self-start" (click)="editTerms(inv)">
              {{ t.terms.edit }}
            </button>
          }
        </section>
      } @else if (inv.pricing.mode === 'MARKET' && inv.pricing.listing; as listing) {
        <section class="flex flex-col gap-3 rounded-tile bg-surface p-4">
          <div class="flex flex-col">
            <h2 class="text-[17px] font-semibold">{{ listing.symbol }}</h2>
            <span class="text-sm text-muted">{{ listing.name }}</span>
          </div>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.card.value }}</dt>
              <dd>
                <pl-money
                  class="text-xl font-semibold"
                  [amount]="inv.pricing.marketValue"
                  [currency]="inv.currency"
                />
              </dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.card.yield }}</dt>
              <dd class="font-amount text-xl" [class.text-brand-strong]="!negative()">
                <pl-money [amount]="inv.pricing.liveYield" [currency]="inv.currency" sign="always" />
                @if (inv.pricing.liveYieldRate) {
                  <span class="text-sm"> · {{ rate(inv.pricing.liveYieldRate) }}</span>
                }
              </dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ unitsName() }}</dt>
              <dd class="font-amount">{{ units(inv.pricing.units) }}</dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ t.card.price }}</dt>
              <dd>
                @if (inv.pricing.price) {
                  <pl-money [amount]="inv.pricing.price" [currency]="inv.currency" />
                } @else {
                  <span class="text-sm text-muted">{{ t.pricing.noPrice }}</span>
                }
              </dd>
            </div>
          </dl>
          @if (priceText(); as text) {
            <p
              class="text-sm"
              [class]="inv.pricing.stale ? 'rounded-2xl bg-pending-soft px-3 py-2 text-pending-ink' : 'text-muted'"
              [attr.role]="inv.pricing.stale ? 'status' : null"
            >
              {{ text }}
            </p>
          }
          <p class="text-sm text-muted">{{ t.card.monthEnd }}</p>
          @if (adjustments().length > 0) {
            <div class="flex flex-col gap-1">
              <h3 class="text-sm font-semibold">{{ t.adjust.history }}</h3>
              <ul class="flex flex-col">
                @for (item of adjustments(); track item.id) {
                  <li class="flex min-h-11 items-center gap-3 text-sm">
                    <span class="font-amount w-20 shrink-0 text-muted">{{ day(item.date) }}</span>
                    <span class="font-amount">
                      {{ item.direction === 'IN' ? '+' : '−' }}{{ units(item.units) }}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-muted">{{ item.note }}</span>
                    @if (!archived()) {
                      <button
                        type="button"
                        class="min-h-11 shrink-0 px-2 text-muted underline"
                        [attr.aria-label]="t.adjust.remove(day(item.date))"
                        (click)="removeAdjustment(item.id)"
                      >
                        ×
                      </button>
                    }
                  </li>
                }
              </ul>
            </div>
          }
          @if (error()) {
            <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
          }
          @if (!archived()) {
            @if (confirmUnlink()) {
              <div class="flex flex-col gap-2 rounded-2xl bg-field p-3">
                <p class="text-sm">{{ t.link.unlinkConfirm }}</p>
                <div class="flex flex-wrap gap-2">
                  <button plButton="secondary" size="sm" type="button" (click)="unlink(inv)">
                    {{ t.link.unlinkYes }}
                  </button>
                  <button plButton="ghost" size="sm" type="button" (click)="confirmUnlink.set(false)">
                    {{ t.link.cancel }}
                  </button>
                </div>
              </div>
            } @else {
              <div class="flex flex-wrap gap-2">
                <button plButton="secondary" type="button" (click)="adjust(inv)">
                  {{ t.adjust.title }}
                </button>
                <button plButton="ghost" type="button" (click)="confirmUnlink.set(true)">
                  {{ t.link.unlink }}
                </button>
              </div>
            }
          }
        </section>
      } @else if (inv.instrument === 'TERM_DEPOSIT' && !archived()) {
        <section class="flex flex-col gap-3 rounded-tile border border-dashed border-line p-4">
          <p class="text-[15px]">{{ t.card.noTerms }}</p>
          <button plButton="secondary" type="button" class="self-start" (click)="editTerms(inv)">
            {{ t.terms.add }}
          </button>
        </section>
      } @else if (linkable(inv) && !archived()) {
        <section class="flex flex-col gap-3 rounded-tile border border-dashed border-line p-4">
          <p class="text-[15px]">{{ t.link.linkHint }}</p>
          <button plButton="secondary" type="button" class="self-start" (click)="link(inv)">
            {{ t.link.linkAction }}
          </button>
        </section>
      }
    }
  `,
})
export class InvestmentCard {
  readonly pocketId = input.required<string>();
  readonly archived = input(false);
  protected readonly t = {
    terms: INVESTMENTS_TEXTS.termDeposit,
    card: INVESTMENTS_TEXTS.card,
    pricing: INVESTMENTS_TEXTS.pricing,
    link: INVESTMENTS_TEXTS.link,
    adjust: INVESTMENTS_TEXTS.adjust,
  };
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);
  private readonly store = inject(InvestmentsStore);
  protected readonly resource = httpResource<InvestmentPocket>(
    () => `${API}/pockets/${this.pocketId()}/investment`,
  );
  private readonly adjustmentsResource = httpResource<HoldingAdjustmentsResponse>(() =>
    this.resource.value()?.pricing.mode === 'MARKET'
      ? `${API}/pockets/${this.pocketId()}/holding/adjustments`
      : undefined,
  );
  protected readonly investment = computed(() => this.resource.value());
  protected readonly adjustments = computed(() => this.adjustmentsResource.value()?.items ?? []);
  protected readonly confirmUnlink = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly negative = computed(
    () => this.investment()?.pricing.liveYield.startsWith('-') ?? false,
  );
  protected readonly unitsName = computed(
    () => INVESTMENTS_TEXTS.units.names[this.investment()?.pricing.listing?.type ?? 'OTHER'],
  );
  protected readonly priceText = computed(() => {
    const pricing = this.investment()?.pricing;
    if (!pricing?.priceDate) return null;
    const date = formatDate(parseLocalDate(pricing.priceDate));
    return pricing.stale ? this.t.pricing.stale(date) : this.t.pricing.priceAt(date);
  });
  protected readonly tna = computed(() => {
    const terms = this.investment()?.pricing.termDeposit;
    return terms ? `${percentFromTna(terms.tna)} %` : '';
  });
  protected readonly period = computed(() => {
    const terms = this.investment()?.pricing.termDeposit;
    if (!terms) return '';
    return this.t.card.period(
      formatDate(parseLocalDate(terms.startDate)),
      formatDate(parseLocalDate(terms.endDate)),
    );
  });

  constructor() {
    reloadOn(this.bus, ['accounts', 'movements'], () => {
      this.resource.reload();
      this.adjustmentsResource.reload();
    });
  }

  protected linkable(investment: InvestmentPocket): boolean {
    return PRICED_INSTRUMENTS.includes(investment.instrument ?? 'OTHER');
  }

  protected rate(value: string): string {
    return formatRate(value);
  }

  protected units(value: string | null): string {
    return value ? formatUnits(value) : '—';
  }

  protected day(value: string): string {
    return formatDate(parseLocalDate(value));
  }

  protected editTerms(investment: InvestmentPocket): void {
    this.sheet.open(TermDepositSheet, { data: investment, ariaLabel: this.t.terms.title });
  }

  protected link(investment: InvestmentPocket): void {
    this.sheet.open(HoldingSheet, { data: investment, ariaLabel: this.t.link.linkAction });
  }

  protected adjust(investment: InvestmentPocket): void {
    this.sheet.open(AdjustUnitsSheet, { data: investment, ariaLabel: this.t.adjust.title });
  }

  protected async unlink(investment: InvestmentPocket): Promise<void> {
    await this.run(() => this.store.unlink(investment.id));
    this.confirmUnlink.set(false);
  }

  protected async removeAdjustment(id: string): Promise<void> {
    await this.run(() => this.store.removeAdjustment(id));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
