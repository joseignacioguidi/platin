import { describe, expect, it } from 'vitest';
import {
  checkDailyLimit,
  type DuplicateCandidate,
  type ExternalMovementInput,
  type FeedPlanContext,
  feedDescription,
  findDuplicate,
  planExternalMovement,
  suggestedRulePattern,
} from './account-feed';
import type { LocalDate } from './dates';
import { DEFAULT_MERCHANT_RULES } from './merchant-rules';

const d = (value: string) => value as LocalDate;

function movement(overrides: Partial<ExternalMovementInput> = {}): ExternalMovementInput {
  return {
    externalId: 'mp-1',
    kind: 'EXPENSE',
    amount: '3500.00',
    currency: 'ARS',
    date: d('2026-11-23'),
    occurredAt: '2026-11-23T12:00:00.000Z',
    description: 'Café Martínez',
    ...overrides,
  };
}

function candidate(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    kind: 'TRANSACTION',
    id: 'tx-1',
    direction: 'OUT',
    amount: '3500.00',
    currency: 'ARS',
    date: d('2026-11-23'),
    createdAt: '2026-11-23T10:00:00.000Z',
    ...overrides,
  };
}

const base: FeedPlanContext = {
  accountId: 'acc-mp',
  pockets: [
    { id: 'mp-ars', kind: 'AVAILABLE', currency: 'ARS' },
    { id: 'mp-usd', kind: 'AVAILABLE', currency: 'USD' },
    { id: 'mp-vacaciones', kind: 'SAVINGS', currency: 'ARS' },
    { id: 'mp-dolares-ahorro', kind: 'SAVINGS', currency: 'USD' },
  ],
  enabledCurrencies: ['ARS', 'USD'],
  reserves: [
    { externalReserveId: 'res-vacaciones', pocketId: 'mp-vacaciones' },
    { externalReserveId: 'res-sin-asignar', pocketId: null },
  ],
  candidates: [],
  rules: [{ pattern: 'cafe', categoryId: 'cat-cafes' }],
  globalRules: DEFAULT_MERCHANT_RULES,
  categories: [
    { id: 'cat-cafes', name: 'Cafés', kind: 'EXPENSE' },
    { id: 'cat-super', name: 'Supermercado', kind: 'EXPENSE' },
    { id: 'cat-ventas', name: 'Ventas', kind: 'INCOME' },
  ],
  yieldCategoryId: 'cat-rendimientos',
  usedOnDay: 0,
  limit: null,
};
const context = (overrides: Partial<FeedPlanContext> = {}): FeedPlanContext => ({
  ...base,
  ...overrides,
});

describe('planExternalMovement: qué se crea', () => {
  it('una salida del saldo es un gasto en el Disponible de esa moneda, con la regla del usuario', () => {
    expect(planExternalMovement(movement(), context())).toEqual({
      action: 'CREATE_TRANSACTION',
      type: 'EXPENSE',
      pocketId: 'mp-ars',
      categoryId: 'cat-cafes',
      description: 'Café Martínez',
    });
  });

  it('las reglas globales aplican si el usuario tiene la categoría con ese nombre', () => {
    const plan = planExternalMovement(movement({ description: 'COTO Sucursal 123' }), context());
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION', categoryId: 'cat-super' });
  });

  it('las reglas buscan palabras enteras: "cafetería" no es "cafe"', () => {
    const plan = planExternalMovement(movement({ description: 'Cafetería del centro' }), context());
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION', categoryId: null });
  });

  it('sin regla que aplique entra igual, sin categoría (Para categorizar)', () => {
    const plan = planExternalMovement(movement({ description: 'Juan Pérez' }), context());
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION', type: 'EXPENSE', categoryId: null });
  });

  it('una entrada al saldo es un ingreso, buscando entre las categorías de ingresos', () => {
    const plan = planExternalMovement(
      movement({ kind: 'INCOME', amount: '20000.00', description: 'Café Martínez' }),
      context(),
    );
    // "cafe" apunta a una categoría de gastos: no sirve para un ingreso.
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION', type: 'INCOME', categoryId: null });
  });

  it('un rendimiento es un ingreso en Rendimientos', () => {
    const plan = planExternalMovement(
      movement({ kind: 'YIELD', amount: '12.34', description: 'Rendimientos' }),
      context(),
    );
    expect(plan).toEqual({
      action: 'CREATE_TRANSACTION',
      type: 'INCOME',
      pocketId: 'mp-ars',
      categoryId: 'cat-rendimientos',
      description: 'Rendimientos',
    });
  });

  it('un movimiento en dólares va al Disponible en dólares', () => {
    const plan = planExternalMovement(movement({ currency: 'USD', amount: '10.00' }), context());
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION', pocketId: 'mp-usd' });
  });

  it('el motivo se recorta a 120 caracteres', () => {
    const plan = planExternalMovement(movement({ description: 'x'.repeat(300) }), context());
    expect(plan).toMatchObject({ description: 'x'.repeat(120) });
  });
});

