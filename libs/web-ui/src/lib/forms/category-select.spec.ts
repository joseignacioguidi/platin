import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucidePlus, LucideUtensils, provideLucideIcons } from '@lucide/angular';
import type { CategoryKind } from '@platin/domain';
import { PlSegmented, PlSegmentOption } from '../segmented/segmented';
import { PL_CATEGORY_CREATOR, PlCategoryOption, PlCategorySelect } from './category-select';

const food: PlCategoryOption = {
  id: 'c1',
  name: 'Comida',
  kind: 'EXPENSE',
  icon: 'utensils',
  color: 'expense',
  parentId: null,
  archived: false,
};

@Component({
  imports: [PlCategorySelect, PlSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-category-select
      id="with-create"
      allowCreate
      kind="EXPENSE"
      [categories]="categories"
      [(value)]="categoryId"
    />
    <pl-category-select id="plain" kind="EXPENSE" [categories]="categories" />
    <pl-segmented
      label="Para qué es"
      [options]="kinds"
      [(value)]="kind"
      (lockedChoose)="locked.set($event)"
    />
  `,
})
class Host {
  readonly categories = [food];
  readonly categoryId = signal<string | null>(null);
  readonly kinds: PlSegmentOption<string>[] = [
    { value: 'SAVINGS', label: 'Ahorro' },
    { value: 'INVESTMENT', label: 'Inversión', locked: true, badge: 'Pro', lockedLabel: 'Pro' },
    { value: 'AVAILABLE', label: 'Disponible' },
  ];
  readonly kind = signal('SAVINGS');
  readonly locked = signal<string | null>(null);
}

describe('pl-category-select with allowCreate (CAT-06) and locked segments (PLN-07)', () => {
  const creator = {
    calls: [] as [CategoryKind, string][],
    async create(kind: CategoryKind, name: string): Promise<PlCategoryOption | null> {
      this.calls.push([kind, name]);
      return { ...food, id: 'c2', name: name || 'Gimnasio' };
    },
  };

  beforeEach(() => {
    creator.calls = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PL_CATEGORY_CREATOR, useValue: creator },
        provideLucideIcons(LucideUtensils, LucidePlus),
      ],
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });
  });

  afterEach(() => document.querySelector('.cdk-overlay-container')?.replaceChildren());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const optionLabels = () =>
    [...document.querySelectorAll('[role=option]')].map((o) =>
      o.querySelector('.flex-1')?.textContent?.trim(),
    );

  it('ends the list with "+ Nueva categoría" and chooses the created category', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('#with-create button')?.click();
    await fixture.whenStable();
    expect(optionLabels()).toEqual(['Comida', '+ Nueva categoría']);

    (document.querySelectorAll('[role=option]')[1] as HTMLElement).click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(creator.calls).toEqual([['EXPENSE', '']]);
    expect(fixture.componentInstance.categoryId()).toBe('c2');
    // Shown even before the categories list reloads with it.
    expect(el.querySelector('#with-create button')?.textContent).toContain('Gimnasio');
  });

  it('keeps the action visible while searching, never as the selected option', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('#with-create button')?.click();
    await fixture.whenStable();
    // Fewer than 8 options: no search box, but the action is still last and unselected.
    const action = document.querySelectorAll('[role=option]')[1];
    expect(action.getAttribute('aria-selected')).toBe('false');
  });

  it('offers no action without allowCreate', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('#plain button')?.click();
    await fixture.whenStable();
    expect(optionLabels()).toEqual(['Comida']);
  });

  it('a locked segment shows its plan mark and emits instead of changing the value', async () => {
    const { fixture, el } = await render();
    const radios = [...el.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    expect(radios[1].textContent).toContain('Pro');
    radios[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.kind()).toBe('SAVINGS');
    expect(fixture.componentInstance.locked()).toBe('INVESTMENT');

    // Arrows skip the locked option.
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.kind()).toBe('AVAILABLE');
  });
});
