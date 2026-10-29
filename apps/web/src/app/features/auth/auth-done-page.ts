import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../core/session/session.service';
import { AuthLayout } from './auth-layout';
import { AUTH_TEXTS } from './auth.texts';
import { safeReturnUrl } from './login-page';

/**
 * Where the API lands after a sign-in with a provider: it already set the refresh cookie, so
 * refresh (no token ever travels in the URL), run the usual start-up (sync) and go on.
 */
@Component({
  selector: 'pl-auth-done-page',
  imports: [AuthLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-auth-layout [heading]="texts.title">
      <p class="text-muted" role="status">{{ texts.loading }}</p>
    </pl-auth-layout>
  `,
})
export class AuthDonePage implements OnInit {
  readonly returnTo = input<string>();

  protected readonly texts = AUTH_TEXTS.done;
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    if (await this.session.restore()) {
      await this.router.navigateByUrl(safeReturnUrl(this.returnTo()), { replaceUrl: true });
    } else {
      await this.router.navigate(['/ingresar'], {
        queryParams: { error: 'SESSION_INVALID' },
        replaceUrl: true,
      });
    }
  }
}
