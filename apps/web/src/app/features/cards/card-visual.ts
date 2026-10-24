import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Card } from '@platin/contracts';
import { daysBetween, parseLocalDate } from '@platin/domain';
import { dateBadge, PlMoney } from '@platin/web-ui';
import { Today } from '../../core/today';
import { CARDS_TEXTS } from './cards.texts';

/** The card as a physical violet card with its open statement (mockup "Tarjeta con cuotas"). */
@Component({
  selector: 'pl-card-visual',
  imports: [PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-6 rounded-card bg-card p-5 text-on-card">
      <div class="flex items-center justify-between text-[15px]">
        <span class="font-semibold">{{ compact() ? card().name : texts.openStatement }}</span>
        @if (card().last4) {
          <span class="font-amount tracking-widest">•••• {{ card().last4 }}</span>
        }
      </div>
      <div class="flex flex-col">
        <pl-money
          class="text-4xl font-semibold tracking-tight"
          [amount]="statement()?.totals?.ARS ?? '0'"
          currency="ARS"
        />
        @if (hasUsd()) {
          <span class="font-amount text-lg">
            + <pl-money [amount]="statement()?.totals?.USD ?? '0'" currency="USD" />
          </span>
        }
      </div>
      @if (statement(); as s) {
        <div class="flex items-center justify-between gap-2 text-[15px]">
          <span>
            {{ texts.closes }} <strong>{{ closing() }}</strong> · {{ texts.inDays(daysToClose()) }}
          </span>
          <span
            >{{ texts.due }} <strong>{{ due() }}</strong></span
          >
        </div>
      }
    </div>
  `,
})
export class CardVisual {
  readonly card = input.required<Card>();
  /** In lists the card shows its name instead of "Resumen abierto". */
  readonly compact = input(false);

  protected readonly texts = CARDS_TEXTS;
  private readonly today = inject(Today);

  protected readonly statement = computed(() => this.card().openStatement);
  protected readonly hasUsd = computed(() => (this.statement()?.totals.USD ?? '0.00') !== '0.00');
  protected readonly closing = computed(() => this.short(this.statement()?.closingDate));
  protected readonly due = computed(() => this.short(this.statement()?.dueDate));
  protected readonly daysToClose = computed(() => {
    const closing = this.statement()?.closingDate;
    return closing ? Math.max(0, daysBetween(this.today.date(), parseLocalDate(closing))) : 0;
  });

  private short(date: string | undefined): string {
    if (!date) return '';
    const badge = dateBadge(parseLocalDate(date));
    return `${Number(badge.day)} ${badge.month.toLowerCase()}`;
  }
}
