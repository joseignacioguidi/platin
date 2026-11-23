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

  /**
   * Voiceover, one line at a time: each starts `at` frames after its scene begins.
   * `pnpm voiceover` turns them into public/voice/<cut>-<n>.mp3 with ElevenLabs.
   * Changing a text means generating again. "Platín" (stress on the i) is spelled for the voice
   * only: on screen the brand stays "platin".
   */
  voice: {
    '30': [
      { scene: 'hook', at: 4, text: '¿Cuánto pagás de tarjeta el mes que viene?' },
      { scene: 'pause', at: 30, text: 'Exacto. Ni idea.' },
      // With the rain caption, which shows at frame 58.
      { scene: 'tickets', at: 52, text: 'Total, lo pago el mes que viene.' },
      { scene: 'tickets', at: 128, text: 'Y el mes que viene ya está lleno.' },
      {
        scene: 'card',
        at: 14,
        text: 'Con platín cargás tus compras en cuotas y ves cuánto pagás cada mes, antes de que llegue el resumen.',
      },
      { scene: 'home', at: 8, text: 'Pesos, dólares y tarjetas, todo en un lugar.' },
      { scene: 'hide', at: 18, text: 'Y nadie más los ve.' },
      { scene: 'closing', at: 8, text: 'Platín. Tu plata, más clara. Empezá gratis.' },
    ],
    '15': [
      { scene: 'hook', at: 4, text: '¿Cuánto pagás de tarjeta el mes que viene?' },
      { scene: 'card', at: 14, text: 'Con platín cargás tus compras en cuotas y ves cuánto pagás cada mes.' },
      { scene: 'closing', at: 14, text: 'Platín. Tu plata, más clara.' },
    ],
  },

  audio: {
    /** Optional, in public/. Without it the video has no music. */
    music: 'music.mp3',
    voiceVolume: 1,
    musicVolume: 0.35,
    /** Music volume when there is a voiceover (ducking). */
    musicUnderVoiceVolume: 0.12,
    /** Sound effects (public/sfx/, made by `pnpm sfx`). 0 turns them off. */
    sfxVolume: 0.25,
  },
} as const;
