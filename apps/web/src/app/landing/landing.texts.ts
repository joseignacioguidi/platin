export const LANDING_TEXTS = {
  brand: 'platin',
  tagline: 'Tu plata, más clara.',
  pitch:
    'Ingresos, gastos, tarjetas en cuotas y metas de ahorro, en pesos y dólares. Todo gira alrededor de una pregunta: cuánto te queda libre este mes.',
  login: 'Ingresar',
  register: 'Crear cuenta',
  registerFree: 'Crear cuenta gratis',
  nav: 'Navegación de la página',
  shotAlt: {
    inicio: 'Pantalla de inicio de platin con lo libre del mes y los próximos vencimientos',
    carga: 'Carga rápida de un gasto con teclado numérico y categorías',
    tarjeta: 'Detalle de una tarjeta con las cuotas por resumen',
    meta: 'Meta de ahorro con anillo de progreso y aporte mensual necesario',
    ahorros: 'Ahorros con el total en dólares y pesos',
  },
  sections: [
    {
      id: 'libre',
      title: 'Cuánto te queda libre este mes',
      body: 'Un solo número arriba de todo: ingresos esperados menos lo que ya gastaste y lo que ya está comprometido en cuotas y fijos. Sin planillas.',
      shot: 'inicio',
    },
    {
      id: 'carga',
      title: 'Un gasto en tres toques',
      body: 'Monto, categoría, guardar. La cuenta de siempre ya viene elegida y la fecha es hoy. Tus fijos aparecen solos para confirmar.',
      shot: 'carga',
    },
    {
      id: 'cuotas',
      title: 'Tus cuotas, bajo control',
      body: 'Cargá una compra en 12 cuotas y platin la reparte en los resúmenes correctos según el cierre de tu tarjeta. Ves qué mes se libera cada plan.',
      shot: 'tarjeta',
    },
    {
      id: 'metas',
      title: 'Metas que te dicen cuánto ahorrar',
      body: 'Elegí cuánto y para cuándo, vinculá tus cuentas y platin te dice cuánto ahorrar por mes y si vas a ritmo.',
      shot: 'meta',
    },
    {
      id: 'monedas',
      title: 'Pesos y dólares, juntos',
      body: 'Cada movimiento guarda su cotización del día (oficial, MEP o blue). Tus ahorros se valúan en dólares sin hacer cuentas.',
      shot: 'ahorros',
    },
  ],
  closingTitle: 'Empezá hoy',
  closingBody:
    'Es gratis. Cargá tus cuentas con el saldo de hoy y en un minuto sabés cuánto te queda libre.',
  footer: 'platin · Tu plata, más clara.',
} as const;
