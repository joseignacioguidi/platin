import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AdminPlan,
  AdminPlanRequest,
  AdminUserDetail,
  AssignPlanRequest,
  CreatePlanRequest,
  UpdatePlanRequest,
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

  plans(): Promise<AdminPlan[]> {
    return firstValueFrom(this.http.get<AdminPlan[]>(`${ADMIN_API}/plans`));
  }

  createPlan(request: CreatePlanRequest): Promise<AdminPlan> {
    return firstValueFrom(this.http.post<AdminPlan>(`${ADMIN_API}/plans`, request));
  }

  updatePlan(id: string, changes: UpdatePlanRequest): Promise<AdminPlan> {
    return firstValueFrom(this.http.patch<AdminPlan>(`${ADMIN_API}/plans/${id}`, changes));
  }

  assignPlan(userId: string, request: AssignPlanRequest): Promise<AdminUserDetail> {
    return firstValueFrom(
      this.http.post<AdminUserDetail>(`${ADMIN_API}/users/${userId}/plan`, request),
    );
  }

  planRequests(status?: AdminPlanRequest['status']): Promise<AdminPlanRequest[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return firstValueFrom(
      this.http.get<AdminPlanRequest[]>(`${ADMIN_API}/plan-requests`, { params }),
    );
  }

  decidePlanRequest(id: string, approve: boolean): Promise<AdminPlanRequest> {
    const action = approve ? 'approve' : 'reject';
    return firstValueFrom(
      this.http.post<AdminPlanRequest>(`${ADMIN_API}/plan-requests/${id}/${action}`, null),
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
