import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { Movement, MovementsPage, MovementsQuery } from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { errorMessage } from '../../core/errors';

export type MovementFilters = Omit<MovementsQuery, 'cursor' | 'limit'>;

/**
 * A paginated list of movements for one screen (provide it in the component). Reloads from
 * the first page when the filters change or when movements are invalidated.
 */
@Injectable()
export class MovementsList {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  private readonly pages = signal<Movement[]>([]);
  private readonly cursor = signal<string | null>(null);
  private filters: MovementFilters = {};
  private request = 0;

  readonly items = this.pages.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = computed(() => this.cursor() !== null);
  readonly loaded = signal(false);

  constructor() {
    reloadOn(this.bus, ['movements'], () => void this.load(this.filters));
  }

  async load(filters: MovementFilters): Promise<void> {
    this.filters = filters;
    this.cursor.set(null);
    await this.fetch(true);
  }

  async loadMore(): Promise<void> {
    if (!this.cursor() || this.loading()) return;
    await this.fetch(false);
  }

  private async fetch(reset: boolean): Promise<void> {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    let params = new HttpParams().set('limit', 30);
    for (const [key, value] of Object.entries(this.filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    const cursor = this.cursor();
    if (!reset && cursor) params = params.set('cursor', cursor);
    try {
      const page = await firstValueFrom(
        this.http.get<MovementsPage>(`${API}/movements`, { params }),
      );
      if (id !== this.request) return; // A newer request replaced this one.
      this.pages.update((items) => (reset ? page.items : [...items, ...page.items]));
      this.cursor.set(page.nextCursor);
      this.loaded.set(true);
    } catch (error) {
      if (id === this.request) this.error.set(errorMessage(error));
    } finally {
      if (id === this.request) this.loading.set(false);
    }
  }
}
