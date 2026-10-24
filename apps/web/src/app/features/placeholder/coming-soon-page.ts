import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlEmptyState } from '@platin/web-ui';

/** Temporary page for sections that arrive in later phases. */
@Component({
  selector: 'pl-coming-soon-page',
  imports: [PlEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-4 text-xl font-bold">{{ heading() }}</h1>
    <pl-empty-state
      icon="construction"
      heading="Muy pronto"
      description="Esta sección está en camino."
    />
  `,
})
export class ComingSoonPage {
  readonly heading = input('');
}
