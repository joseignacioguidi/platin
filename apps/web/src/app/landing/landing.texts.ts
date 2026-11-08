/** A message of the landing's sample chat (LAN-03). `amount` parts use the monospace font. */
export interface ChatMessage {
  from: 'me' | 'platin';
  parts: readonly { text: string; amount?: boolean; strong?: boolean; breakAfter?: boolean }[];
  /** Sample buttons under the message: drawn only, they do nothing. */
  buttons?: readonly string[];
}

export const LANDING_TEXTS = {
  brand: 'platin',
  nav: 'Navegación de la página',
  howItWorks: 'Cómo funciona',
  plans: 'Planes',
  login: 'Ingresar',
  register: 'Crear cuenta',
  openApp: 'Ir a la app',
  registerFree: 'Crear cuenta gratis',
  faceLabel: 'La cara de platin guiñando un ojo',
  /** What the wink says, in turns. `amount` parts are set in the monospace font. */
  bubbles: [
    [
      { text: 'Este mes te quedan ' },
      { text: '$ 412.300', amount: true },
      { text: ' libres. Vas bien.' },
    ],
    [
      { text: 'La heladera se termina de pagar en ' },
      { text: 'abril', amount: true },
      { text: '.' },
    ],
    [{ text: 'Para el auto, guardá ' }, { text: 'USD 771', amount: true }, { text: ' por mes.' }],
    [{ text: 'Tenés ' }, { text: '3', amount: true }, { text: ' fijos para confirmar este mes.' }],
    [{ text: 'Entró el sueldo: ' }, { text: '+ $ 1.850.000', amount: true }, { text: '.' }],
    [{ text: 'En la reserva en dólares hay ' }, { text: 'USD 670', amount: true }, { text: '.' }],
  ] as readonly (readonly { text: string; amount?: boolean }[])[],
  taglineTop: 'Tu plata,',
  taglineBottom: 'más clara.',
  pitch:
    'Cuentas con sus reservas, tarjetas en cuotas y metas, en pesos, dólares y la moneda que uses. Todo lo que hoy anotás en papelitos, en un solo lugar.',
  stickers: {
    expenseLabel: 'Supermercado',
    expenseAmount: '− $ 18.500',
    installmentsLabel: 'Heladera',
    installmentsCount: '4 de 12',
    installmentsAria: '4 de 12 cuotas',
    goalLabel: 'Auto, 28 %',
    goalAmount: 'USD 771/mes',
    pending: 'Spotify · Confirmar',
    reserveLabel: 'Reserva en dólares',
    reserveAmount: 'USD 670',
  },
  questionsTitle: 'Preguntale a tu plata. platin te contesta con números.',
  free: {
    title: '¿Cuánto me queda libre este mes?',
    body: 'Lo que hay en tus cuentas y lo que vas a cobrar, menos lo que tenés que pagar este mes: resúmenes de tarjeta, cuotas y fijos. Un solo número, y cuánto podés gastar por día.',
    amount: '$ 412.300',
    perDayPrefix: '≈ ',
    perDayAmount: '$ 17.179',
    perDaySuffix: ' por día hasta el 30/11',
    barAria: 'Para pagar este mes 60 %, libre 40 %',
    spent: 'Para pagar',
    left: 'Libre',
  },
  installments: {
    title: '¿Cuándo termino de pagar las cuotas?',
    body: 'Cargás la compra una vez y cae sola en los resúmenes de tu tarjeta. Ves cuántas cuotas quedan y qué mes se libera cada una.',
    chartAria: 'Cuotas por mes: bajan de noviembre a abril',
  },
  enough: {
    title: '¿Me alcanza para pagar todo?',
    body: 'Cada cuenta con lo que tiene y lo que paga este mes: tarjetas, fijos y lo que programaste. Si alguna no llega, te dice cuánto le falta, antes de que venza.',
    pays: 'Paga ',
    thisMonth: ' este mes',
    rows: [
      {
        account: 'Mercado Pago',
        balance: '$ 459.880',
        pays: '$ 267.252',
        status: 'todo alcanza',
        short: false,
      },
      {
        account: 'Santander',
        balance: '$ 900',
        pays: '$ 74.966',
        status: 'te faltan $ 74.066',
        short: true,
      },
    ],
  },
  fixed: {
    title: '¿Ya pagué el alquiler este mes?',
    body: 'Alquiler, sueldo y suscripciones aparecen solos cada mes. Los confirmás con un toque y no se te pasa ninguno.',
    rows: [
      { label: 'Sueldo', value: '+ $ 1.850.000', kind: 'income' },
      { label: 'Alquiler', value: '− $ 380.000', kind: 'expense' },
      { label: 'Spotify', value: 'Confirmar', kind: 'pending' },
    ],
  },
  chat: {
    badge: 'Nuevo',
    title: 'Cargá un gasto mandando un mensaje.',
    body: 'Escribilo como te sale. platin te muestra lo que entendió y lo guarda cuando confirmás. Sin abrir la app.',
    steps: [
      'Vinculás tu cuenta desde el perfil.',
      'Mandás el gasto en una línea.',
      'Confirmás con un toque.',
    ],
    stepsShort: 'Vinculás tu cuenta, mandás el gasto y confirmás.',
    channelsLabel: 'Canales',
    channels: [
      { name: 'Telegram · disponible', available: true },
      { name: 'WhatsApp · próximamente', available: false },
    ],
    botName: 'platin',
    botKind: 'bot',
    inputHint: 'Escribí un gasto…',
    /** Read instead of the drawn conversation, which is hidden from screen readers. */
    summary:
      'Ejemplo de conversación: escribís «super 45k visa 3c» y platin entiende un gasto de $ 45.000 en Supermercado con la Visa, en 3 cuotas de $ 15.000, hoy. Cuando confirmás, lo guarda y te dice que te quedan $ 412.300 este mes. Si mandás /libre, te contesta que podés gastar unos $ 17.179 por día hasta el 30/11.',
    messages: [
      { from: 'me', parts: [{ text: 'super 45k visa 3c', amount: true }] },
      {
        from: 'platin',
        parts: [
          { text: 'Gasto', strong: true },
          { text: ' · ' },
          { text: '$ 45.000', amount: true },
          { text: ' · Supermercado', breakAfter: true },
          { text: 'Visa · 3 cuotas de ' },
          { text: '$ 15.000', amount: true },
          { text: ' · hoy' },
        ],
        buttons: ['Confirmar', 'Cambiar categoría', 'Cancelar'],
      },
      {
        from: 'platin',
        parts: [
          { text: 'Guardado. Te quedan ' },
          { text: '$ 412.300', amount: true },
          { text: ' este mes.' },
        ],
      },
      { from: 'me', parts: [{ text: '/libre', amount: true }] },
      {
        from: 'platin',
        parts: [
          { text: '≈ ' },
          { text: '$ 17.179', amount: true },
          { text: ' por día hasta el 30/11.' },
        ],
      },
    ] as readonly ChatMessage[],
  },
  closingTitle: 'En un minuto sabés cuánto te queda.',
  closingBody: 'Cargá tus cuentas con el saldo de hoy y tu primer gasto desde el chat. Es gratis.',
  footerTagline: 'Tu plata, más clara.',
  footerMade: 'Hecho en Argentina',
} as const;
