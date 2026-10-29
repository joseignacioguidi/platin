import { HttpClient } from '@angular/common/http';
import { afterNextRender, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicPlan } from '@platin/contracts';
import { PlMoney, PlWink } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { sessionHint } from '../../core/auth/session-hint';
import { LIMIT_KEYS, limitLabel, PLANS_TEXTS } from './plans.texts';

const CARD_TONES = ['bg-brand-soft', 'bg-card-soft', 'bg-savings-soft', 'bg-pending-soft'];

/** PLN-03: public plans page, prerendered with the landing identity; reads GET /plans. */
@Component({
  selector: 'pl-plans-page',
  imports: [RouterLink, PlWink, PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pl-light block min-h-dvh overflow-x-clip bg-surface text-ink' },
  template: `
    <header class="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 sm:py-6">
      <nav
        [attr.aria-label]="t.page.title"
        class="flex flex-wrap items-center justify-between gap-2"
      >
        <a
          routerLink="/"
          class="flex min-h-11 items-center gap-2.5 text-2xl font-bold tracking-[-0.05em]"
        >
          <pl-wink class="w-6" />
          platin
        </a>
        <div class="flex items-center gap-1 sm:gap-2">
          @if (hasSession()) {
            <a
              routerLink="/app"
              class="flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-ink bg-brand px-5 font-bold hover:bg-brand-soft"
              >{{ t.page.openApp }}</a
            >
          } @else {
            <a
              routerLink="/ingresar"
              class="flex min-h-11 items-center px-3 font-semibold hover:text-brand-strong sm:px-4"
              >{{ t.page.login }}</a
            >
            <a
              routerLink="/registro"
              class="flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-ink bg-brand px-5 font-bold hover:bg-brand-soft"
              >{{ t.page.register }}</a
            >
          }
        </div>
      </nav>
    </header>

    <main class="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <div class="flex flex-col gap-4">
        <h1 class="m-0 text-[clamp(44px,7vw,96px)] font-bold leading-[0.92] tracking-[-0.055em]">
          {{ t.page.heading }}
        </h1>
        <p class="m-0 max-w-[620px] text-lg leading-normal sm:text-xl">{{ t.page.intro }}</p>
      </div>

      @if (failed()) {
        <p class="rounded-[28px] border-2 border-ink px-6 py-5" role="alert">
          {{ t.page.loadError }}
        </p>
      } @else if (plans(); as plans) {
        <ul class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          @for (plan of plans; track plan.id; let i = $index) {
            <li
              class="flex flex-col gap-5 rounded-[36px] border-2 border-ink p-7"
              [class]="tone(i)"
            >
              <div class="flex flex-col gap-2">
                @if (plan.isDefault) {
                  <span
                    class="self-start rounded-full border-2 border-ink bg-surface px-3 py-1 text-sm font-semibold"
                    >{{ t.page.defaultBadge }}</span
                  >
                }
                <h2 class="m-0 text-4xl font-bold tracking-[-0.04em]">{{ plan.name }}</h2>
                @if (plan.description) {
                  <p class="m-0 text-[17px]">{{ plan.description }}</p>
                }
              </div>
              <p class="m-0 flex items-baseline gap-1 text-3xl font-semibold">
                @if (plan.priceArs && plan.priceArs !== '0.00') {
                  <pl-money [amount]="plan.priceArs" />
                  <span class="text-base font-normal">{{ t.page.perMonth }}</span>
                } @else {
                  <span class="font-amount">{{ t.page.free }}</span>
                }
              </p>
              <ul class="flex flex-col gap-2 text-[17px]">
                @for (line of summary(plan); track line) {
                  <li class="flex items-center gap-2">
                    <span class="size-2 shrink-0 rounded-full bg-ink" aria-hidden="true"></span>
                    {{ line }}
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
        <a
          routerLink="/registro"
          class="flex min-h-14 items-center self-start rounded-full bg-ink px-8 text-lg font-bold text-on-ink hover:opacity-90"
          >{{ t.page.start }}</a
        >
      } @else {
        <p class="text-muted" role="status">{{ t.page.loading }}</p>
      }
    </main>
  `,
})
export class PlansPage {
  private readonly http = inject(HttpClient);
  protected readonly t = PLANS_TEXTS;
  protected readonly plans = signal<PublicPlan[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly hasSession = sessionHint();

  constructor() {
    // Prerendered without data: the plans are read in the browser, so a change shows up at once.
    afterNextRender(() => void this.load());
  }

  private async load(): Promise<void> {
    try {
      this.plans.set(await firstValueFrom(this.http.get<PublicPlan[]>(`${API}/plans`)));
    } catch {
      this.failed.set(true);
    }
  }

  protected tone(index: number): string {
    return CARD_TONES[index % CARD_TONES.length];
  }

  protected summary(plan: PublicPlan): string[] {
    return [
      ...PLANS_TEXTS.resources.map((resource) =>
        limitLabel(resource, plan.limits[LIMIT_KEYS[resource]]),
      ),
      plan.limits.investments
        ? PLANS_TEXTS.investmentsIncluded
        : PLANS_TEXTS.investmentsNotIncluded,
    ];
  }
}
