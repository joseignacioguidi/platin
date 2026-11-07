export const LAYOUT_TEXTS = {
  wakeTitle: 'Despertando el servidor',
  wakeBody:
    'platin usa un servidor gratuito que se duerme cuando no se usa. Tarda alrededor de un minuto en arrancar.',
  wakeFailed: 'El servidor no respondió. Revisá tu conexión y probá de nuevo.',
  retry: 'Reintentar',
  nav: {
    label: 'Navegación principal',
    home: 'Inicio',
    transactions: 'Movimientos',
    cards: 'Tarjetas',
    more: 'Más',
    add: 'Cargar movimiento',
    addShort: 'Cargar',
    accounts: 'Cuentas',
    commitments: 'Compromisos',
    savings: 'Ahorros e inversiones',
    admin: 'Administración',
    profile: 'Perfil y ajustes',
    /** NAV-02: what each section of "Más" has. */
    accountsHint: 'Saldos y reservas',
    commitmentsHint: 'Próximos meses, fijos y para confirmar',
    savingsHint: 'Metas, ahorros e inversiones',
    profileHint: (plan: string | null) =>
      plan
        ? `Perfil y ajustes · categorías · plan ${plan}`
        : 'Perfil y ajustes · categorías · plan',
    moreSections: 'Más secciones',
    pending: (count: string) => `${count} para confirmar`,
  },
  quickEntryLabel: 'Carga rápida',
  hideAmounts: 'Ocultar montos',
  showAmounts: 'Mostrar montos',
  darkMode: 'Modo oscuro',
  toDark: 'Cambiar a modo oscuro',
  toLight: 'Cambiar a modo claro',
  dismissAnnouncement: 'Cerrar aviso',
} as const;
