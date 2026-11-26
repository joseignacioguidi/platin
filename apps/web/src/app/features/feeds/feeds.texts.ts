import type { ExternalMovementKind, FeedHoldReason } from '@platin/domain';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Iteration 14: Mercado Pago (MPG-01 to 10). */
export const FEEDS_TEXTS = {
  title: 'Mercado Pago',
  connectionTitle: 'Conexión',
  back: 'Volver al perfil',
  intro:
    'Conectá tu cuenta y cada pago, cobro o transferencia de Mercado Pago entra solo a platin, al momento.',
  notConnected: 'No conectado',
  connected: (account: string) => `Conectado a tu cuenta ${account}`,
  needsAccount: 'Falta elegir qué cuenta de platin es Mercado Pago.',
  needsReconnect: 'Volvé a conectar Mercado Pago: el permiso venció o lo quitaste.',
  lastEvent: (when: string) => `Último movimiento: ${when}`,
  connect: 'Conectar',
  reconnect: 'Volver a conectar',
  connecting: 'Abriendo Mercado Pago…',
  disconnect: 'Desconectar',
  disconnectConfirm: '¿Desconectar Mercado Pago?',
  disconnectBody:
    'Dejan de entrar los movimientos nuevos. Lo que ya entró se queda en tus cuentas.',
  disconnectYes: 'Sí, desconectar',
  cancel: 'Cancelar',
  open: 'Ver Mercado Pago',
  summary: (held: number) =>
    held > 0
      ? `${held} ${plural(held, 'movimiento para revisar', 'movimientos para revisar')}`
      : '',
  notBrought:
    'Lo anterior a la conexión no se trae. Si el saldo no coincide con el de Mercado Pago, ajustalo.',
  adjustBalance: 'Ajustar el saldo',
  connectedOk: '¡Listo! Mercado Pago quedó conectado.',
  errors: {
    FEED_ACCOUNT_TAKEN: 'Esa cuenta de Mercado Pago ya está conectada a otro usuario de platin.',
    FEED_STATE_MISMATCH:
      'No pudimos terminar la conexión. Volvé a tocar "Conectar" desde esta pantalla.',
    FEED_DENIED: 'No se dio el permiso en Mercado Pago, así que no se conectó nada.',
    default: 'No pudimos conectar Mercado Pago. Probá de nuevo en un rato.',
  } as Record<string, string>,
  account: {
    title: '¿Qué cuenta de platin es Mercado Pago?',
    body: 'Los movimientos van a entrar al saldo de esta cuenta, en su moneda.',
    create: 'Crear Mercado Pago',
    defaultName: 'Mercado Pago',
    choose: 'Elegir esta cuenta',
    change: 'Cambiar de cuenta',
    none: 'No tenés cuentas de tipo billetera todavía.',
  },
  reserves: {
    title: 'Reservas',
    hint: 'Lo que movés a una reserva de Mercado Pago se refleja como una transferencia a la reserva de platin que elijas.',
    empty: 'Cuando muevas plata a una reserva de Mercado Pago, va a aparecer acá.',
    pick: 'Reserva de platin',
    unassigned: 'Sin asignar',
    waiting: (count: number) =>
      `${count} ${plural(count, 'movimiento espera', 'movimientos esperan')} esta reserva`,
    noPockets: (currency: string) =>
      `Creá una reserva en ${currency} en esta cuenta para asignarla.`,
    createPocket: 'Crear una reserva',
  },
  held: {
    title: 'Para revisar',
    hint: 'Lo que platin no pudo ubicar solo. Se aplica cuando lo resolvés.',
    empty: 'Nada para revisar.',
    reasons: {
      RESERVE_NOT_MAPPED: 'Asigná la reserva de Mercado Pago a una de platin.',
      CURRENCY_NOT_ENABLED: 'Activá esa moneda en Perfil › Monedas.',
      NO_BALANCE_IN_CURRENCY: 'Agregale esa moneda a la cuenta.',
      NO_ACCOUNT: 'Elegí qué cuenta de platin es Mercado Pago.',
    } satisfies Record<FeedHoldReason, string>,
    kinds: {
      INCOME: 'Ingreso',
      EXPENSE: 'Gasto',
      YIELD: 'Rendimiento',
      RESERVE_IN: 'A la reserva',
      RESERVE_OUT: 'De la reserva',
      FX: 'Cambio de moneda',
      REFUND: 'Devolución',
    } satisfies Record<ExternalMovementKind, string>,
    retry: 'Volver a intentar',
    dismiss: (description: string) => `Descartar ${description}`,
    retried: (applied: number, held: number) =>
      applied > 0
        ? `Se ${plural(applied, 'aplicó 1 movimiento', `aplicaron ${applied} movimientos`)}.`
        : held > 0
          ? 'Todavía falta resolverlos.'
          : '',
  },
  usage: {
    title: 'Hoy',
    used: (created: number, limit: number | null) =>
      limit === null ? `${created} hoy · sin límite` : `${created} de ${limit} hoy`,
    over: (count: number) =>
      `Hoy ${plural(count, 'llegó 1 movimiento más', `llegaron ${count} movimientos más`)}. Con Pro se cargan solos.`,
    seePlans: 'Ver los planes',
  },
} as const;

/** The home notices (MPG-04, 10). */
export const FEED_NOTICE_TEXTS = {
  uncategorized: (count: number) =>
    `${count} ${plural(count, 'movimiento para categorizar', 'movimientos para categorizar')}`,
  uncategorizedHint: 'Entraron sin categoría. Elegila y platin aprende para la próxima.',
  reconnect: 'Volvé a conectar Mercado Pago',
} as const;

/** The detail of a movement that came from Mercado Pago (MPG-06, 08). */
export const FEED_MOVEMENT_TEXTS = {
  via: 'Mercado Pago',
  alsoFrom: 'También llegó de Mercado Pago',
  notTheSame: 'No es el mismo',
  notTheSameHint: 'Lo crea aparte, con lo que informó Mercado Pago.',
  isTransfer: 'Es una transferencia mía',
  isCardPayment: 'Es el pago de una tarjeta',
  transferTitle: '¿A qué cuenta fue la plata?',
  transferInTitle: '¿De qué cuenta vino la plata?',
  transferHint: 'Deja de contar como gasto o ingreso: es plata que se movió entre tus cuentas.',
  account: 'Cuenta',
  card: 'Tarjeta',
  statement: 'Resumen',
  noStatements: 'Esta tarjeta no tiene resúmenes cerrados para pagar.',
  statementLabel: (period: string, pending: string) => `${period} · falta ${pending}`,
  convert: 'Convertir',
  rule: (pattern: string, category: string) =>
    `¿Querés que lo que diga «${pattern}» vaya siempre a ${category}?`,
  ruleYes: 'Sí, crear la regla',
  ruleNo: 'Ahora no',
} as const;
