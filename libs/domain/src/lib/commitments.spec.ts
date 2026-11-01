import {
  commitmentsByMonth,
  CommitmentsInput,
  FixedCommitment,
  StatementCommitment,
} from './commitments';
import { ars, d, p, usd } from './test-helpers';

const heladera = (number: number) => ({
  chargeId: 'c1',
  description: 'Heladera',
  number,
  count: 12,
  amount: ars('45833.33'),
});

const statements: StatementCommitment[] = [
  {
    statementId: 'visa-oct',
    cardId: 'visa',
    dueDate: d('2026-11-05'),
    pending: [ars('45833.33'), usd('24.99')],
    partiallyPaid: false,
    installments: [
      heladera(5),
      { chargeId: 'c2', description: 'Spotify', number: 1, count: 1, amount: usd('24.99') },
    ],
  },
  {
    statementId: 'visa-nov',
    cardId: 'visa',
    dueDate: d('2026-12-05'),
    pending: [ars('45833.33'), usd('0')],
    partiallyPaid: false,
    installments: [heladera(6)],
  },
];

const rent: FixedCommitment = {
  id: 'rent',
  name: 'Alquiler',
  kind: 'EXPENSE',
  currency: 'ARS',
  intervalMonths: 1,
  dayOfMonth: 10,
  startPeriod: p('2026-01'),
  amounts: [
    { effectiveFrom: p('2026-01'), amount: ars('380000') },
    { effectiveFrom: p('2026-12'), amount: ars('450000') },
  ],
};

const salary: FixedCommitment = {
  id: 'salary',
  name: 'Sueldo',
  kind: 'INCOME',
  currency: 'ARS',
  intervalMonths: 1,
  dayOfMonth: 1,
  startPeriod: p('2026-01'),
  amounts: [{ effectiveFrom: p('2026-01'), amount: ars('1850000') }],
};

/** USD 9,99 on the Visa, which closes on the 20th and is due on the 5th. */
const netflix: FixedCommitment = {
  id: 'netflix',
  name: 'Netflix',
  kind: 'EXPENSE',
  currency: 'USD',
  intervalMonths: 1,
  dayOfMonth: 10,
  startPeriod: p('2026-11'),
  amounts: [{ effectiveFrom: p('2026-11'), amount: usd('9.99') }],
  cardId: 'visa',
};

const input: CommitmentsInput = {
  base: 'ARS',
  rates: '1200',
  statements,
  fixed: [rent, salary],
};

const amountOf = (totals: { byCurrency: { currency: string; toString(): string }[] }, c: string) =>
  totals.byCurrency.find((m) => m.currency === c)?.toString();

describe('commitmentsByMonth', () => {
  const months = commitmentsByMonth(input, p('2026-11'), 12);

  it('returns the requested months', () => {
    expect(months).toHaveLength(12);
    expect(months[0].period).toBe('2026-11');
    expect(months[11].period).toBe('2027-10');
  });

  it('adds the pending part of statements due in the month and fixed expenses, by currency', () => {
    const nov = months[0];
    expect(amountOf(nov.committed, 'ARS')).toBe('425833.33');
    expect(amountOf(nov.committed, 'USD')).toBe('24.99');
    // 425833.33 + 24.99 × 1200
    expect(nov.committed.base.toString()).toBe('455821.33');
    expect(nov.items.map((i) => i.type)).toEqual(['STATEMENT', 'STATEMENT', 'FIXED']);
  });

  it('keeps the installments of each statement as detail', () => {
    const [ars, dollars] = months[0].items;
    expect(ars.type === 'STATEMENT' && ars.installments.map((i) => i.number)).toEqual([5]);
    expect(dollars.type === 'STATEMENT' && dollars.installments.map((i) => i.description)).toEqual([
      'Spotify',
    ]);
  });

  it('uses the fixed amount in force each month', () => {
    expect(amountOf(months[1].committed, 'ARS')).toBe('495833.33');
    expect(amountOf(months[2].committed, 'ARS')).toBe('450000.00');
  });

  it('computes free = expected income − committed', () => {
    expect(months[0].expectedIncome.base.toString()).toBe('1850000.00');
    expect(months[0].free.toString()).toBe('1394178.67');
  });

  it('rejects an invalid number of months', () => {
    expect(() => commitmentsByMonth(input, p('2026-11'), 0)).toThrow();
  });
});

