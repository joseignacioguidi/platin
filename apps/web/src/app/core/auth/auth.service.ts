import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UpdateUserRequest,
  User,
} from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../api';

/**
 * Session state. The access token lives only in memory (a signal); the refresh token is an
 * httpOnly cookie the browser sends to /api/v1/auth/* by itself.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly token = signal<string | null>(null);
  private readonly currentUser = signal<User | null>(null);
  private refreshing: Promise<boolean> | null = null;

  readonly accessToken = this.token.asReadonly();
  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.token() !== null);

  async login(request: LoginRequest): Promise<void> {
    this.start(await firstValueFrom(this.http.post<AuthResponse>(`${API}/auth/login`, request)));
  }

  async register(request: RegisterRequest): Promise<void> {
    this.start(await firstValueFrom(this.http.post<AuthResponse>(`${API}/auth/register`, request)));
  }

  /**
   * Gets a new access token with the refresh cookie. Concurrent callers share one request,
   * so a burst of 401s triggers a single refresh.
   */
  refresh(): Promise<boolean> {
    this.refreshing ??= firstValueFrom(this.http.post<AuthResponse>(`${API}/auth/refresh`, null))
      .then((response) => {
        this.start(response);
        return true;
      })
      .catch(() => {
        this.clear();
        return false;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${API}/auth/logout`, null));
    } finally {
      this.clear();
    }
  }

  async updateProfile(changes: UpdateUserRequest): Promise<User> {
    const user = await firstValueFrom(this.http.patch<User>(`${API}/users/me`, changes));
    this.currentUser.set(user);
    return user;
  }

  clear(): void {
    this.token.set(null);
    this.currentUser.set(null);
  }

  private start(response: AuthResponse): void {
    this.token.set(response.accessToken);
    this.currentUser.set(response.user);
  }
}
