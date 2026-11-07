export const COMMITMENTS_TEXTS = {
  title: 'Compromisos',
  intro: 'La plata que ya tiene destino: resúmenes de tarjeta, fijos y pagos programados.',
  /** COM-05: the three tabs. */
  tabs: {
    label: 'Secciones de Compromisos',
    upcoming: 'Próximos meses',
    fixed: 'Fijos',
    pending: 'Para confirmar',
  },
  months: 'Los próximos 12 meses',
  committed: 'Comprometido',
  showUntil: (month: string) => `Ver hasta ${month}`,
  pendingNotice: (count: string) =>
    count === '1' ? '1 fijo espera que lo confirmes' : `${count} fijos esperan que los confirmes`,
  review: 'Revisar',
  noFixedIncome: 'No tenés ingresos fijos: el margen no cuenta tu sueldo.',
  addFixedIncome: 'Cargalo como fijo',
  newFixedIncome: 'Nuevo ingreso fijo',
  /** COM-02: expected income − committed; not the free amount of the home screen. */
  margin: 'Margen',
  expectedIncome: 'Ingresos esperados',
  fixed: 'fijo',
  fixedOn: (card: string) => `fijo en ${card}`,
  statement: (card: string) => `Resumen ${card}`,
  partiallyPaid: 'falta pagar',
  scheduled: 'programado',
  /** COM-04 */
  payFrom: (account: string) => `Desde ${account}`,
  noAccount: 'Sin cuenta asignada',
  assign: 'Elegir',
  assignLabel: (card: string) => `Elegir la cuenta con la que pagás ${card}`,
  nothing: 'Nada comprometido este mes.',
  emptyTitle: 'No tenés compromisos',
  emptyBody: 'Cargá tus fijos y tus compras en cuotas para ver lo que viene.',
  noRate: 'Los montos en dólares todavía no se suman a los pesos: falta la cotización automática.',
} as const;
