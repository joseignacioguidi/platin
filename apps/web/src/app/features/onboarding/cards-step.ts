import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { LucideCreditCard, LucidePencil } from '@lucide/angular';
import type { Card } from '@platin/contracts';
import { PlAccountSelect, PlBottomSheet } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/errors';
import { AccountsStore } from '../accounts/accounts.store';
import { CardFormSheet } from '../cards/card-form-sheet';
import { CardsStore } from '../cards/cards.store';
import { CardChargesStep } from './card-charges-step';
import { ChargesQuestionSheet, type ChargesAnswer } from './charges-question-sheet';
import { OnboardingStore } from './onboarding.store';
import { ONBOARDING_TEXTS } from './onboarding.texts';
import { FOOT_PRIMARY, FOOT_SECONDARY, OnboardingShell } from './onboarding-shell';
import { ONBOARDING_PATHS } from './onboarding-steps';
import { NUMBER_INPUT, parseDay, TEXT_INPUT } from './onboarding-ui';

type View = 'form' | 'list' | 'charges';

/**
 * Step 2 (AUTH-05): a card with its days and the account it is paid from; on saving, the
 * question about its current charges (mockups 2, 2b and 2c). Several cards can be added.
 */
@Component({
  selector: 'pl-onboarding-cards',
  imports: [OnboardingShell, CardChargesStep, PlAccountSelect, LucideCreditCard, LucidePencil],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view() === 'charges' && chargesCard(); as card) {
      <pl-onboarding-card-charges [card]="card" (closed)="chargesClosed($event)" />
    } @else if (view() === 'form') {
      <pl-onboarding-shell [step]="2" [heading]="t.title" [body]="t.body" (back)="back()">
        <section class="flex flex-col gap-3.5 rounded-tile bg-surface p-4">
          <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
            {{ t.name }}
            <input
              type="text"
              maxlength="60"
              [class]="textInput"
              [placeholder]="t.namePlaceholder"
              [value]="name()"
              (input)="name.set(value($event))"
            />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              {{ t.closingDay }}
              <input
                type="text"
                inputmode="numeric"
                maxlength="2"
                [class]="numberInput"
                [value]="closingDay()"
                (input)="closingDay.set(value($event))"
              />
            </label>
            <label class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              {{ t.dueDay }}
              <input
                type="text"
                inputmode="numeric"
                maxlength="2"
                [class]="numberInput"
                [value]="dueDay()"
                (input)="dueDay.set(value($event))"
              />
            </label>
          </div>
          @if (accounts.pockets().length > 0) {
            <div class="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              <span id="onboarding-card-account">{{ t.payFrom }}</span>
              <pl-account-select
                spending
                [label]="t.payFrom"
                [placeholder]="t.payFromPlaceholder"
                [pockets]="accounts.pockets()"
                [value]="paymentPocketId()"
                (valueChange)="paymentPocketId.set($event)"
              />
            </div>
          }
          <p class="text-[13px] text-muted">{{ t.datesHint }}</p>
        </section>
        @if (limitText()) {
          <p class="text-sm text-muted">{{ limitText() }}</p>
        }
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <ng-container footer>
          <button
            type="button"
            [class]="primary"
            [disabled]="saving() || atLimit()"
            (click)="save()"
          >
            {{ saving() ? texts.saving : t.save }}
          </button>
          @if (cards().length > 0) {
            <button type="button" [class]="secondary" (click)="back()">
              {{ t.cancelAnother }}
            </button>
          } @else {
            <button type="button" [class]="secondary" [disabled]="saving()" (click)="skip()">
              {{ t.noCard }}
            </button>
          }
        </ng-container>
      </pl-onboarding-shell>
    } @else {
      <pl-onboarding-shell [step]="2" [heading]="t.listTitle" [body]="t.listBody" (back)="back()">
        @for (card of cards(); track card.id) {
          <div class="flex flex-col gap-4 rounded-[22px] bg-card p-[18px] text-on-card">
            <span class="flex items-center justify-between gap-2 text-[15px] font-bold">
              <span class="truncate">{{ card.name }}</span>
              <span class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full hover:bg-surface/30"
                  [attr.aria-label]="t.edit(card.name)"
                  (click)="edit(card)"
                >
                  <svg lucidePencil [size]="18" aria-hidden="true"></svg>
                </button>
                <svg lucideCreditCard [size]="20" aria-hidden="true"></svg>
              </span>
            </span>
            <span class="text-sm">{{ summary(card) }}</span>
            <button
              type="button"
              class="min-h-11 self-start rounded-full bg-surface px-4 text-sm font-semibold text-ink"
              (click)="openCharges(card)"
            >
              {{ t.loadCharges }}
            </button>
          </div>
        }
        <button
          type="button"
          class="min-h-11 self-start text-sm font-semibold text-brand-strong disabled:text-muted"
          [disabled]="atLimit()"
          (click)="startAnother()"
        >
          {{ t.another }}
        </button>
        @if (limitText()) {
          <p class="text-sm text-muted">{{ limitText() }}</p>
        }
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <ng-container footer>
          <button type="button" [class]="primary" [disabled]="saving()" (click)="next()">
            {{ texts.next }}
          </button>
          <button type="button" [class]="secondary" [disabled]="saving()" (click)="skip()">
            {{ texts.skip }}
          </button>
        </ng-container>
      </pl-onboarding-shell>
    }
  `,
})
export class CardsStep {
  protected readonly texts = ONBOARDING_TEXTS;
  protected readonly t = ONBOARDING_TEXTS.cards;
  protected readonly primary = FOOT_PRIMARY;
  protected readonly secondary = FOOT_SECONDARY;
  protected readonly textInput = TEXT_INPUT;
  protected readonly numberInput = NUMBER_INPUT;

  protected readonly accounts = inject(AccountsStore);
  private readonly store = inject(CardsStore);
  private readonly onboarding = inject(OnboardingStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);

  protected readonly cards = computed(() => this.store.cards().filter((card) => !card.archived));
  /** Without cards yet, the form; with cards, the list ("Volver" shows what was loaded). */
  protected readonly view = signal<View>(this.store.cards().length > 0 ? 'list' : 'form');
  private readonly chargesCardId = signal<string | null>(null);
  protected readonly chargesCard = computed(() =>
    this.cards().find((card) => card.id === this.chargesCardId()),
  );

  protected readonly name = signal('');
  protected readonly closingDay = signal('');
  protected readonly dueDay = signal('');
  /** The first bank or wallet chosen in step 1 (the mockup pays the Visa from Santander). */
  protected readonly paymentPocketId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly limit = computed(() => this.onboarding.state()?.limits.cards.max ?? null);
  protected readonly atLimit = computed(() => {
    const max = this.limit();
    return max !== null && this.cards().length >= max;
  });
  protected readonly limitText = computed(() => {
    const max = this.limit();
    return max === null ? null : this.texts.planLimit(max, this.t.plural);
  });

  /** Whether the user moved between the form and the list: then the view stays as chosen. */
  private moved = false;

  constructor() {
    // On a direct visit the stores may still be loading: once they arrive, show the list if there
    // are cards and suggest the account to pay from.
    effect(() => {
      const hasCards = this.cards().length > 0;
      untracked(() => {
        if (!this.moved && hasCards && this.view() === 'form') this.view.set('list');
      });
    });
    effect(() => {
      const pocket = this.defaultPocket();
      untracked(() => {
        if (this.paymentPocketId() === null && pocket) this.paymentPocketId.set(pocket);
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected summary(card: Card): string {
    const pocket = this.accounts.pocketById(card.defaultPaymentPocketId);
    const account = pocket ? this.accounts.byId(pocket.accountId)?.name : undefined;
    return this.t.summary(card.closingDay, card.dueDay) + (account ? this.t.paidFrom(account) : '');
  }

  protected startAnother(): void {
    this.moved = true;
    this.name.set('');
    this.closingDay.set('');
    this.dueDay.set('');
    this.error.set(null);
    this.view.set('form');
  }

  protected edit(card: Card): void {
    this.sheet.open(CardFormSheet, { data: card, ariaLabel: this.t.edit(card.name) });
  }

  protected async save(): Promise<void> {
    this.error.set(null);
    const name = this.name().trim();
    if (!name) return this.error.set(this.t.errors.name);
    const closingDay = parseDay(this.closingDay());
    const dueDay = parseDay(this.dueDay());
    if (closingDay === null || dueDay === null) return this.error.set(this.t.errors.day);
    this.saving.set(true);
    try {
      const card = await this.store.create({
        name,
        closingDay,
        dueDay,
        defaultPaymentPocketId: this.paymentPocketId(),
      });
      await this.onboarding.mark('cards', 'DONE');
      this.view.set('list');
      this.saving.set(false);
      await this.ask(card);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected openCharges(card: Card): void {
    this.chargesCardId.set(card.id);
    this.view.set('charges');
  }

  protected async chargesClosed(result: 'done' | 'later' | 'back'): Promise<void> {
    this.view.set('list');
    this.chargesCardId.set(null);
    if (result === 'back') return;
    await this.markCharges(result === 'done' ? 'DONE' : 'LATER');
  }

  protected back(): void {
    if (this.view() === 'form' && this.cards().length > 0) {
      this.moved = true;
      this.view.set('list');
      return;
    }
    void this.router.navigateByUrl(ONBOARDING_PATHS.accounts);
  }

  protected async next(): Promise<void> {
    await this.leave(async () => {
      if (this.onboarding.state()?.steps.cards !== 'DONE') {
        await this.onboarding.mark('cards', 'DONE');
      }
    });
  }

  protected async skip(): Promise<void> {
    await this.leave(async () => {
      // With cards already saved, skipping only leaves their charges for later.
      if (this.cards().length > 0) await this.markCharges('LATER');
      else await this.onboarding.mark('cards', 'SKIPPED');
    });
  }

  /** "¿Querés cargar tus consumos actuales?" */
  private async ask(card: Card): Promise<void> {
    const ref = this.sheet.open<ChargesQuestionSheet, unknown, ChargesAnswer>(
      ChargesQuestionSheet,
      { ariaLabel: ONBOARDING_TEXTS.chargesQuestion.title },
    );
    const answer = await firstValueFrom(ref.closed);
    if (answer === 'yes') this.openCharges(card);
    else if (answer === 'later') await this.markCharges('LATER');
  }

  /** Loaded charges stay loaded: "más tarde" on another card doesn't undo them. */
  private async markCharges(status: 'DONE' | 'LATER'): Promise<void> {
    try {
      if (status === 'LATER' && this.onboarding.state()?.steps.cardCharges === 'DONE') return;
      await this.onboarding.mark('cardCharges', status);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  private async leave(action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    try {
      await action();
      await this.router.navigateByUrl(ONBOARDING_PATHS.fixed);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private defaultPocket(): string | null {
    const accounts = this.accounts.accounts();
    const account = accounts.find((a) => a.kind === 'BANK' || a.kind === 'WALLET') ?? accounts[0];
    return account?.pockets.find((p) => p.kind === 'AVAILABLE' && p.currency === 'ARS')?.id ?? null;
  }
}
