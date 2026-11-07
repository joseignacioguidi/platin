import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Dashboard, DashboardAccount, ToPayItem } from '@platin/contracts';
import { Currency, Money, parsePeriod } from '@platin/domain';
import { formatPeriod, PlMoney } from '@platin/web-ui';
import { DASHBOARD_TEXTS } from './dashboard.texts';
import { payDay, toPayTitle } from './home-to-pay';

interface AccountView {
  key: string;
  name: string;
  currency: Currency;
  /** What it has to spend; null for the payments without an account. */
  spendable: string | null;
  toPay: string;
  /** What is missing to cover its payments; null when it covers them or has no account. */
  shortfall: string | null;
  covered: boolean;
  payments: ToPayItem[];
  paymentsCount: number;
}

/**
 * DAS-07 (5): one card with a section per account: what it has to spend, what it pays this month
 * and whether it covers it, and its next payments of the month. What has no payment account goes
 * last; all the month's payments at the foot.
 */
@Component({
  selector: 'pl-home-accounts',
  imports: [RouterLink, PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2.5' },
  template: `
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-extrabold xl:text-base">{{ texts.accounts }}</h2>
      <a
        routerLink="/app/cuentas"
        class="flex min-h-11 items-center text-[15px] font-semibold text-brand-strong xl:text-sm"
        >{{ texts.see }}</a
      >
    </div>
    <div class="flex flex-col rounded-tile bg-surface px-4 xl:px-5">
      @for (account of views(); track account.key; let first = $first) {
        <section
          class="flex flex-col gap-2 py-4"
          [class.border-t]="!first"
          [class.border-line]="!first"
          [attr.aria-label]="account.name"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="flex min-w-0 flex-col gap-0.5">
              <h3 class="truncate text-base font-bold">{{ account.name }}</h3>
              @if (account.paymentsCount === 0) {
                <span class="text-[13px] text-muted">{{ texts.noPayments }}</span>
              }
            </span>
            @if (account.spendable !== null) {
              <pl-money
                class="shrink-0 text-base font-semibold"
                [amount]="account.spendable"
                [currency]="account.currency"
                [decimals]="false"
              />
            }
          </div>
          @if (account.paymentsCount > 0) {
            <p class="text-[13px] text-muted">
              @if (account.spendable !== null) {
                {{ texts.pays }}
              }
              <pl-money
                class="text-ink"
                [amount]="account.toPay"
                [currency]="account.currency"
                [decimals]="false"
              />
              {{ texts.thisMonth }}
              @if (account.covered) {
                · {{ texts.covered }}
              } @else if (account.shortfall) {
                ·
                <span class="font-semibold text-expense-ink"
                  >{{ texts.lacks }}
                  <pl-money
                    [amount]="account.shortfall"
                    [currency]="account.currency"
                    [decimals]="false"
                /></span>
              }
            </p>
            <ul class="flex flex-col border-t border-line-soft">
              @for (payment of account.payments; track $index) {
                <li
                  class="flex min-h-12 items-center gap-3 border-b border-line-soft last:border-b-0 xl:min-h-11"
                >
                  <span class="font-amount w-14 shrink-0 text-[13px] text-muted xl:text-xs">{{
                    day(payment.date)
                  }}</span>
                  <span class="min-w-0 flex-1 truncate text-[15px] xl:text-sm">{{
                    title(payment)
                  }}</span>
                  <pl-money
                    class="text-[15px] xl:text-sm"
                    [amount]="payment.amount"
                    [currency]="payment.currency"
                    [decimals]="false"
                  />
                </li>
              }
            </ul>
          }
        </section>
      }
      @if (paymentsCount() > 0) {
        <a
          routerLink="/app/compromisos"
          class="-mx-4 flex min-h-12 items-center border-t border-line px-4 text-sm font-semibold text-brand-strong xl:-mx-5 xl:px-5"
          >{{ texts.seePayments(paymentsCount(), month()) }}</a
        >
      }
    </div>
  `,
})
export class HomeAccounts {
  readonly dashboard = input.required<Dashboard>();
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly title = toPayTitle;
  protected readonly day = payDay;

  /** "noviembre". */
  protected readonly month = computed(() =>
    formatPeriod(parsePeriod(this.dashboard().period)).split(' ')[0].toLowerCase(),
  );

  /** All of the month's payments. */
  protected readonly paymentsCount = computed(() => this.dashboard().toPayItems.length);

  protected readonly views = computed<AccountView[]>(() => {
    const d = this.dashboard();
    const views = d.accounts.map((a: DashboardAccount): AccountView => ({
      key: `${a.accountId}|${a.currency}`,
      name: a.currency === d.currency ? a.name : `${a.name} · ${a.currency}`,
      currency: a.currency,
      spendable: a.spendable,
      toPay: a.toPay,
      shortfall: Money.of(a.shortfall, a.currency).isZero() ? null : a.shortfall,
      covered: Money.of(a.shortfall, a.currency).isZero(),
      payments: a.payments,
      paymentsCount: a.paymentsCount,
    }));
    if (d.unassigned) {
      views.push({
        key: 'unassigned',
        name: this.texts.unassigned,
        currency: d.currency,
        spendable: null,
        toPay: d.unassigned.toPay,
        shortfall: null,
        covered: false,
        payments: d.unassigned.payments,
        paymentsCount: d.unassigned.paymentsCount,
      });
    }
    return views;
  });
}
