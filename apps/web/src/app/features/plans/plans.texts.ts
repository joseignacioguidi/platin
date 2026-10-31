import type { LimitedResource } from '@platin/domain';

const RESOURCE_NAMES: Record<
  LimitedResource,
  [singular: string, plural: string, unlimited: string]
> = {
  accounts: ['cuenta', 'cuentas', 'Cuentas ilimitadas'],
  pockets: ['apartado', 'apartados', 'Apartados ilimitados'],
  cards: ['tarjeta', 'tarjetas', 'Tarjetas ilimitadas'],
  goals: ['meta', 'metas', 'Metas ilimitadas'],
  fixed: ['fijo', 'fijos', 'Fijos ilimitados'],
};

/** Field of PlanLimits for each resource. */
export const LIMIT_KEYS = {
  accounts: 'maxAccounts',
  pockets: 'maxPockets',
  cards: 'maxCards',
  goals: 'maxGoals',
  fixed: 'maxFixed',
} as const satisfies Record<LimitedResource, string>;

export function resourceName(resource: LimitedResource, count: number): string {
  return RESOURCE_NAMES[resource][count === 1 ? 0 : 1];
}

/** "2 cuentas", "Cuentas ilimitadas". */
export function limitLabel(resource: LimitedResource, limit: number | null): string {
  if (limit === null) return RESOURCE_NAMES[resource][2];
  return `${limit} ${resourceName(resource, limit)}`;
}

export const PLANS_TEXTS = {
  limitTitle: 'Llegaste al límite de tu plan',
  featureTitle: 'Esto no está en tu plan',
  limitBody: (plan: string, limit: number, resource: LimitedResource) =>
    `Tu plan ${plan} incluye ${limit} ${resourceName(resource, limit)}. Lo que ya cargaste se queda; para sumar más, pedí otro plan.`,
  featureBody: (plan: string) =>
    `Tu plan ${plan} no incluye inversiones. Tus datos se conservan y vuelven a verse al cambiar de plan.`,
  requestTitle: 'Pedir otro plan',
  requestBody:
    'Elegí el plan que querés. Por ahora no se cobra: el administrador lo revisa y te lo asigna.',
  choose: 'Plan',
  message: 'Mensaje (opcional)',
  messagePlaceholder: 'Contale para qué lo necesitás.',
  send: (plan: string) => `Pedir plan ${plan}`,
  sent: 'Listo, le avisamos al administrador. Te va a llegar el cambio sin hacer nada más.',
  pending: (plan: string) =>
    `Ya pediste el plan ${plan}. Está esperando la respuesta del administrador.`,
  close: 'Cerrar',
  seePlans: 'Ver los planes',
  yourPlan: 'Tu plan',
  until: (date: string) => `Vigente hasta el ${date}`,
  usage: (used: number, limit: number | null, resource: LimitedResource) =>
    limit === null
      ? `${used} ${resourceName(resource, used)} · sin límite`
      : `${used} de ${limit} ${resourceName(resource, limit)}`,
  gate: {
    locked: (plan: string) => `(no incluido en tu plan; está en ${plan})`,
  },
  investmentsIncluded: 'Inversiones incluidas',
  investmentsNotIncluded: 'Sin inversiones',
  askAnother: 'Pedir otro plan',
  page: {
    title: 'Planes',
    heading: 'Elegí cómo usar platin.',
    intro:
      'Por ahora no se cobra: empezás en Gratis y, si necesitás más, pedís otro plan desde la app.',
    perMonth: '/mes',
    free: 'Sin costo',
    defaultBadge: 'Con el que empezás',
    start: 'Crear cuenta gratis',
    loadError: 'No pudimos cargar los planes. Probá de nuevo en un rato.',
    loading: 'Cargando planes…',
    login: 'Ingresar',
    register: 'Crear cuenta',
    openApp: 'Ir a la app',
  },
  resources: [
    'accounts',
    'pockets',
    'cards',
    'goals',
    'fixed',
  ] as const satisfies readonly LimitedResource[],
} as const;