describe('planExternalMovement: devoluciones', () => {
  it('la devolución de un gasto ya traído es un ingreso con "Devolución: {motivo original}"', () => {
    const plan = planExternalMovement(
      movement({ kind: 'REFUND', direction: 'IN', refundOf: 'mp-0', description: 'Refund' }),
      context({ refunded: { description: 'Café Martínez' } }),
    );
    expect(plan).toEqual({
      action: 'CREATE_TRANSACTION',
      type: 'INCOME',
      pocketId: 'mp-ars',
      categoryId: null,
      description: 'Devolución: Café Martínez',
    });
  });

  it('la devolución de un cobro es un gasto', () => {
    const plan = planExternalMovement(
      movement({ kind: 'REFUND', direction: 'OUT', description: 'Venta remera' }),
      context(),
    );
    expect(plan).toMatchObject({
      action: 'CREATE_TRANSACTION',
      type: 'EXPENSE',
      description: 'Devolución: Venta remera',
    });
  });

  it('sin el original (anterior a la conexión), usa su propio motivo', () => {
    expect(feedDescription(movement({ kind: 'REFUND', description: 'Café Martínez' }))).toBe(
      'Devolución: Café Martínez',
    );
  });

  it('una devolución sin sentido informado es plata que vuelve: un ingreso', () => {
    const plan = planExternalMovement(movement({ kind: 'REFUND', direction: null }), context());
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION', type: 'INCOME' });
  });
});

