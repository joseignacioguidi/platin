import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideDynamicIcon,
  LucideGripVertical,
  LucidePlus,
  LucideX,
} from '@lucide/angular';
import {
  DEFAULT_HOME_SHORTCUTS,
  HOME_SHORTCUTS,
  HOME_SHORTCUTS_MAX,
  type HomeShortcut,
} from '@platin/contracts';
import type { PlanFeature } from '@platin/domain';
import { PL_TONE_CLASSES, PlButton, PlTone } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { PlanGate } from '../plans/plan-gate';
import { DASHBOARD_TEXTS } from './dashboard.texts';

interface ShortcutInfo {
  path: string;
  icon: string;
  tone: PlTone;
  gate?: PlanFeature;
}

const SHORTCUTS: Record<HomeShortcut, ShortcutInfo> = {
  accounts: { path: '/app/cuentas', icon: 'wallet', tone: 'brand' },
  cards: { path: '/app/tarjetas', icon: 'credit-card', tone: 'card' },
  fixed: { path: '/app/fijos', icon: 'repeat', tone: 'pending' },
  commitments: { path: '/app/compromisos', icon: 'calendar', tone: 'transfer' },
  savings: { path: '/app/ahorros', icon: 'piggy-bank', tone: 'savings' },
  investments: {
    path: '/app/inversiones',
    icon: 'trending-up',
    tone: 'card',
    gate: 'investments',
  },
  categories: { path: '/app/categorias', icon: 'tag', tone: 'expense' },
  movements: { path: '/app/movimientos', icon: 'arrow-left-right', tone: 'transfer' },
  pending: { path: '/app/pendientes', icon: 'sparkles', tone: 'pending' },
  profile: { path: '/app/perfil', icon: 'user', tone: 'muted' },
};

/**
 * DAS-04: shortcuts to the other sections, below "Libre este mes". Each user picks which ones and
 * in which order (saved in their preferences, so every device shows the same). In edit mode
 * they are reordered by dragging on desktop or with the up and down buttons.
 */
