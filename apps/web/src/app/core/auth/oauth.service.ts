import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { AuthProvider, AuthProvidersResponse, LinkTicketResponse } from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../api';

/**
 * Sign-in with external providers (AUTH-06 to 08). The OAuth flow lives in the API: the app only
 * navigates (a full page load, not a request) to /start and later lands on /auth/listo.
 */
@Injectable({ providedIn: 'root' })
export class OAuthService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Enabled providers. Prerendered pages show no buttons until the browser asks the API. */
  readonly providers = httpResource<AuthProvidersResponse>(() =>
    this.browser ? `${API}/auth/providers` : undefined,
  );

  /** AUTH-06: off to the provider; the API brings the browser back to `returnTo`. */
  signIn(slug: string, returnTo = '/app'): void {
    const query = new URLSearchParams({ returnTo });
    this.document.location.assign(`${API}/auth/oauth/${slug}/start?${query}`);
  }

  /**
   * AUTH-07: a full navigation can't carry the in-memory access token, so first ask for a
   * one-use ticket (60 s) that identifies the signed-in user.
   */
  async link(slug: string): Promise<void> {
    const { ticket } = await firstValueFrom(
      this.http.post<LinkTicketResponse>(`${API}/auth/oauth/${slug}/link-ticket`, null),
    );
    const query = new URLSearchParams({ mode: 'link', ticket });
    this.document.location.assign(`${API}/auth/oauth/${slug}/start?${query}`);
  }

  unlink(identityId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/auth/identities/${identityId}`));
  }

  setPassword(password: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API}/auth/password`, { password }));
  }
}

/** Display names of the providers (brand names, not translated). */
export const PROVIDER_NAMES: Record<AuthProvider, string> = {
  GOOGLE: 'Google',
  FACEBOOK: 'Facebook',
  APPLE: 'Apple',
};