describe('planExternalMovement: reservas y monedas', () => {
  it('del saldo a una reserva asignada es una transferencia (apartar)', () => {
    const plan = planExternalMovement(
      movement({
        kind: 'RESERVE_IN',
        externalReserveId: 'res-vacaciones',
        description: 'Vacaciones',
      }),
      context(),
    );
    expect(plan).toEqual({
      action: 'CREATE_TRANSFER',
      fromPocketId: 'mp-ars',
      toPocketId: 'mp-vacaciones',
      amountOut: '3500.00',
      amountIn: '3500.00',
      description: 'Vacaciones',
    });
  });

  it('de la reserva al saldo es la transferencia contraria (retirar)', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_OUT', externalReserveId: 'res-vacaciones' }),
      context(),
    );
    expect(plan).toMatchObject({ fromPocketId: 'mp-vacaciones', toPocketId: 'mp-ars' });
  });

  it('una reserva sin asignar queda en Para revisar', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_IN', externalReserveId: 'res-sin-asignar' }),
      context(),
    );
    expect(plan).toEqual({ action: 'HOLD', reason: 'RESERVE_NOT_MAPPED' });
  });

  it('una reserva que platin no conoce todavía también', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_OUT', externalReserveId: 'res-nueva' }),
      context(),
    );
    expect(plan).toEqual({ action: 'HOLD', reason: 'RESERVE_NOT_MAPPED' });
  });

  it('una reserva asignada a un apartado archivado (fuera de los activos) vuelve a Para revisar', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_IN', externalReserveId: 'res-vacaciones' }),
      context({ pockets: base.pockets.filter((pocket) => pocket.id !== 'mp-vacaciones') }),
    );
    expect(plan).toEqual({ action: 'HOLD', reason: 'RESERVE_NOT_MAPPED' });
  });

  it('una reserva en otra moneda que el movimiento no se usa', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_IN', currency: 'USD', externalReserveId: 'res-vacaciones' }),
      context(),
    );
    expect(plan).toEqual({ action: 'HOLD', reason: 'RESERVE_NOT_MAPPED' });
  });

  it('la compra de dólares es una transferencia entre los dos saldos, con los dos montos', () => {
    const plan = planExternalMovement(
      movement({
        kind: 'FX',
        amount: '150000.00',
        currency: 'ARS',
        amountIn: '100.00',
        currencyIn: 'USD',
        description: 'Compra de dólares',
      }),
      context(),
    );
    expect(plan).toEqual({
      action: 'CREATE_TRANSFER',
      fromPocketId: 'mp-ars',
      toPocketId: 'mp-usd',
      amountOut: '150000.00',
      amountIn: '100.00',
      description: 'Compra de dólares',
    });
  });

  it('la venta de dólares va del saldo en dólares al de pesos', () => {
    const plan = planExternalMovement(
      movement({
        kind: 'FX',
        amount: '100.00',
        currency: 'USD',
        amountIn: '140000.00',
        currencyIn: 'ARS',
      }),
      context(),
    );
    expect(plan).toMatchObject({
      fromPocketId: 'mp-usd',
      toPocketId: 'mp-ars',
      amountIn: '140000.00',
    });
  });

  it('una compra de moneda sin el otro monto queda para revisar', () => {
    const plan = planExternalMovement(movement({ kind: 'FX', currencyIn: 'USD' }), context());
    expect(plan).toMatchObject({ action: 'HOLD' });
  });

  it('una moneda no activada queda en Para revisar, también del lado que entra en FX', () => {
    expect(planExternalMovement(movement({ currency: 'BRL' }), context())).toEqual({
      action: 'HOLD',
      reason: 'CURRENCY_NOT_ENABLED',
    });
    const fx = movement({ kind: 'FX', amountIn: '20.00', currencyIn: 'EUR' });
    expect(planExternalMovement(fx, context())).toEqual({
      action: 'HOLD',
      reason: 'CURRENCY_NOT_ENABLED',
    });
  });

  it('una moneda activada que la cuenta no tiene queda en Para revisar', () => {
    const plan = planExternalMovement(
      movement({ currency: 'EUR' }),
      context({ enabledCurrencies: ['ARS', 'USD', 'EUR'] }),
    );
    expect(plan).toEqual({ action: 'HOLD', reason: 'NO_BALANCE_IN_CURRENCY' });
  });

  it('sin cuenta de platin conectada (archivada), todo espera', () => {
    expect(planExternalMovement(movement(), context({ accountId: null }))).toEqual({
      action: 'HOLD',
      reason: 'NO_ACCOUNT',
    });
  });
});

