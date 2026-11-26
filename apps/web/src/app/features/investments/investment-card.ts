import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { InvestmentPocket } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { formatDate, PlBottomSheet, PlButton, PlMoney } from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { percentFromTna } from './investment-format';
import { INVESTMENTS_TEXTS } from './investments.texts';
import { TermDepositSheet } from './term-deposit-sheet';

/**
 * The detail of an investment in its pocket: the calculated value of a term deposit with its
 * terms (INV-12). Manual investments show nothing here: their value is their balance.
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
              <span class="rounded-full bg-pending-soft px-3 py-1 text-sm font-semibold text-pending-ink">
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
      } @else if (inv.instrument === 'TERM_DEPOSIT' && !archived()) {
        <section class="flex flex-col gap-3 rounded-tile border border-dashed border-line p-4">
          <p class="text-[15px]">{{ t.card.noTerms }}</p>
          <button plButton="secondary" type="button" class="self-start" (click)="editTerms(inv)">
            {{ t.terms.add }}
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
  };
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);
  protected readonly resource = httpResource<InvestmentPocket>(
    () => `${API}/pockets/${this.pocketId()}/investment`,
  );
  protected readonly investment = computed(() => this.resource.value());
  protected readonly negative = computed(
    () => this.investment()?.pricing.liveYield.startsWith('-') ?? false,
  );
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
    reloadOn(this.bus, ['accounts', 'movements'], () => this.resource.reload());
  }

  protected editTerms(investment: InvestmentPocket): void {
    this.sheet.open(TermDepositSheet, { data: investment, ariaLabel: this.t.terms.title });
  }
}
