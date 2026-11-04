import { accountSelectOptions } from './account-select';
import { PlPocketOption, pocketLabel } from './pocket-select';

const pocket = (overrides: Partial<PlPocketOption>): PlPocketOption => ({
  id: 'p',
  name: 'Disponible',
  accountId: 'a',
  accountName: 'Galicia',
  kind: 'AVAILABLE',
  currency: 'ARS',
  balance: '1000.00',
  archived: false,
  ...overrides,
});

describe('pocketLabel', () => {
  it('names an account balance by its account, with the currency when not pesos', () => {
    expect(pocketLabel(pocket({}))).toBe('Galicia');
    expect(pocketLabel(pocket({ currency: 'USD' }))).toBe('Galicia · USD');
  });

  it('names a reserve by its name, or with its account', () => {
    const auto = pocket({ name: 'Auto', kind: 'SAVINGS' });
    expect(pocketLabel(auto)).toBe('Galicia · Auto');
    expect(pocketLabel(auto, 'pocket')).toBe('Auto');
  });
});

describe('accountSelectOptions', () => {
  const pockets = [
    pocket({ id: 'ars' }),
    pocket({ id: 'usd', currency: 'USD' }),
    pocket({ id: 'cuotas', name: 'Cuotas', kind: 'SPENDING' }),
    pocket({ id: 'auto', name: 'Auto', kind: 'SAVINGS' }),
  ];

  it('lists only account balances', () => {
    expect(accountSelectOptions(pockets, false).map((o) => o.label)).toEqual([
      'Galicia',
      'Galicia · USD',
    ]);
  });

  it('adds spending reserves for card payments', () => {
    expect(accountSelectOptions(pockets, false, true).map((o) => o.value)).toEqual([
      'ars',
      'usd',
      'cuotas',
    ]);
  });
});
