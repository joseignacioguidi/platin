import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PendingCount } from '../../layout/pending-count';
import { SectionTab, SectionTabs } from '../../layout/section-tabs';
import { COMMITMENTS_TEXTS } from './commitments.texts';

/** COM-05: Compromisos with three tabs, Próximos meses, Fijos and Para confirmar. */
@Component({
  selector: 'pl-commitments-section',
  imports: [RouterOutlet, SectionTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <p class="text-[15px] text-muted">{{ texts.intro }}</p>
    </header>
    <pl-section-tabs [tabs]="tabs()" [label]="texts.tabs.label" />
    <router-outlet />
  `,
})
export class CommitmentsSection {
  protected readonly texts = COMMITMENTS_TEXTS;
  private readonly pending = inject(PendingCount);

  protected readonly tabs = computed<SectionTab[]>(() => [
    { path: '/app/compromisos', label: this.texts.tabs.upcoming },
    { path: '/app/compromisos/fijos', label: this.texts.tabs.fixed },
    {
      path: '/app/compromisos/para-confirmar',
      label: this.texts.tabs.pending,
      count: this.pending.label(),
    },
  ]);
}
