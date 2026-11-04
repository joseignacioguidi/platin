export const COMMITMENTS_TEXTS = {
  title: 'Compromisos',
  intro:
    'Lo que ya tenés comprometido los próximos 12 meses: resúmenes de tarjeta, gastos fijos y programados.',
  /** COM-02: expected income − committed; not the free amount of the home screen. */
  margin: 'Margen',
  expectedIncome: 'Ingresos esperados',
  fixed: 'fijo',
  fixedOn: (card: string) => `fijo en ${card}`,
  statement: (card: string) => `Resumen ${card}`,
  partiallyPaid: 'falta pagar',
  scheduled: 'programado',
  nothing: 'Nada comprometido este mes.',
  emptyTitle: 'No tenés compromisos',
  emptyBody: 'Cargá tus fijos y tus compras en cuotas para ver lo que viene.',
  noRate: 'Los montos en dólares todavía no se suman a los pesos: falta la cotización automática.',
} as const;
