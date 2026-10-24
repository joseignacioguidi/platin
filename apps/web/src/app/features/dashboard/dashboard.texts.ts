export const DASHBOARD_TEXTS = {
  hello: 'Hola',
  title: 'Inicio',
  free: 'Libre este mes',
  ofIncome: 'de ingresos esperados',
  spent: 'Gastado',
  committed: 'Comprometido',
  committedHint: '· cuotas y fijos',
  freeShort: 'Libre',
  pendingTitle: 'Para confirmar',
  upcoming: 'Próximos 30 días',
  seeAll: 'Ver todo',
  statementDue: 'Vence resumen',
  fixed: 'Fijo',
  income: 'Ingreso',
  noUpcoming: 'No hay vencimientos en los próximos 30 días.',
  hideAmounts: 'Ocultar montos',
  showAmounts: 'Mostrar montos',
  staleRate: (type: string, date: string) =>
    `Usamos la cotización ${type} del ${date}: no pudimos actualizarla.`,
  rateTypes: { OFICIAL: 'oficial', MEP: 'MEP', BLUE: 'blue' },
  createAccount: 'Crear cuenta',
  emptyTitle: 'Empezá cargando tus cuentas',
  emptyBody: 'Cuando tengas cuentas y movimientos, acá vas a ver cuánto te queda libre este mes.',
  joinNames: (names: string[]) =>
    names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`,
} as const;
