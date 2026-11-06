/** The bot's texts (regla "Bot de Telegram"). `*x*` is bold; the sender turns it into HTML. */
export const BOT_TEXTS = {
  welcome: (name: string) =>
    `¡Listo, ${name}! Ya podés cargar desde acá. Mandame algo como *super 45k visa 3c* o *+ 50000 freelance*. Antes de guardar te muestro lo que entendí.`,
  replaced: 'Este Telegram estaba vinculado a otra cuenta de platin: ahora quedó con esta.',
  notLinked:
    'Este chat no está vinculado a platin. Entrá a platin › Perfil › Telegram y tocá Vincular.',
  badCode: 'Ese código ya no sirve. Generá uno nuevo en platin › Perfil › Telegram.',
  suspended: 'Tu cuenta de platin está suspendida.',
  help: 'Escribime el gasto en una línea: *super 45k visa 3c*, *taxi 8000 ayer*, *netflix usd 20*, *turno médico 15000 el 20 que viene*. Para un ingreso, empezá con + o usá *sueldo* o *cobré*. Comandos: /libre /hoy /pendientes /proximos /deshacer /desvincular.',
  unlinked:
    'Listo, desvinculé este chat. Para volver a cargar desde acá, vinculalo en platin › Perfil › Telegram.',
  tooFast: 'Vas muy rápido. Esperá un minuto.',
  expired: 'Este borrador venció. Mandalo de nuevo.',
  alreadySaved: 'Ya estaba guardado.',
  cancelled: 'Listo, no guardé nada.',
  saved: (free: string | null) => (free ? `Guardado ✓ Te quedan ${free} este mes.` : 'Guardado ✓'),
  noCategory: 'Sin categoría: elegí una antes de confirmar.',
  chooseCategory: 'Elegí la categoría:',
  chooseSource: 'Elegí la cuenta o la tarjeta:',
  writeCategory: 'Escribí el nombre de la categoría.',
  ruleOffer: (pattern: string, category: string) =>
    `¿La próxima vez *${pattern}* va a ${category}?`,
  ruleSaved: (pattern: string, category: string) =>
    `Listo: *${pattern}* va a ${category}. La podés cambiar en platin › Categorías › Reglas.`,
  ruleSkipped: 'Dale, no la guardo.',
  noAccount: 'Primero creá una cuenta en platin.',
  free: (amount: string, perDay: string | null, lastDay: string) =>
    perDay
      ? `Te quedan ${amount} para gastar este mes (≈ ${perDay} por día hasta el ${lastDay}).`
      : `Te quedan ${amount} para gastar este mes.`,
  todayEmpty: 'Hoy todavía no cargaste nada.',
  todayTitle: 'Hoy cargaste:',
  todayTotal: (total: string) => `Total gastado: ${total}`,
  pendingEmpty: 'No tenés movimientos para confirmar.',
  pendingTitle: 'Para confirmar:',
  pendingConfirmed: (name: string) => `Confirmado ✓ ${name}`,
  upcomingEmpty: 'No tenés pagos en los próximos 30 días.',
  upcomingTitle: 'Próximos pagos:',
  undoNothing: 'No hay nada cargado desde acá en las últimas 24 horas.',
  undoAsk: (what: string) => `¿Borro ${what}?`,
  undoClosed: 'No se puede: ese consumo ya tiene una cuota en un resumen cerrado.',
  undoDone: 'Listo, lo borré.',
  undoKept: 'Dale, no borro nada.',
  buttons: {
    confirm: 'Confirmar',
    category: 'Cambiar categoría',
    source: 'Cambiar cuenta',
    cancel: 'Cancelar',
    other: 'Otra',
    yes: 'Sí',
    no: 'No',
    undoYes: 'Sí, borrar',
  },
  types: { EXPENSE: 'Gasto', INCOME: 'Ingreso' },
  today: 'hoy',
  yesterday: 'ayer',
  installments: (count: number, each: string) => `${count} cuotas de ${each}`,
  scheduled: (dayMonth: string) => `Programado para el ${dayMonth}`,
} as const;

/** Escapes for Telegram's HTML and turns `*x*` into bold. */
export function toTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*([^*]+)\*/g, '<b>$1</b>');
}