describe('Ya lo cargaste (MPG-06)', () => {
  it('ejemplo: "café 3500 mp" el 23/11 y llega el pago de $ 3.500 del 23/11 → se vincula', () => {
    const telegram = candidate({ id: 'tx-telegram', date: d('2026-11-23') });
    const plan = planExternalMovement(
      movement({ date: d('2026-11-23') }),
      context({ candidates: [telegram] }),
    );
    expect(plan).toEqual({ action: 'LINK', transactionId: 'tx-telegram' });
  });

  it('ejemplo: si llega uno de $ 3.600, se crea aparte', () => {
    const plan = planExternalMovement(
      movement({ amount: '3600.00' }),
      context({ candidates: [candidate({ id: 'tx-telegram' })] }),
    );
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION' });
  });

  it('el monto tiene que ser exacto: "3500" y "3500.00" son el mismo, "3500.01" no', () => {
    expect(findDuplicate(movement(), [candidate({ amount: '3500' })])).not.toBeNull();
    expect(findDuplicate(movement(), [candidate({ amount: '3500.01' })])).toBeNull();
  });

  it('±2 días justos entran; 3 no', () => {
    const at = (date: string) => [candidate({ date: d(date) })];
    expect(findDuplicate(movement(), at('2026-11-21'))).not.toBeNull();
    expect(findDuplicate(movement(), at('2026-11-25'))).not.toBeNull();
    expect(findDuplicate(movement(), at('2026-11-20'))).toBeNull();
    expect(findDuplicate(movement(), at('2026-11-26'))).toBeNull();
  });

  it('la ventana cruza el fin de mes', () => {
    const late = movement({ date: d('2026-12-01') });
    expect(findDuplicate(late, [candidate({ date: d('2026-11-29') })])).not.toBeNull();
  });

  it('otro sentido u otra moneda no son el mismo', () => {
    expect(findDuplicate(movement(), [candidate({ direction: 'IN' })])).toBeNull();
    expect(findDuplicate(movement(), [candidate({ currency: 'USD' })])).toBeNull();
  });

  it('con varios, el de fecha más cercana', () => {
    const found = findDuplicate(movement(), [
      candidate({ id: 'far', date: d('2026-11-21') }),
      candidate({ id: 'near', date: d('2026-11-24') }),
    ]);
    expect(found?.id).toBe('near');
  });

  it('dos a la misma distancia: el más viejo (la fecha anterior)', () => {
    const found = findDuplicate(movement(), [
      candidate({ id: 'after', date: d('2026-11-24'), createdAt: '2026-11-20T00:00:00.000Z' }),
      candidate({ id: 'before', date: d('2026-11-22'), createdAt: '2026-11-22T00:00:00.000Z' }),
    ]);
    expect(found?.id).toBe('before');
  });

  it('dos del mismo día: el que se cargó primero', () => {
    const found = findDuplicate(movement(), [
      candidate({ id: 'second', createdAt: '2026-11-23T15:00:00.000Z' }),
      candidate({ id: 'first', createdAt: '2026-11-23T09:00:00.000Z' }),
    ]);
    expect(found?.id).toBe('first');
  });

  it('un gasto se vincula al pago de la Visa ya cargado (no cuenta como gasto)', () => {
    const payment = candidate({ kind: 'TRANSFER', id: 'pago-visa', amount: '80000.00' });
    const plan = planExternalMovement(
      movement({ amount: '80000.00', description: 'Pago de tarjeta' }),
      context({ candidates: [payment] }),
    );
    expect(plan).toEqual({ action: 'LINK', transferId: 'pago-visa' });
  });

  it('un ingreso se vincula a una transferencia que entra', () => {
    const transfer = candidate({ kind: 'TRANSFER', id: 'desde-santander', direction: 'IN' });
    const plan = planExternalMovement(
      movement({ kind: 'INCOME' }),
      context({ candidates: [transfer] }),
    );
    expect(plan).toEqual({ action: 'LINK', transferId: 'desde-santander' });
  });

  it('una devolución también busca lo ya cargado; un rendimiento busca ingresos', () => {
    const income = candidate({ direction: 'IN', id: 'ingreso' });
    expect(findDuplicate(movement({ kind: 'REFUND', direction: 'IN' }), [income])?.id).toBe(
      'ingreso',
    );
    expect(findDuplicate(movement({ kind: 'YIELD' }), [income])?.id).toBe('ingreso');
  });

  it('reservas y compras de moneda no se buscan como duplicados', () => {
    const anything = [candidate(), candidate({ direction: 'IN', id: 'in' })];
    expect(
      planExternalMovement(
        movement({ kind: 'RESERVE_IN', externalReserveId: 'res-vacaciones' }),
        context({ candidates: anything }),
      ),
    ).toMatchObject({ action: 'CREATE_TRANSFER' });
    expect(
      planExternalMovement(
        movement({ kind: 'FX', amountIn: '3.00', currencyIn: 'USD' }),
        context({ candidates: anything }),
      ),
    ).toMatchObject({ action: 'CREATE_TRANSFER' });
  });

  it('lo que espera en Para revisar no se vincula todavía', () => {
    const plan = planExternalMovement(
      movement({ currency: 'BRL' }),
      context({ candidates: [candidate({ currency: 'BRL' })] }),
    );
    expect(plan).toMatchObject({ action: 'HOLD' });
  });
});

