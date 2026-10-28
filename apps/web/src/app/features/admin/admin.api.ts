import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AdminUserDetail,
  AdminUsersPage,
  AdminUsersQuery,
  AuditPage,
  Setting,
  SettingKey,
} from '@platin/contracts';
import { localDateAt } from '@platin/domain';
import { formatDate } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';

export const ADMIN_API = `${API}/admin`;

export type UserAction = 'suspend' | 'reactivate' | 'logout';

/** Writes and paged reads of the admin panel (single reads use httpResource in each page). */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  users(query: AdminUsersQuery): Promise<AdminUsersPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return firstValueFrom(this.http.get<AdminUsersPage>(`${ADMIN_API}/users`, { params }));
  }

  userAction(id: string, action: UserAction): Promise<AdminUserDetail> {
    return firstValueFrom(
      this.http.post<AdminUserDetail>(`${ADMIN_API}/users/${id}/${action}`, null),
    );
  }

  deleteUser(id: string, confirmEmail: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${ADMIN_API}/users/${id}`, { body: { confirmEmail } }),
    );
  }

  updateSetting(key: SettingKey, value: unknown): Promise<Setting> {
    return firstValueFrom(this.http.put<Setting>(`${ADMIN_API}/settings/${key}`, { value }));
  }

  audit(cursor: string | null, targetUserId?: string): Promise<AuditPage> {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    if (targetUserId) params = params.set('targetUserId', targetUserId);
    return firstValueFrom(this.http.get<AuditPage>(`${ADMIN_API}/audit`, { params }));
  }
}

/** An API timestamp as a date in Spanish ("27 oct 2026"). */
export function formatInstant(iso: string | null): string | null {
  return iso ? formatDate(localDateAt(new Date(iso))) : null;
}
