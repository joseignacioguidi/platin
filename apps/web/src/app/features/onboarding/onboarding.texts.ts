export const ONBOARDING_TEXTS = {
  step: (n: number) => `Paso ${n} de 2`,
  accountTitle: (name: string) =>
    name ? `¡Hola, ${name}! Cargá tu primera cuenta` : 'Cargá tu primera cuenta',
  accountBody:
    'Ya tenés "Efectivo". Sumá tu banco o tu billetera virtual con el saldo en pesos que tiene hoy; después separás ahorros e inversiones en apartados.',
  accountName: 'Nombre de la cuenta',
  accountPlaceholder: 'Ej.: Banco Galicia',
  type: 'Tipo',
  balance: 'Saldo disponible hoy (en pesos)',
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
