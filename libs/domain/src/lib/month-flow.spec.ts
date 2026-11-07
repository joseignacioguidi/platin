import { Currency } from './enums';
import { Money } from './money';
import { MonthFlowCurrency, MonthFlowMismatchError, monthFlow, MonthFlow } from './month-flow';
import { ars, usd } from './test-helpers';

/** A currency's month with zeros where not given; `closing` is what the flow reaches. */
function flowOf(
  currency: Currency,
  parts: Partial<Omit<MonthFlowCurrency, 'currency'>>,
): MonthFlowCurrency {
  const zero = Money.zero(currency);
  const flow = {
    currency,
    opening: zero,
    income: zero,
    expenses: zero,
    statementPayments: zero,
    toReserves: zero,
    fromReserves: zero,
    adjustments: zero,
    exchanged: zero,
    ...parts,
  };
  const closing =
    parts.closing ??
    flow.opening
      .add(flow.income)
      .subtract(flow.expenses)
      .subtract(flow.statementPayments)
      .subtract(flow.toReserves)
      .add(flow.fromReserves)
      .add(flow.adjustments)
      .add(flow.exchanged);
  return { ...flow, closing };
}

const strings = (flow: MonthFlow) =>
  Object.fromEntries(Object.entries(flow).map(([key, money]) => [key, money.toString()]));

/** The identity of the rule, in base currency. */
function closes(flow: MonthFlow): boolean {
  return flow.opening
    .add(flow.received)
    .add(flow.toCollect)
    .add(flow.other)
    .equals(flow.paidOut.add(flow.reserved).add(flow.toPay).add(flow.free));
}

describe('Cómo se llega al libre (spec example)', () => {
  // Tenías $ 300.000; cobraste $ 1.600.000 y faltan $ 400.000; pagaste $ 650.000.
  const example = (reserved: string) => {
    const pesos = flowOf('ARS', {
      opening: ars('300000'),
      income: ars('1600000'),
      expenses: ars('650000'),
      toReserves: ars(reserved),
    });
    return monthFlow({
      base: 'ARS',
      rates: null,
      currencies: [pesos],
      inAccounts: pesos.closing,
      toCollect: ars('400000'),
      toPay: ars('397218'),
    });
  };

  it('reserving $ 904.000: in your accounts $ 346.000 and free $ 348.782', () => {
    const flow = example('904000');
    expect(strings(flow)).toEqual({
      opening: '300000.00',
      received: '1600000.00',
      toCollect: '400000.00',
      paidOut: '650000.00',
      reserved: '904000.00',
      other: '0.00',
      toPay: '397218.00',
      inAccounts: '346000.00',
      free: '348782.00',
    });
    expect(closes(flow)).toBe(true);
    // The bar measures $ 2.300.000 = 650.000 + 904.000 + 397.218 + 348.782.
    const had = flow.opening.add(flow.received).add(flow.toCollect);
    expect(had.toString()).toBe('2300000.00');
    expect(flow.paidOut.add(flow.reserved).add(flow.toPay).add(flow.free).toString()).toBe(
      '2300000.00',
    );
  });

  it('reserving $ 1.300.000: in your accounts −$ 50.000 and free −$ 47.218', () => {
    const flow = example('1300000');
    expect(flow.inAccounts.toString()).toBe('-50000.00');
    expect(flow.free.toString()).toBe('-47218.00');
    expect(closes(flow)).toBe(true);
    // What went exceeds what there was by exactly the free amount.
    const had = flow.opening.add(flow.received).add(flow.toCollect);
    const went = flow.paidOut.add(flow.reserved).add(flow.toPay);
    expect(went.subtract(had).toString()).toBe('47218.00');
  });
});

