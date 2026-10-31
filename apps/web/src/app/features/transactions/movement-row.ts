import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Movement } from '@platin/contracts';
import { type Currency, parsePeriod } from '@platin/domain';
import {
  formatPeriodShort,
  formatRate,
  PL_CURRENCY_NAMES,
  PlListItem,
  PlMoney,
  PlTone,
} from '@platin/web-ui';
import { TRANSACTIONS_TEXTS } from './transactions.texts';

/** "Mercado Pago" for its Disponible, "Mercado Pago · Ahorro" for any other pocket. */
export function pocketPlace(pocket: { name: string; accountName: string; kind?: string }): string {
  return pocket.name === 'Disponible'
    ? pocket.accountName
    : `${pocket.accountName} · ${pocket.name}`;
}

const INTENT_ICONS: Record<'SAVE' | 'INVEST' | 'REDEEM', { icon: string; tone: PlTone }> = {
  SAVE: { icon: 'piggy-bank', tone: 'savings' },
  INVEST: { icon: 'trending-up', tone: 'card' },
  REDEEM: { icon: 'arrow-down-to-line', tone: 'transfer' },
};

interface RowView {
  heading: string;
  subtitle: string;
  icon: string;
  tone: PlTone;
  pending: boolean;
  lines: { sign: '-' | '+' | ''; amount: string; currency: Currency; positive: boolean }[];
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
  /** The pocket the list belongs to, if any: transfers into it read as money in. */
  readonly pocketId = input<string | null>(null);
  protected readonly texts = TRANSACTIONS_TEXTS;

  protected readonly view = computed<RowView>(() => {
    const m = this.movement();
    if (m.kind === 'CARD_CHARGE') {
      const plan =
        m.installmentsCount > 1 ? ` · ${this.texts.inInstallments(m.installmentsCount)}` : '';
      return {
        heading: m.description,
        subtitle: `${m.category.name} · ${m.card.name}${plan}`,
        icon: m.category.icon,
        tone: 'card',
        pending: false,
        lines: [{ sign: '-', amount: m.totalAmount, currency: m.currency, positive: false }],
      };
    }
    if (m.kind === 'TRANSFER' && m.statement) {
      return {
        heading:
          m.description && m.description !== 'Pago de tarjeta'
            ? m.description
            : this.texts.cardPayment(m.statement.cardName),
        subtitle: `${pocketPlace(m.fromPocket)} → ${this.texts.statementOf(formatPeriodShort(parsePeriod(m.statement.period)))}`,
        icon: 'credit-card',
        tone: 'transfer',
        pending: false,
        lines: [{ sign: '-', amount: m.amountOut, currency: m.currencyOut, positive: false }],
      };
    }
    if (m.kind === 'TRANSFER') {
      const to = m.toPocket;
      // Inside one account the account name is said once: "Mercado Pago · Disponible → Ahorro".
      const route =
        to && to.accountId === m.fromPocket.accountId
          ? `${m.fromPocket.accountName} · ${m.fromPocket.name} → ${to.name}`
          : `${pocketPlace(m.fromPocket)} → ${to ? pocketPlace(to) : ''}`;
      // Seen from the pocket that receives it, a transfer is money in.
      const incoming = !!to && to.id === this.pocketId();
      const rate = m.impliedRate
        ? ` · ${formatRate(m.currencyOut, m.currencyIn, m.impliedRate)}`
        : '';
      const cross = m.currencyIn !== m.currencyOut;
      const intent = !cross && m.intent && m.intent !== 'MOVE' ? m.intent : null;
      return {
        heading:
          m.description ||
          (intent ? this.texts.intents[intent] : this.transferTitle(m.currencyOut, m.currencyIn)),
        subtitle: route + rate,
        icon: intent ? INTENT_ICONS[intent].icon : 'arrow-left-right',
        tone: intent ? INTENT_ICONS[intent].tone : 'transfer',
        pending: false,
        lines: incoming
          ? [{ sign: '+', amount: m.amountIn, currency: m.currencyIn, positive: true }]
          : [
              { sign: '-', amount: m.amountOut, currency: m.currencyOut, positive: false },
              ...(cross
                ? [
                    {
                      sign: '+' as const,
                      amount: m.amountIn,
                      currency: m.currencyIn,
                      positive: true,
                    },
                  ]
                : []),
            ],
      };
    }
    const pending = m.status === 'PENDING';
    if (m.type === 'ADJUSTMENT' || m.type === 'YIELD') {
      const negative = m.amount.startsWith('-');
      const yields = m.type === 'YIELD';
      return {
        heading: m.description || (yields ? this.texts.yield : this.texts.adjustment),
        subtitle: pocketPlace(m.pocket),
        icon: yields ? 'trending-up' : 'scale',
        tone: yields ? 'savings' : 'muted',
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
        ? [category?.name, pocketPlace(m.pocket)].filter(Boolean).join(' · ')
        : pocketPlace(m.pocket),
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

  /** "Compra de dólares", "Venta de euros"; between two other currencies, "Cambio de moneda". */
  private transferTitle(out: Currency, into: Currency): string {
    if (out === 'ARS' && into !== 'ARS') return this.texts.buy(PL_CURRENCY_NAMES[into]);
    if (into === 'ARS' && out !== 'ARS') return this.texts.sell(PL_CURRENCY_NAMES[out]);
    if (out !== into) return this.texts.exchange;
    return this.texts.transfer;
  }
}
