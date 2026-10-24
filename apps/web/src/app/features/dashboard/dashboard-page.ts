import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PlEmptyState } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** Home. Phase 6 replaces the empty state with "Libre este mes". */
@Component({
  selector: 'pl-dashboard-page',
  imports: [PlEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex flex-col gap-0.5">
      <span class="text-[13px] text-muted">{{ greeting() }}</span>
      <h1 class="text-xl font-bold">{{ texts.title }}</h1>
    </header>
    <pl-empty-state icon="wallet" [heading]="texts.emptyTitle" [description]="texts.emptyBody" />
  `,
})
export class DashboardPage {
  protected readonly texts = DASHBOARD_TEXTS;
  private readonly auth = inject(AuthService);
  protected readonly greeting = computed(() => {
    const name = this.auth.user()?.name;
    return name ? `${this.texts.hello}, ${name}` : this.texts.hello;
  });
}