describe('commitmentsByMonth — one rule for Compromisos and the home screen', () => {
  it('a statement of $ 300.000 with $ 100.000 paid commits $ 200.000', () => {
    const [nov] = commitmentsByMonth(
      {
        base: 'ARS',
        rates: '1200',
        fixed: [],
        statements: [
          {
            statementId: 's',
            cardId: 'visa',
            dueDate: d('2026-11-05'),
            pending: [ars('200000')],
            partiallyPaid: true,
            installments: [
              {
                chargeId: 'n',
                description: 'Notebook',
                number: 1,
                count: 1,
                amount: ars('300000'),
              },
            ],
          },
        ],
      },
      p('2026-11'),
      1,
    );
    expect(nov.committed.base.toString()).toBe('200000.00');
    expect(nov.items[0]).toMatchObject({ type: 'STATEMENT', partiallyPaid: true });
  });

  it('a paid statement commits nothing (the caller leaves it out; nothing pending shows nothing)', () => {
    const [nov] = commitmentsByMonth(
      {
        base: 'ARS',
        rates: '1200',
        fixed: [],
        statements: [
          {
            statementId: 's',
            cardId: 'visa',
            dueDate: d('2026-11-05'),
            pending: [ars('0'), usd('0')],
            partiallyPaid: true,
            installments: [],
          },
        ],
      },
      p('2026-11'),
      1,
    );
    expect(nov.items).toEqual([]);
    expect(nov.committed.base.isZero()).toBe(true);
  });

  it('a USD 9,99 fixed on a card is committed in the month its statement is due', () => {
    const months = commitmentsByMonth(
      {
        base: 'ARS',
        rates: '1200',
        statements: [],
        fixed: [netflix],
        cards: [{ id: 'visa', closingDay: 20, dueDay: 5 }],
      },
      p('2026-11'),
      3,
    );
    // Nov 10 → statement closing Nov 20, due Dec 5; Dec 10 → due Jan 5.
    expect(months.map((m) => amountOf(m.committed, 'USD'))).toEqual([undefined, '9.99', '9.99']);
    expect(months[1].items[0]).toMatchObject({
      type: 'FIXED',
      name: 'Netflix',
      cardId: 'visa',
      date: '2026-12-05',
    });
  });

  it('a fixed on a card whose charge already exists is not counted twice', () => {
    const months = commitmentsByMonth(
      {
        base: 'ARS',
        rates: '1200',
        statements: [],
        fixed: [netflix],
        cards: [{ id: 'visa', closingDay: 20, dueDay: 5 }],
        fixedCharges: new Set(['netflix|2026-11']),
      },
      p('2026-11'),
      3,
    );
    expect(months.map((m) => amountOf(m.committed, 'USD'))).toEqual([undefined, undefined, '9.99']);
  });

  it('a fixed on a card follows the corrected dates of its statement', () => {
    const months = commitmentsByMonth(
      {
        base: 'ARS',
        rates: '1200',
        statements: [],
        fixed: [netflix],
        cards: [
          {
            id: 'visa',
            closingDay: 20,
            dueDay: 5,
            overrides: new Map([
              [p('2026-11'), { closingDate: d('2026-11-20'), dueDate: d('2026-11-30') }],
            ]),
          },
        ],
      },
      p('2026-11'),
      2,
    );
    // Nov 10 is due on the corrected Nov 30; Dec 10 is due on Jan 5, outside the range.
    expect(months.map((m) => amountOf(m.committed, 'USD'))).toEqual(['9.99', undefined]);
  });

  it('a fixed expense confirmed in the period leaves the committed; a pending one counts its own amount', () => {
    const base = { base: 'ARS' as const, rates: '1200', statements: [], fixed: [rent] };
    const [confirmed] = commitmentsByMonth(
      {
        ...base,
        fixedOccurrences: [
          { fixedId: 'rent', period: p('2026-11'), confirmed: true, amount: ars('380000') },
        ],
      },
      p('2026-11'),
      1,
    );
    expect(confirmed.committed.base.isZero()).toBe(true);
    const [pending] = commitmentsByMonth(
      {
        ...base,
        fixedOccurrences: [
          { fixedId: 'rent', period: p('2026-11'), confirmed: false, amount: ars('400000') },
        ],
      },
      p('2026-11'),
      1,
    );
    expect(pending.committed.base.toString()).toBe('400000.00');
  });

  it('scheduled expenses are committed and scheduled incomes expected, in their month (MOV-08)', () => {
    const months = commitmentsByMonth(
      {
        base: 'ARS',
        rates: '1200',
        statements: [],
        fixed: [],
        scheduled: [
          {
            id: 't',
            kind: 'EXPENSE',
            date: d('2026-11-20'),
            amount: ars('45000'),
            description: 'Turno médico',
          },
          {
            id: 'b',
            kind: 'INCOME',
            date: d('2026-12-15'),
            amount: ars('100000'),
            description: 'Bono',
          },
        ],
      },
      p('2026-11'),
      2,
    );
    expect(months[0].committed.base.toString()).toBe('45000.00');
    expect(months[0].items[0]).toMatchObject({ type: 'SCHEDULED', description: 'Turno médico' });
    expect(months[1].expectedIncome.base.toString()).toBe('100000.00');
    expect(months[1].committed.base.isZero()).toBe(true);
  });
});
