export const ONBOARDING_TEXTS = {
  step: (n: number) => `Paso ${n} de 2`,
  accountTitle: (name: string) =>
    name ? `¡Hola, ${name}! Cargá tu primera cuenta` : 'Cargá tu primera cuenta',
  accountBody:
    'Una cuenta es donde está tu plata: el banco, Mercado Pago o la billetera. Poné el saldo que tiene hoy.',
  accountName: 'Nombre de la cuenta',
  accountPlaceholder: 'Ej.: Banco Galicia',
  type: 'Tipo',
  currency: 'Moneda',
  balance: 'Saldo de hoy',
  balanceHint: 'Si no lo sabés, dejalo en cero y después lo ajustás.',
  saveAccount: 'Seguir',
  skip: 'Lo hago después',
  cardTitle: '¿Usás tarjeta de crédito?',
  cardBody: 'Con el día de cierre y de vencimiento, las cuotas se reparten solas en cada resumen.',
  cardName: 'Nombre de la tarjeta',
  cardPlaceholder: 'Ej.: Visa Galicia',
  closingDay: 'Día de cierre',
  dueDay: 'Día de vencimiento',
  saveCard: 'Guardar y empezar',
  skipCard: 'No uso tarjeta, empezar',
  errors: {
    accountName: 'Ingresá un nombre para la cuenta.',
    balance: 'Revisá el saldo.',
    cardName: 'Ingresá un nombre para la tarjeta.',
  },
} as const;