@Component({
  selector: 'pl-home-shortcuts',
  imports: [
    RouterLink,
    PlButton,
    PlanGate,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    LucideDynamicIcon,
    LucideChevronUp,
    LucideChevronDown,
    LucideGripVertical,
    LucidePlus,
    LucideX,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold" id="home-shortcuts-title">{{ t.title }}</h2>
      @if (!editing()) {
        <button
          type="button"
          class="min-h-11 px-2 text-sm font-semibold text-brand-strong"
          [attr.aria-label]="t.editLabel"
          (click)="startEditing()"
        >
          {{ t.edit }}
        </button>
      }
    </div>

    @if (!editing()) {
      @if (current().length > 0) {
        <nav aria-labelledby="home-shortcuts-title">
          <ul class="grid grid-cols-4 gap-2 sm:grid-cols-7">
            @for (key of current(); track key) {
              <li>
                <a
                  [routerLink]="info[key].path"
                  [plPlanGate]="info[key].gate ?? []"
                  class="relative flex min-h-11 flex-col items-center gap-1.5 rounded-tile bg-surface px-1 py-3 text-center text-xs font-medium [&>pl-plan-badge]:absolute [&>pl-plan-badge]:top-1.5 [&>pl-plan-badge]:right-1.5"
                >
                  <span
                    class="flex size-10 items-center justify-center rounded-xl"
                    [class]="tone(info[key].tone)"
                    aria-hidden="true"
                  >
                    <svg [lucideIcon]="info[key].icon" [size]="20"></svg>
                  </span>
                  <span class="w-full truncate">{{ t.names[key] }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>
      } @else {
        <p class="rounded-tile bg-surface px-4 py-3 text-sm text-muted">{{ t.none }}</p>
      }
    } @else {
      <section
        class="flex flex-col gap-3 rounded-card bg-surface p-4"
        [attr.aria-label]="t.editLabel"
      >
        <p class="text-sm text-muted">{{ t.editHint(max) }}</p>
        <ul
          cdkDropList
          class="flex flex-col"
          [attr.aria-label]="t.chosen"
          (cdkDropListDropped)="drop($event)"
        >
          @for (key of draft(); track key; let i = $index, last = $last) {
            <li
              cdkDrag
              cdkDragLockAxis="y"
              class="flex min-h-12 items-center gap-2 border-b border-line-soft bg-surface last:border-b-0"
            >
              <span
                cdkDragHandle
                class="hidden size-11 cursor-grab items-center justify-center text-muted sm:flex"
                aria-hidden="true"
              >
                <svg lucideGripVertical [size]="18"></svg>
              </span>
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-lg"
                [class]="tone(info[key].tone)"
                aria-hidden="true"
              >
                <svg [lucideIcon]="info[key].icon" [size]="16"></svg>
              </span>
              <span class="min-w-0 flex-1 truncate">{{ t.names[key] }}</span>
              <button
                type="button"
                class="flex size-11 items-center justify-center rounded-full hover:bg-field disabled:opacity-30"
                [disabled]="i === 0"
                [attr.aria-label]="t.moveUp(t.names[key])"
                (click)="move(i, -1)"
              >
                <svg lucideChevronUp [size]="18"></svg>
              </button>
              <button
                type="button"
                class="flex size-11 items-center justify-center rounded-full hover:bg-field disabled:opacity-30"
                [disabled]="last"
                [attr.aria-label]="t.moveDown(t.names[key])"
                (click)="move(i, 1)"
              >
                <svg lucideChevronDown [size]="18"></svg>
              </button>
              <button
                type="button"
                class="flex size-11 items-center justify-center rounded-full hover:bg-field"
                [attr.aria-label]="t.remove(t.names[key])"
                (click)="remove(key)"
              >
                <svg lucideX [size]="18"></svg>
              </button>
            </li>
          } @empty {
            <li class="py-3 text-sm text-muted">{{ t.none }}</li>
          }
        </ul>

        @if (available().length > 0) {
          <div class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">{{ t.add }}</h3>
            <div class="flex flex-wrap gap-2">
              @for (key of available(); track key) {
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-sm disabled:opacity-40"
                  [disabled]="full()"
                  [attr.aria-label]="t.addOne(t.names[key])"
                  (click)="add(key)"
                >
                  <svg lucidePlus [size]="16" aria-hidden="true"></svg>{{ t.names[key] }}
                </button>
              }
            </div>
            @if (full()) {
              <p class="text-xs text-muted">{{ t.full(max) }}</p>
            }
          </div>
        }

        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <div class="grid grid-cols-2 gap-2">
          <button plButton="secondary" type="button" (click)="cancel()">{{ t.cancel }}</button>
          <button plButton type="button" [disabled]="saving()" (click)="save()">
            {{ t.save }}
          </button>
        </div>
        <button
          type="button"
          class="min-h-11 self-center text-sm font-medium text-brand-strong"
          (click)="draft.set([...defaults])"
        >
          {{ t.reset }}
        </button>
      </section>
    }
  `,
})
export class HomeShortcuts {
  private readonly auth = inject(AuthService);
  protected readonly t = DASHBOARD_TEXTS.shortcuts;
  protected readonly info = SHORTCUTS;
  protected readonly max = HOME_SHORTCUTS_MAX;
  protected readonly defaults = DEFAULT_HOME_SHORTCUTS;

  protected readonly current = computed<readonly HomeShortcut[]>(
    () => this.auth.user()?.preferences?.homeShortcuts ?? DEFAULT_HOME_SHORTCUTS,
  );
  protected readonly editing = signal(false);
  protected readonly draft = signal<HomeShortcut[]>([]);
  protected readonly available = computed(() =>
    HOME_SHORTCUTS.filter((key) => !this.draft().includes(key)),
  );
  protected readonly full = computed(() => this.draft().length >= HOME_SHORTCUTS_MAX);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected tone(tone: PlTone): string {
    return PL_TONE_CLASSES[tone];
  }

  protected startEditing(): void {
    this.draft.set([...this.current()]);
    this.error.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected move(index: number, step: -1 | 1): void {
    this.draft.update((list) => {
      const next = [...list];
      moveItemInArray(next, index, index + step);
      return next;
    });
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.draft.update((list) => {
      const next = [...list];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  protected remove(key: HomeShortcut): void {
    this.draft.update((list) => list.filter((existing) => existing !== key));
  }

  protected add(key: HomeShortcut): void {
    if (!this.full()) this.draft.update((list) => [...list, key]);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.auth.updateProfile({ preferences: { homeShortcuts: this.draft() } });
      this.editing.set(false);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
