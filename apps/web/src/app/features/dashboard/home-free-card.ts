import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideChevronRight } from '@lucide/angular';
import type { Dashboard } from '@platin/contracts';
import { dateParts, lastDayOf, Money, Period } from '@platin/domain';
import { PlBottomSheet, PlMoney, PlStackedBar, PlStackSegment } from '@platin/web-ui';
import { DASHBOARD_TEXTS } from './dashboard.texts';
import { HomeToPay, ToPayData } from './home-to-pay';

/**
 * DAS-07 (1): what is left to spend this month, per day until its end, and how what there is
 * splits into to pay, card later and free (DAS-05). "Para pagar este mes" opens its list.
 */
@Component({
  selector: 'pl-home-free-card',
  imports: [PlMoney, PlStackedBar, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = dashboard();
    <section
      class="flex h-full flex-wrap items-center gap-x-7 gap-y-4 rounded-card bg-surface p-5 xl:p-6"
      [attr.aria-label]="texts.leftToSpend"
    >
      <div class="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <p class="text-[15px] text-muted">{{ past() ? texts.free : texts.leftToSpend }}</p>
        <pl-money
          class="text-[40px] leading-tight font-bold tracking-tight xl:text-5xl"
          [amount]="d.free"
          [currency]="d.currency"
          [decimals]="false"
        />
        @if (past()) {
          <p class="text-[13px] text-muted">{{ texts.pastHint }}</p>
        } @else if (d.perDay) {
          <p
            class="self-start rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-strong"
          >
            ≈ <pl-money [amount]="d.perDay" [currency]="d.currency" [decimals]="false" />
            {{ texts.perDay }} {{ lastDay() }}
          </p>
        } @else {
          <p class="self-start rounded-full bg-field px-3 py-1.5 text-sm font-semibold">
            {{ texts.noFree }}
          </p>
          @if (negative()) {
            <p class="text-sm text-expense-ink">
              {{ texts.missing }}
              <pl-money [amount]="missing()" [currency]="d.currency" [decimals]="false" />
              {{ texts.missingRest }}
            </p>
          }
        }
      </div>

      @if (!past()) {
        <div class="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
          <p class="text-sm text-muted">
            {{ texts.splitPrefix }}
            <pl-money
              class="text-ink"
              [amount]="available()"
              [currency]="d.currency"
              [decimals]="false"
            />
            {{ texts.splitSuffix }}
          </p>
          <pl-stacked-bar [segments]="segments()" [currency]="d.currency" />
          <div class="flex flex-col">
            <button
              type="button"
              class="flex min-h-12 items-center gap-2.5 rounded-xl text-left"
              (click)="openToPay()"
            >
              <span class="size-2.5 shrink-0 rounded-full bg-pending" aria-hidden="true"></span>
              <span class="flex-1 text-[15px]">{{ texts.toPayMonth }}</span>
              <pl-money
                class="text-[15px]"
                [amount]="d.toPay"
                [currency]="d.currency"
                [decimals]="false"
              />
              <svg lucideChevronRight class="shrink-0 text-muted" [size]="18"></svg>
            </button>
            <div class="flex min-h-11 items-center gap-2.5 border-t border-line-soft">
              <span class="size-2.5 shrink-0 rounded-full bg-card" aria-hidden="true"></span>
              <span class="flex-1 text-[15px]">{{ texts.cardNext }}</span>
              <pl-money
                class="mr-7 text-[15px]"
                [amount]="d.cardLater"
                [currency]="d.currency"
                [decimals]="false"
              />
            </div>
            <div class="flex min-h-11 items-center gap-2.5 border-t border-line-soft">
              <span class="size-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
              <span class="flex-1 text-[15px] font-bold">{{ texts.freeShort }}</span>
              <pl-money
                class="mr-7 text-[15px] font-bold"
                [amount]="d.free"
                [currency]="d.currency"
                [decimals]="false"
              />
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class HomeFreeCard {
  readonly dashboard = input.required<Dashboard>();
  /** A previous month only shows what was left in the accounts on its last day. */
  readonly past = input(false);
  protected readonly texts = DASHBOARD_TEXTS;
  private readonly sheet = inject(PlBottomSheet);

  private readonly free = computed(() => {
    const d = this.dashboard();
    return Money.of(d.free, d.currency);
  });
  protected readonly negative = computed(() => this.free().isNegative());
  protected readonly missing = computed(() => this.free().abs().toString());

  /** "En tus cuentas + por cobrar": what the bar splits. */
  protected readonly available = computed(() => {
    const d = this.dashboard();
    return Money.of(d.inAccounts, d.currency).add(Money.of(d.toCollect, d.currency)).toString();
  });

  /** "30/11". */
  protected readonly lastDay = computed(() => {
    const { day, month } = dateParts(lastDayOf(this.dashboard().period as Period));
    return `${day}/${month}`;
  });

  protected readonly segments = computed<PlStackSegment[]>(() => {
    const d = this.dashboard();
    return [
      { label: this.texts.toPayMonth, amount: d.toPay, tone: 'pending' },
      { label: this.texts.cardNext, amount: d.cardLater, tone: 'card' },
      { label: this.texts.freeShort, amount: d.free, tone: 'brand' },
    ];
  });

  protected openToPay(): void {
    const d = this.dashboard();
    this.sheet.open(HomeToPay, {
      data: { items: d.toPayItems, currency: d.currency, total: d.toPay } satisfies ToPayData,
      ariaLabel: this.texts.toPayTitle,
    });
  }
}
