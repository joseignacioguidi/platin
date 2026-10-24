export const PENDING_TEXTS = {
  title: 'Para confirmar',
  intro:
    'Tus fijos de este mes. Revisá el monto real y confirmalos: recién ahí cuentan en tus saldos.',
  emptyTitle: 'Nada para confirmar',
  emptyBody: 'Cuando un fijo llegue a su mes, va a aparecer acá.',
  selectAll: 'Seleccionar todos',
  select: (name: string) => `Seleccionar ${name}`,
  income: 'Ingreso',
  expense: 'Gasto',
  amount: 'Monto real',
  rate: 'Cotización (pesos por dólar)',
  confirm: 'Confirmar',
  confirmSelected: (count: number) =>
    count === 1 ? 'Confirmar 1 movimiento' : `Confirmar ${count} movimientos`,
  invalidAmount: (name: string) => `Revisá el monto de ${name}.`,
  missingRate: (name: string) => `Falta la cotización de ${name}.`,
} as const;
