// Every text on screen, the URL and the audio levels. Change them here, not in the scenes.

export const CONFIG = {
  url: 'platin.app',

  hook: {
    /** Shown word by word. Words between * * are highlighted in brand. */
    question: '¿Cuánto pagás de tarjeta *el mes que viene?*',
  },
  pause: {
    dots: '…',
    answer: 'Exacto. Ni idea.',
  },
  rain: {
    tickets: [
      { label: 'Super', detail: '1 pago', amount: '$ 48.320' },
      { label: 'Zapatillas', detail: '6 cuotas', amount: '$ 31.500' },
      { label: 'Cena', detail: '1 pago', amount: '$ 36.500' },
      { label: 'Streaming', detail: 'todos los meses', amount: '$ 12.999' },
      { label: 'Heladera', detail: 'cuota 4 de 12', amount: '$ 74.990' },
      { label: 'Celular', detail: 'cuota 2 de 3', amount: '$ 62.500' },
    ],
    // A non-breaking space between "que" and "viene" keeps them together.
    caption: 'Total, lo pago *el mes que viene.*',
  },
  overflow: {
    month: 'Diciembre',
    caption: 'Y el mes que viene… *ya está lleno.*',
  },
  card: {
    caption: 'Cargá una compra en cuotas y mirá cuánto pagás cada mes.',
    purchase: { label: 'Zapatillas', detail: 'en 6 cuotas', amount: '$ 189.000' },
  },
  home: {
    caption: 'Pesos, dólares y tarjetas. Todo en un lugar.',
  },
  hide: {
    caption: 'Y nadie más los ve.',
    toggle: 'Ocultar montos',
  },
  closing: {
    name: 'platin',
    tagline: 'Tu plata, *más clara.*',
    cta: 'Empezá gratis en',
  },

  audio: {
    /** Optional files in public/. If missing, the video renders silent. */
    voiceover: 'voiceover.mp3',
    music: 'music.mp3',
    voiceoverVolume: 1,
    musicVolume: 0.35,
    /** Music volume while the voiceover exists (ducking). */
    musicUnderVoiceVolume: 0.15,
  },
} as const;
