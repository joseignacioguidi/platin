import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { Movement } from '@platin/contracts';
import { Currency, LocalDate, Money, parseLocalDate } from '@platin/domain';
import { formatDayHeader, PlMoney } from '@platin/web-ui';
import { Today } from '../../core/today';
import { MovementRow } from './movement-row';

interface DayGroup {
  date: LocalDate;
  label: string;
  total: Money;
  items: Movement[];
}

/**
 * Movements grouped by day with each day's net total (confirmed income − expenses in base
 * currency; transfers and pending movements don't add up).
 */
@Component({
  selector: 'pl-movement-groups',
  imports: [MovementRow, PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @for (group of groups(); track group.date) {
      <section class="flex flex-col gap-2">
        <header
          class="flex items-baseline justify-between px-2 text-[15px] font-semibold text-muted"
        >
          <h3>{{ group.label }}</h3>
          @if (!group.total.isZero()) {
            <span class="font-amount inline-flex gap-[1ch] font-normal">
              <span>{{ group.total.isNegative() ? '-' : '+' }}</span>
              <pl-money [amount]="group.total.abs()" sign="never" />
            </span>
          }
        </header>
        <ul class="rounded-tile bg-surface px-4">
          @for (movement of group.items; track movement.kind + movement.id) {
            <li class="border-b border-line-soft last:border-b-0">
              <button
                type="button"
                class="block w-full rounded-xl text-left focus-visible:outline-offset-[-2px]"
                (click)="selected.emit(movement)"
              >
                <pl-movement-row [movement]="movement" />
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class MovementGroups {
  readonly movements = input.required<Movement[]>();
  readonly baseCurrency = input<Currency>('ARS');
  readonly selected = output<Movement>();

  private readonly today = inject(Today);

  protected readonly groups = computed<DayGroup[]>(() => {
    const base = this.baseCurrency();
    const groups: DayGroup[] = [];
    for (const movement of this.movements()) {
      const date = parseLocalDate(movement.date);
      let group = groups[groups.length - 1];
      if (!group || group.date !== date) {
        group = {
          date,
          label: formatDayHeader(date, this.today.date()),
          total: Money.zero(base),
          items: [],
        };
        groups.push(group);
      }
      group.items.push(movement);
      if (movement.kind === 'TRANSACTION' && movement.status === 'CONFIRMED') {
        const amount = Money.of(movement.baseAmount, base);
        if (movement.type === 'INCOME') group.total = group.total.add(amount);
        if (movement.type === 'EXPENSE') group.total = group.total.subtract(amount);
      }
    }
    return groups;
  });
}