describe('Límite del plan Gratis (MPG-07)', () => {
  it('checkDailyLimit: null sin límite, 0 no deja entrar nada', () => {
    expect(checkDailyLimit(null, 1000)).toBe(true);
    expect(checkDailyLimit(0, 0)).toBe(false);
    expect(checkDailyLimit(1, 0)).toBe(true);
    expect(checkDailyLimit(1, 1)).toBe(false);
    // Bajó de plan con el día ya pasado del límite.
    expect(checkDailyLimit(1, 5)).toBe(false);
  });

  it('ejemplo del 23/11: se crea el pago, el cobro queda afuera, el igual a uno cargado se vincula', () => {
    const manual = candidate({ id: 'manual-1200', amount: '1200.00' });
    let used = 0;
    let overLimit = 0;
    const arriving = [
      movement({ externalId: 'a', amount: '3500.00' }),
      movement({ externalId: 'b', kind: 'INCOME', amount: '20000.00', description: 'Venta' }),
      movement({ externalId: 'c', amount: '1200.00', description: 'Kiosco' }),
    ];
    const actions = arriving.map((item) => {
      const plan = planExternalMovement(
        item,
        context({ limit: 1, usedOnDay: used, candidates: [manual] }),
      );
      if (plan.action === 'CREATE_TRANSACTION' || plan.action === 'CREATE_TRANSFER') used += 1;
      if (plan.action === 'OVER_LIMIT') overLimit += 1;
      return plan.action;
    });
    expect(actions).toEqual(['CREATE_TRANSACTION', 'OVER_LIMIT', 'LINK']);
    // "1 de 1 hoy" y "Hoy llegó 1 movimiento más".
    expect(used).toBe(1);
    expect(overLimit).toBe(1);
  });

  it('las transferencias también cuentan', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_IN', externalReserveId: 'res-vacaciones' }),
      context({ limit: 1, usedOnDay: 1 }),
    );
    expect(plan).toEqual({ action: 'OVER_LIMIT' });
  });

  it('lo que queda en Para revisar no cuenta: se retiene aunque el día esté lleno', () => {
    const plan = planExternalMovement(
      movement({ kind: 'RESERVE_IN', externalReserveId: 'res-sin-asignar' }),
      context({ limit: 1, usedOnDay: 1 }),
    );
    expect(plan).toEqual({ action: 'HOLD', reason: 'RESERVE_NOT_MAPPED' });
  });

  it('con Pro (sin límite) entran todos', () => {
    const plan = planExternalMovement(movement(), context({ limit: null, usedOnDay: 500 }));
    expect(plan).toMatchObject({ action: 'CREATE_TRANSACTION' });
  });
});

describe('suggestedRulePattern', () => {
  it('la primera palabra del motivo, normalizada y sin signos', () => {
    expect(suggestedRulePattern('Café Martínez')).toBe('cafe');
    expect(suggestedRulePattern('"Kiosco" 24hs')).toBe('kiosco');
    expect(suggestedRulePattern('  ')).toBeNull();
    expect(suggestedRulePattern('Y')).toBeNull();
  });
});
