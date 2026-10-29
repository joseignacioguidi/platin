import { checkLimit, hasFeature, PlanLimits, resolveCurrentPlan } from './plans';

const free: PlanLimits = {
  maxAccounts: 2,
  maxPockets: 3,
  maxCards: 1,
  maxGoals: 1,
  maxFixed: 5,
  investments: false,
};
const pro: PlanLimits = {
  maxAccounts: null,
  maxPockets: null,
  maxCards: null,
  maxGoals: null,
  maxFixed: null,
  investments: true,
};

const at = (iso: string) => new Date(iso);

describe('plans', () => {
  it('a null limit is unlimited', () => {
    expect(checkLimit(pro, 'accounts', 1_000)).toEqual({
      allowed: true,
      resource: 'accounts',
      limit: null,
      used: 1_000,
    });
  });

  it('under the limit it can create; at the limit it cannot', () => {
    expect(checkLimit(free, 'accounts', 1).allowed).toBe(true);
    expect(checkLimit(free, 'accounts', 2)).toEqual({
      allowed: false,
      resource: 'accounts',
      limit: 2,
      used: 2,
    });
  });

  it('above the limit (after a downgrade) it cannot create either', () => {
    expect(checkLimit(free, 'cards', 4).allowed).toBe(false);
  });

  it('archived records are not counted: the caller passes only the active ones', () => {
    // 2 accounts, one of them archived: used = 1.
    expect(checkLimit(free, 'accounts', 1).allowed).toBe(true);
  });

  it('features are enabled per plan', () => {
    expect(hasFeature(free, 'investments')).toBe(false);
    expect(hasFeature(pro, 'investments')).toBe(true);
  });

  describe('resolveCurrentPlan', () => {
    const now = at('2026-10-28T15:00:00Z');

    it('without assignments, the default plan', () => {
      expect(resolveCurrentPlan([], 'free', now)).toEqual({ planId: 'free', current: null });
    });

    it('the latest assignment that is in force wins', () => {
      const plans = [
        { planId: 'free', startsAt: at('2026-01-01T00:00:00Z'), endsAt: null },
        { planId: 'pro', startsAt: at('2026-10-01T00:00:00Z'), endsAt: null },
      ];
      expect(resolveCurrentPlan(plans, 'free', now).planId).toBe('pro');
    });

    it('an expired plan falls back to the previous one in force, or the default', () => {
      const trial = {
        planId: 'pro',
        startsAt: at('2026-09-01T00:00:00Z'),
        endsAt: at('2026-10-01T03:00:00Z'),
      };
      expect(resolveCurrentPlan([trial], 'free', now).planId).toBe('free');
      const base = { planId: 'free', startsAt: at('2026-01-01T00:00:00Z'), endsAt: null };
      expect(resolveCurrentPlan([base, trial], 'other', now).planId).toBe('free');
    });

    it('a plan ends exactly at endsAt', () => {
      const trial = { planId: 'pro', startsAt: at('2026-10-01T00:00:00Z'), endsAt: now };
      expect(resolveCurrentPlan([trial], 'free', now).planId).toBe('free');
      expect(resolveCurrentPlan([trial], 'free', at('2026-10-28T14:59:59Z')).planId).toBe('pro');
    });

    it('a plan that has not started yet does not apply', () => {
      const future = { planId: 'pro', startsAt: at('2026-11-01T00:00:00Z'), endsAt: null };
      expect(resolveCurrentPlan([future], 'free', now).planId).toBe('free');
    });
  });
});
