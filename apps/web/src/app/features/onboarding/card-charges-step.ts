import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import type { Card, Charge, StartStatement } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import {
  formatDate,
  parseTypedAmount,
  PlMoney,
  PlSegmented,
  type PlSegmentOption,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { Today } from '../../core/today';
import { CardsStore } from '../cards/cards.store';
import { CARDS_TEXTS } from '../cards/cards.texts';
import { CategoriesStore } from '../categories/categories.store';
import { ONBOARDING_TEXTS } from './onboarding.texts';
import { FOOT_PRIMARY, FOOT_SECONDARY, OnboardingShell } from './onboarding-shell';
import { pickCategory } from './onboarding-steps';
import { AMOUNT_BOX, AMOUNT_INPUT, NUMBER_INPUT, sameName, TEXT_INPUT } from './onboarding-ui';

interface LoadedCharge {
  id: string;
  description: string;
  installmentAmount: string;
  start: number;
  count: number;
}

function toLoaded(charge: Charge): LoadedCharge {
  return {
    id: charge.id,
    description: charge.description,
    installmentAmount: charge.installments[0]?.amount ?? charge.totalAmount,
    start: charge.startInstallment,
    count: charge.installmentsCount,
  };
}

/**
 * Step 2, "Consumos de la …" (mockup 2c): purchases in installments already started ("voy por la
 * 6 de 9", TAR-03) and one total for the rest of the open statement ("Compras anteriores").
 */
@Component({
  selector: 'pl-onboarding-card-charges',
  imports: [OnboardingShell, PlMoney, PlSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-onboarding-shell
      [step]="2"
      [heading]="t.title(card().name)"
      [body]="t.body"
      (back)="closed.emit('back')"
    >
      <section class="flex flex-col rounded-tile bg-surface px-4 pb-4 pt-1">
        <p class="mb-2 mt-3 text-[13px] font-bold uppercase text-muted">{{ t.installments }}</p>
        @for (charge of loaded(); track charge.id) {
          <div class="flex min-h-14 items-center gap-3 border-t border-line py-2.5">
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[15px] font-bold">{{ charge.description }}</span>
              <span class="text-[13px] text-muted"
                >{{ t.goingFor }}
                <span class="font-amount">{{
                  t.goingForText(charge.start, charge.count)
                }}</span></span
              >
            </span>
            <span class="text-[15px]"
              ><pl-money [amount]="charge.installmentAmount" /><span class="text-xs text-muted">{{
                t.perInstallment
              }}</span></span
            >
          </div>
        }

        <div class="flex flex-col gap-3 border-t border-line pt-3">
          <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
            {{ t.what }}
            <input
              type="text"
              maxlength="120"
              [class]="textInput"
              [placeholder]="t.whatPlaceholder"
              [value]="description()"
              (input)="description.set(value($event))"
            />
          </label>
          <div class="grid grid-cols-[1fr_72px_72px] gap-2">
            <label class="flex min-w-0 flex-col gap-1 text-[13px] font-semibold text-muted">
              {{ t.installmentOf }}
              <span [class]="amountBox">
                <span class="font-amount text-muted" aria-hidden="true">$</span>
                <input
                  type="text"
                  inputmode="decimal"
                  [class]="amountInput"
                  placeholder="25.000"
                  [value]="amount()"
                  (input)="amount.set(value($event))"
                />
              </span>
            </label>
            <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              {{ t.goingFor }}
              <input
                type="text"
                inputmode="numeric"
                [class]="numberInput"
                placeholder="3"
                [value]="start()"
                (input)="start.set(value($event))"
              />
            </label>
            <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              {{ t.of }}
              <input
                type="text"
                inputmode="numeric"
                [class]="numberInput"
                placeholder="12"
                [value]="count()"
                (input)="count.set(value($event))"
              />
            </label>
          </div>
          @if (asksStatement()) {
            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium">{{
                cardTexts.statementQuestion(startNumber())
              }}</span>
              <pl-segmented
                tone="surface"
                [label]="cardTexts.statementQuestion(startNumber())"
                [options]="statementOptions()"
                [value]="startStatement()"
                (valueChange)="startStatement.set($event)"
              />
            </div>
          }
          <button
            type="button"
            class="min-h-11 self-start rounded-full bg-field px-4 text-sm font-semibold disabled:opacity-50"
            [disabled]="saving()"
            (click)="add()"
          >
            {{ t.add }}
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-2 rounded-tile bg-surface p-4">
        <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
          {{ t.rest }}
          <span [class]="amountBox">
            <span class="font-amount text-muted" aria-hidden="true">$</span>
            <input
              type="text"
              inputmode="decimal"
              [class]="amountInput"
              [value]="rest()"
              (input)="rest.set(value($event))"
            />
          </span>
        </label>
        <p class="text-[13px] text-muted">{{ t.restHint }}</p>
      </section>

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      <ng-container footer>
        <button type="button" [class]="primary" [disabled]="saving()" (click)="done()">
          {{ saving() ? texts.saving : t.done }}
        </button>
        <button
          type="button"
          [class]="secondary"
          [disabled]="saving()"
          (click)="closed.emit('later')"
        >
          {{ t.later }}
        </button>
      </ng-container>
    </pl-onboarding-shell>
  `,
})
export class CardChargesStep implements OnInit {
  protected readonly texts = ONBOARDING_TEXTS;
  protected readonly t = ONBOARDING_TEXTS.charges;
  protected readonly cardTexts = CARDS_TEXTS.charge;
  protected readonly primary = FOOT_PRIMARY;
  protected readonly secondary = FOOT_SECONDARY;
  protected readonly amountBox = AMOUNT_BOX;
  protected readonly amountInput = AMOUNT_INPUT;
  protected readonly numberInput = NUMBER_INPUT;
  protected readonly textInput = TEXT_INPUT;

  readonly card = input.required<Card>();
  /** `done`: loaded (or nothing to load); `later`: "Lo cargo más tarde"; `back`: "Volver". */
  readonly closed = output<'done' | 'later' | 'back'>();

  private readonly cards = inject(CardsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly today = inject(Today);

  protected readonly loaded = signal<LoadedCharge[]>([]);
  protected readonly description = signal('');
  protected readonly amount = signal('');
  protected readonly start = signal('');
  protected readonly count = signal('');
  protected readonly startStatement = signal<StartStatement>('OPEN');
  protected readonly rest = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The "Compras anteriores" already loaded, if any: "Listo" updates it instead of adding. */
  private previous: { id: string; amount: string } | null = null;

  protected readonly startNumber = computed(() => Number(this.start()) || 0);
  /** TAR-03: between closing and due date, a started plan can begin in the unpaid statement. */
  protected readonly asksStatement = computed(
    () => this.startNumber() > 1 && this.card().previousStatement !== null,
  );
  protected readonly statementOptions = computed<PlSegmentOption<StartStatement>[]>(() => {
    const { openStatement, previousStatement } = this.card();
    const day = (date: string) => formatDate(parseLocalDate(date)).replace(/\/\d{4}$/, '');
    return [
      {
        value: 'OPEN',
        label: this.cardTexts.statementOpen(openStatement ? day(openStatement.closingDate) : ''),
      },
      {
        value: 'PREVIOUS',
        label: this.cardTexts.statementPrevious(
          previousStatement ? day(previousStatement.dueDate) : '',
        ),
      },
    ];
  });

  async ngOnInit(): Promise<void> {
    // "Volver" shows what was already loaded for this card.
    try {
      const page = await this.cards.chargesPage({ cardId: this.card().id, limit: '100' });
      for (const item of page.items) {
        if (item.fromFixed) continue;
        if (item.installmentsCount === 1 && sameName(item.description, this.t.restDescription)) {
          this.previous = { id: item.id, amount: item.totalAmount };
          this.rest.set(item.totalAmount.replace(/\.00$/, ''));
        } else if (item.installmentsCount > 1) {
          const charge = await this.cards.getCharge(item.id);
          this.loaded.update((list) => [...list, toLoaded(charge)]);
        }
      }
    } catch {
      // Nothing to show: the form still works.
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async add(): Promise<void> {
    this.error.set(null);
    const description = this.description().trim();
    if (!description) return this.error.set(this.t.errors.what);
    const installmentAmount = parseTypedAmount(this.amount());
    if (installmentAmount === undefined) return this.error.set(this.t.errors.amount);
    const start = Number(this.start() || '1');
    const count = Number(this.count());
    if (!Number.isInteger(start) || !Number.isInteger(count) || start < 1 || count < 2) {
      return this.error.set(this.t.errors.plan);
    }
    if (start > count) return this.error.set(this.t.errors.plan);
    const categoryId = this.categoryId();
    if (!categoryId) return this.error.set(this.t.errors.category);
    await this.run(async () => {
      const charge = await this.cards.createCharge(this.card().id, {
        date: this.today.date(),
        description,
        categoryId,
        installmentAmount,
        currency: 'ARS',
        installmentsCount: count,
        startInstallment: start,
        ...(this.asksStatement() ? { startStatement: this.startStatement() } : {}),
      });
      this.loaded.update((list) => [...list, toLoaded(charge)]);
      this.description.set('');
      this.amount.set('');
      this.start.set('');
      this.count.set('');
      this.startStatement.set('OPEN');
    });
  }

  /** "Listo": the rest of the open statement as one charge; empty creates nothing. */
  protected async done(): Promise<void> {
    this.error.set(null);
    const typed = this.rest().trim();
    if (!typed) return this.closed.emit('done');
    const total = parseTypedAmount(typed);
    if (total === undefined) return this.error.set(this.t.errors.rest);
    const categoryId = this.categoryId();
    if (!categoryId) return this.error.set(this.t.errors.category);
    const ok = await this.run(async () => {
      const previous = this.previous;
      if (previous) {
        if (Number(previous.amount) !== Number(total)) {
          await this.cards.updateCharge(previous.id, { totalAmount: total });
        }
        return;
      }
      const charge = await this.cards.createCharge(this.card().id, {
        date: this.today.date(),
        description: this.t.restDescription,
        categoryId,
        totalAmount: total,
        currency: 'ARS',
        installmentsCount: 1,
      });
      this.previous = { id: charge.id, amount: charge.totalAmount };
    });
    if (ok) this.closed.emit('done');
  }

  private categoryId(): string | undefined {
    return pickCategory(this.categories.categories(), 'EXPENSE', 'Otros gastos')?.id;
  }

  private async run(action: () => Promise<void>): Promise<boolean> {
    this.saving.set(true);
    try {
      await action();
      return true;
    } catch (error) {
      this.error.set(errorMessage(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
