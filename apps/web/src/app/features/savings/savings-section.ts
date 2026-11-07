import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SectionTab, SectionTabs } from '../../layout/section-tabs';
import { SAVINGS_TEXTS } from './savings.texts';

/** INV-06: Ahorros e inversiones with two tabs, Metas y ahorros and Inversiones. */
@Component({
  selector: 'pl-savings-section',
  imports: [RouterOutlet, SectionTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold">{{ texts.section.title }}</h1>
      <p class="text-[15px] text-muted">{{ texts.section.intro }}</p>
    </header>
    <pl-section-tabs [tabs]="tabs" [label]="texts.section.tabsLabel" />
    <router-outlet />
  `,
})
export class SavingsSection {
  protected readonly texts = SAVINGS_TEXTS;
  protected readonly tabs: readonly SectionTab[] = [
    { path: '/app/ahorros', label: SAVINGS_TEXTS.section.goals },
    // Outside the plan, the tab opens the plan sheet (PLN-07).
    {
      path: '/app/ahorros/inversiones',
      label: SAVINGS_TEXTS.section.investments,
      gate: 'investments',
    },
  ];
}
