import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { MyPlan, PublicPlan } from '@platin/contracts';
import { PlanStore } from './plan.store';

const limits = (overrides: Partial<PublicPlan['limits']> = {}): PublicPlan['limits'] => ({
  maxAccounts: 2,
  maxPockets: 6,
  maxCards: 1,
  maxGoals: 1,
  maxFixed: 5,
  investments: false,
  ...overrides,
});

const plan = (id: string, name: string, overrides: Partial<PublicPlan['limits']> = {}) => ({
  id,
  key: name.toLowerCase(),
  name,
  description: '',
  priceArs: null,
  limits: limits(overrides),
  isDefault: id === 'free',
});

const FREE = plan('free', 'Gratis');
const PLUS = plan('plus', 'Plus', { maxAccounts: 5 });
const PRO = plan('pro', 'Pro', { maxAccounts: null, investments: true });

const myPlan: MyPlan = {
  plan: FREE,
  source: 'DEFAULT',
  endsAt: null,
  usage: { accounts: 2, pockets: 3, cards: 0, goals: 0, fixed: 0 },
  pendingRequest: null,
};

describe('PlanStore (PLN-07)', () => {
  async function load(): Promise<PlanStore> {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const store = TestBed.inject(PlanStore);
    TestBed.tick();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/me/plan').flush(myPlan);
    http.expectOne('/api/v1/plans').flush([FREE, PLUS, PRO]);
    // httpResource publishes the answer after a turn of the event loop.
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    return store;
  }

  it('allows everything until the plan loads: the API has the last word', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const store = TestBed.inject(PlanStore);
    expect(store.can('investments')).toBe(true);
    expect(store.block(['accounts', 'investments'])).toBeNull();
    expect(store.remaining('accounts')).toBeNull();
  });

  it('knows usage, what is left and what is blocked', async () => {
    const store = await load();
    expect(store.can('investments')).toBe(false);
    expect(store.usage('accounts')).toEqual({ used: 2, limit: 2 });
    expect(store.remaining('pockets')).toBe(3);
    expect(store.block('pockets')).toBeNull();
    expect(store.block([])).toBeNull();
  });

  it('names the first plan, in order, that would allow it', async () => {
    const store = await load();
    expect(store.block(['accounts', 'pockets'])).toEqual({
      kind: 'limit',
      plan: 'Gratis',
      resource: 'accounts',
      limit: 2,
      upgrade: 'Plus',
    });
    expect(store.block('investments')).toEqual({
      kind: 'feature',
      plan: 'Gratis',
      feature: 'investments',
      upgrade: 'Pro',
    });
  });
});
