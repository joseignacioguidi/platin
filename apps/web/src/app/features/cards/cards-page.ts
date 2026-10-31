import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucidePlus } from '@lucide/angular';
import { PlBottomSheet, PlButton, PlEmptyState, PlErrorState, PlSkeleton } from '@platin/web-ui';
import { PlanGate, PlUsage } from '../plans/plan-gate';
import { CardFormSheet } from './card-form-sheet';
import { CardVisual } from './card-visual';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

/** /app/tarjetas: every card with its open statement. */
@Component({
  selector: 'pl-cards-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlButton,
    PlEmptyState,
    CardVisual,
    LucidePlus,
    PlanGate,
    PlUsage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <div class="flex items-center gap-2">
        <pl-usage resource="cards" />
        <button plButton size="sm" type="button" plPlanGate="cards" (click)="create()">
          <svg lucidePlus [size]="18"></svg>{{ texts.new }}
        </button>
      </div>
    </header>
    @if (store.resource.error() && !store.resource.hasValue()) {
      <pl-error-state (retry)="store.resource.reload()" />
    } @else if (!store.resource.hasValue()) {
      <pl-skeleton [heights]="[200, 200]" />
    } @else if (store.cards().length === 0) {
      <pl-empty-state
        icon="credit-card"
        [heading]="texts.emptyTitle"
        [description]="texts.emptyBody"
      >
        <button plButton type="button" plPlanGate="cards" (click)="create()">
          {{ texts.new }}
        </button>
      </pl-empty-state>
    } @else {
      <ul class="flex flex-col gap-3">
        @for (card of store.cards(); track card.id) {
          <li>
            <a
              [routerLink]="['/app/tarjetas', card.id]"
              class="block rounded-card"
              [attr.aria-label]="card.name"
            >
              <pl-card-visual [card]="card" [compact]="true" />
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export class CardsPage {
  protected readonly texts = CARDS_TEXTS;
  protected readonly store = inject(CardsStore);
  private readonly sheet = inject(PlBottomSheet);

  protected create(): void {
    this.sheet.open(CardFormSheet, { data: null, ariaLabel: this.texts.new });
  }
}
