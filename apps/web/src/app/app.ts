import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServerWake } from './core/session/server-wake.service';
import { ThemeService } from './core/theme/theme.service';
import { WakeScreen } from './layout/wake-screen';

@Component({
  selector: 'pl-root',
  imports: [RouterOutlet, WakeScreen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (wake.status() === 'waking' || wake.status() === 'failed') {
      <pl-wake-screen [failed]="wake.status() === 'failed'" />
    }
    <router-outlet />
  `,
})
export class App {
  protected readonly wake = inject(ServerWake);
  // Instantiated here so the theme is kept in sync from the start.
  protected readonly theme = inject(ThemeService);
}
