import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Movement } from '@platin/contracts';
import { toDecimal } from '@platin/domain';
import { displayAmount, PlListItem, PlMoney, PlTone } from '@platin/web-ui';
import { TRANSACTIONS_TEXTS } from './transactions.texts';

interface RowView {
  heading: string;
  subtitle: string;
  icon: string;
  tone: PlTone;
  pending: boolean;
  lines: { sign: '-' | '+' | ''; amount: string; currency: 'ARS' | 'USD'; positive: boolean }[];
}

/** One movement as in the Movimientos mockup: tinted icon, title, subtitle and signed amounts. */
@Component({
  selector: 'pl-movement-row',
  imports: [PlListItem, PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-list-item
      [heading]="view().heading"
      [subtitle]="view().subtitle"
      [icon]="view().icon"
      [tone]="view().tone"
    >
      @if (view().pending) {
        <span badge class="rounded-full bg-pending px-2.5 py-0.5 text-xs font-semibold text-ink">
          {{ texts.pending }}
        </span>
      }
      @for (line of view().lines; track $index) {
        <span
          class="font-amount inline-flex gap-[1ch] whitespace-nowrap"
          [class.text-[17px]]="$first"
          [class.text-sm]="!$first"
          [class.text-brand-strong]="line.positive"
          [class.text-muted]="view().pending"
        >
          <span>{{ line.sign }}</span>
          <pl-money [amount]="line.amount" [currency]="line.currency" sign="never" />
        </span>
      }
    </pl-list-item>
  `,
})
export class MovementRow {
  readonly movement = input.required<Movement>();
  protected readonly texts = TRANSACTIONS_TEXTS;

  protected readonly view = computed<RowView>(() => {
    const m = this.movement();
    if (m.kind === 'TRANSFER') {
      const route = `${m.fromAccount.name} → ${m.toAccount?.name ?? ''}`;
      const rate = m.impliedRate
        ? ` · ${this.texts.at(displayAmount(toDecimal(m.impliedRate).toFixed(0)))}`
        : '';
      const cross = m.currencyIn !== m.currencyOut;
      return {
        heading: m.description || this.transferTitle(m.currencyOut, m.currencyIn),
        subtitle: route + rate,
        icon: 'arrow-left-right',
        tone: 'transfer',
        pending: false,
        lines: [
          { sign: '-', amount: m.amountOut, currency: m.currencyOut, positive: false },
          ...(cross
            ? [{ sign: '+' as const, amount: m.amountIn, currency: m.currencyIn, positive: true }]
            : []),
        ],
      };
    }
    const pending = m.status === 'PENDING';
    if (m.type === 'ADJUSTMENT') {
      const negative = m.amount.startsWith('-');
      return {
        heading: m.description || this.texts.adjustment,
        subtitle: m.account.name,
        icon: 'scale',
        tone: 'muted',
        pending,
        lines: [
          {
            sign: negative ? '-' : '+',
            amount: negative ? m.amount.slice(1) : m.amount,
            currency: m.currency,
            positive: !negative,
          },
        ],
      };
    }
    const income = m.type === 'INCOME';
    const category = m.category;
    return {
      heading: m.description || category?.name || this.texts.noCategory,
      subtitle: m.description
        ? [category?.name, m.account.name].filter(Boolean).join(' · ')
        : m.account.name,
      icon: category?.icon ?? 'receipt',
      tone: pending ? 'pending' : income ? 'brand' : (category?.color ?? 'expense'),
      pending,
      lines: [
        {
          sign: income ? '+' : '-',
          amount: m.amount,
          currency: m.currency,
          positive: income && !pending,
        },
      ],
    };
  });

  private transferTitle(out: string, into: string): string {
    if (out === 'ARS' && into === 'USD') return this.texts.buyDollars;
    if (out === 'USD' && into === 'ARS') return this.texts.sellDollars;
    return this.texts.transfer;
  }
}