describe('monthFlow', () => {
  it('changing pesos to dollars within the accounts leaves the difference in "otros"', () => {
    // $ 120.000 for USD 100 (1.200 each); today the dollar is worth 1.250.
    const pesos = flowOf('ARS', {
      opening: ars('500000'),
      income: ars('100000'),
      exchanged: ars('-120000'),
    });
    const dollars = flowOf('USD', { opening: usd('10'), exchanged: usd('100') });
    const flow = monthFlow({
      base: 'ARS',
      rates: { USD: '1250' },
      currencies: [pesos, dollars],
      // ARS 480.000 + USD 110 × 1.250.
      inAccounts: ars('617500'),
      toCollect: ars('0'),
      toPay: ars('0'),
    });
    expect(strings(flow)).toMatchObject({
      opening: '512500.00',
      received: '100000.00',
      other: '5000.00',
      free: '617500.00',
    });
    expect(closes(flow)).toBe(true);
  });

  it('a positive adjustment adds to what there was', () => {
    const pesos = flowOf('ARS', { opening: ars('1000'), adjustments: ars('250') });
    const flow = monthFlow({
      base: 'ARS',
      rates: null,
      currencies: [pesos],
      inAccounts: pesos.closing,
      toCollect: ars('0'),
      toPay: ars('100'),
    });
    expect(flow.other.toString()).toBe('250.00');
    expect(flow.free.toString()).toBe('1150.00');
    expect(closes(flow)).toBe(true);
  });

  it('a negative adjustment goes with what went', () => {
    const pesos = flowOf('ARS', {
      opening: ars('1000'),
      expenses: ars('200'),
      adjustments: ars('-50'),
    });
    const flow = monthFlow({
      base: 'ARS',
      rates: null,
      currencies: [pesos],
      inAccounts: pesos.closing,
      toCollect: ars('0'),
      toPay: ars('0'),
    });
    expect(strings(flow)).toMatchObject({ paidOut: '200.00', other: '-50.00', free: '750.00' });
    expect(closes(flow)).toBe(true);
  });

  it('a previous month: what there was, what came in, went out and was left', () => {
    // No "to collect" nor "to pay": the free amount is what was left on its last day.
    const pesos = flowOf('ARS', {
      opening: ars('200000'),
      income: ars('900000'),
      expenses: ars('300000'),
      statementPayments: ars('150000'),
      toReserves: ars('400000'),
      fromReserves: ars('50000'),
    });
    const flow = monthFlow({
      base: 'ARS',
      rates: null,
      currencies: [pesos],
      inAccounts: pesos.closing,
      toCollect: ars('0'),
      toPay: ars('0'),
    });
    expect(strings(flow)).toMatchObject({
      paidOut: '450000.00',
      reserved: '350000.00',
      free: '300000.00',
      inAccounts: '300000.00',
    });
    expect(closes(flow)).toBe(true);
  });

  it('a month without an opening balance', () => {
    const pesos = flowOf('ARS', { income: ars('500000'), expenses: ars('120000') });
    const flow = monthFlow({
      base: 'ARS',
      rates: null,
      currencies: [pesos],
      inAccounts: pesos.closing,
      toCollect: ars('100000'),
      toPay: ars('80000'),
    });
    expect(strings(flow)).toMatchObject({ opening: '0.00', other: '0.00', free: '400000.00' });
    expect(closes(flow)).toBe(true);
  });

  it('puts the cents of valuing each part in "otros", so it always closes', () => {
    // USD 0,01 parts at 1.234,5678: each part rounds on its own.
    const dollars = flowOf('USD', {
      opening: usd('0.01'),
      income: usd('0.01'),
    });
    const flow = monthFlow({
      base: 'ARS',
      rates: { USD: '1234.5678' },
      currencies: [dollars],
      // USD 0,02 is 24,69; each part alone is 12,35.
      inAccounts: ars('24.69'),
      toCollect: ars('0'),
      toPay: ars('0'),
    });
    expect(flow.free.toString()).toBe('24.69');
    expect(flow.other.toString()).toBe('-0.01');
    expect(closes(flow)).toBe(true);
  });

  it('a currency without a rate is worth zero, as in your accounts', () => {
    const euros = flowOf('EUR', { opening: Money.of('100', 'EUR') });
    const flow = monthFlow({
      base: 'ARS',
      rates: { USD: '1200' },
      currencies: [euros],
      inAccounts: ars('0'),
      toCollect: ars('0'),
      toPay: ars('0'),
    });
    expect(flow.opening.toString()).toBe('0.00');
    expect(closes(flow)).toBe(true);
  });

  it('fails when a currency does not close (a movement was left out)', () => {
    const pesos = flowOf('ARS', { opening: ars('1000'), closing: ars('900') });
    expect(() =>
      monthFlow({
        base: 'ARS',
        rates: null,
        currencies: [pesos],
        inAccounts: ars('900'),
        toCollect: ars('0'),
        toPay: ars('0'),
      }),
    ).toThrow(MonthFlowMismatchError);
  });
});
