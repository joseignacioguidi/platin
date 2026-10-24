import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { AuthResponse } from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { safeReturnUrl } from '../../features/auth/login-page';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const session = (token: string): AuthResponse => ({
  accessToken: token,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'jose@platin.app',
    name: 'José',
    baseCurrency: 'ARS',
    valuationRate: 'MEP',
  },
});

describe('auth', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  async function login(token = 'token-1'): Promise<void> {
    const done = auth.login({ email: 'jose@platin.app', password: 'una-clave-segura' });
    backend.expectOne('/api/v1/auth/login').flush(session(token));
    await done;
  }

  it('keeps the access token in memory after login', async () => {
    await login();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.name).toBe('José');
  });

  it('adds the bearer token to API calls only', async () => {
    await login('token-1');
    const api = firstValueFrom(http.get('/api/v1/users/me'));
    const req = backend.expectOne('/api/v1/users/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({});
    await api.catch(() => undefined);
  });

  it('refreshes once on concurrent 401s and retries each request', async () => {
    await login('expired');
    const first = firstValueFrom(http.get('/api/v1/accounts'));
    const second = firstValueFrom(http.get('/api/v1/cards'));

    backend.expectOne('/api/v1/accounts').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/cards').flush(null, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();

    const refreshes = backend.match('/api/v1/auth/refresh');
    expect(refreshes).toHaveLength(1);
    refreshes[0].flush(session('fresh'));
    await new Promise((resolve) => setTimeout(resolve));

    const retriedAccounts = backend.expectOne('/api/v1/accounts');
    const retriedCards = backend.expectOne('/api/v1/cards');
    expect(retriedAccounts.request.headers.get('Authorization')).toBe('Bearer fresh');
    retriedAccounts.flush([]);
    retriedCards.flush([]);
    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([]);
  });

  it('sends the user to /ingresar when the refresh fails', async () => {
    await login('expired');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const call = firstValueFrom(http.get('/api/v1/accounts'));
    backend.expectOne('/api/v1/accounts').flush(null, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    backend
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'SESSION_REUSED' }, { status: 401, statusText: 'Unauthorized' });

    await expect(call).rejects.toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/ingresar'], expect.anything());
  });

  it('only returns to paths inside the app after login', () => {
    expect(safeReturnUrl('/app/tarjetas')).toBe('/app/tarjetas');
    expect(safeReturnUrl('https://evil.example')).toBe('/app');
    expect(safeReturnUrl('//evil.example')).toBe('/app');
    expect(safeReturnUrl(undefined)).toBe('/app');
  });
});
