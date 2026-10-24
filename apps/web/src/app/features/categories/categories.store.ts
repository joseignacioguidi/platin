import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { Category, CreateCategoryRequest } from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';

const RECENT_KEY = 'platin.recentCategories';
const RECENT_LIMIT = 5;

/** Before the user has history, the most common suggested categories go first. */
const POPULAR = [
  'Supermercado',
  'Delivery',
  'Salidas',
  'Nafta',
  'Farmacia',
  'Transporte',
  'Sueldo',
  'Freelance',
  'Ventas',
];

function popularity(name: string): number {
  const index = POPULAR.indexOf(name);
  return index === -1 ? POPULAR.length : index;
}

@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<Category[]>(() => `${API}/categories`);
  readonly categories = computed(() => this.resource.value() ?? []);

  constructor() {
    reloadOn(this.bus, ['categories'], () => this.resource.reload());
  }

  ofKind(kind: CategoryKind): Category[] {
    return this.categories().filter((category) => category.kind === kind);
  }

  byId(id: string | null | undefined): Category | undefined {
    return this.categories().find((category) => category.id === id);
  }

  /** Recently used categories of a kind first, then the rest up to the limit. */
  recent(kind: CategoryKind): Category[] {
    const all = this.ofKind(kind);
    const recentIds = this.readRecent();
    const recent = recentIds
      .map((id) => all.find((category) => category.id === id))
      .filter((category): category is Category => category !== undefined);
    const rest = all
      .filter((category) => !recentIds.includes(category.id))
      .sort((a, b) => popularity(a.name) - popularity(b.name));
    return [...recent, ...rest].slice(0, RECENT_LIMIT);
  }

  markUsed(id: string): void {
    const next = [id, ...this.readRecent().filter((existing) => existing !== id)].slice(0, 20);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Private mode.
    }
  }

  async create(request: CreateCategoryRequest): Promise<Category> {
    const category = await firstValueFrom(this.http.post<Category>(`${API}/categories`, request));
    this.bus.invalidate('categories');
    return category;
  }

  private readRecent(): string[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
}
