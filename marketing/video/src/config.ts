// Every text on screen, the voiceover, the URL and the audio levels. Change them here, not in
// the scenes. The amounts come from the demo data (public/captures/story.json, see src/story.ts).
//
// Concept: "El saldo te engaña". The balance looks like plenty; the card statement, the rent and
// the bills, and the trip savings are already spoken for. platin does that math.
//
// Plain TypeScript with no imports: scripts/voiceover.mjs also loads it with Node.

/** Something that happens on screen, at a fraction (0–1) of its beat. */
export type EventId =
  | 'balanceIn'
  | 'card'
  | 'fixed'
  | 'saved'
  | 'question'
  | 'turn'
  | 'free'
  | 'perDay'
  | 'installments'
  | 'goal'
  | 'closing';

export type ActId = 'problem' | 'solution' | 'closing';

/**
 * One voice line with what it shows. The beat lasts as long as its line (plus a short breath),
 * so the animation follows the voice.
 */
export type Beat = {
  act: ActId;
  /** Voiceover. "Platín" is spelled for the voice only: on screen the brand stays "platin". */
  voice: string;
  /** Text on screen during the beat (words between *asterisks* are highlighted). */
  caption?: string;
  /**
   * When each event happens: a fraction (0–1) of the beat, or a word of the voice line, so the
   * animation lands when that word is said (word timings come from ElevenLabs).
   */
  events: Partial<Record<EventId, number | string>>;
  /** ElevenLabs speed for this line, if it differs from CONFIG.audio.voiceSpeed. */
  voiceSpeed?: number;
  /** Shortest length in frames, for beats whose animation needs time. */
  minFrames?: number;
};

export type CutId = '30' | '15';

export const CONFIG = {
  url: 'platin.app',

  beats: {
    '30': [
      {
        act: 'problem',
        voice: 'Mirás el saldo y parece que te sobra la plata.',
        caption: 'Parece que *te sobra.*',
        events: { balanceIn: 0 },
        minFrames: 70,
      },
      {
        // One continuous line, so the three sound like a list; each ticket falls on its word.
        act: 'problem',
        voice: 'Pero se viene el resumen de la tarjeta, el alquiler y los servicios, y lo que querías guardar para el viaje.',
        events: { card: 'resumen', fixed: 'alquiler', saved: 'guardar' },
      },
      {
        act: 'problem',
        voice: '¿Cuánto te queda de verdad?',
        caption: '¿Cuánto te queda *de verdad?*',
        events: { question: 0 },
      },
      {
        act: 'solution',
        voice: 'Platín hace esa cuenta por vos.',
        caption: 'platin hace la cuenta por vos.',
        events: { turn: 0 },
        minFrames: 60,
      },
      {
        act: 'solution',
        voice: 'Te dice cuánto podés gastar este mes, y hasta cuánto por día.',
        caption: 'Cuánto podés gastar este mes. *Y por día.*',
        events: { free: 0, perDay: 0.55 },
      },
      {
        act: 'solution',
        voice: 'Ves tus cuotas de los próximos meses.',
        caption: 'Tus cuotas, *mes a mes.*',
        events: { installments: 0 },
      },
      {
        act: 'solution',
        voice: 'Y cuánto te falta para el viaje.',
        caption: 'Y cuánto te falta *para el viaje.*',
        events: { goal: 0 },
      },
      {
        act: 'closing',
        voice: 'Platín. <break time="0.7s" /> Tu plata, más clara. Empezá gratis.',
        // Slower, with a pause after the brand (an ElevenLabs break tag): the name and the
        // tagline need room to land.
        voiceSpeed: 0.8,
        events: { closing: 0 },
        // The logo winks at frame 58 for 42 frames.
        minFrames: 100,
      },
    ],
    '15': [
      {
        act: 'problem',
        voice: 'Mirás el saldo y parece que te sobra.',
        caption: 'Parece que *te sobra.*',
        events: { balanceIn: 0 },
        minFrames: 60,
      },
      {
        act: 'problem',
        voice: 'Pero falta la tarjeta, los fijos y el ahorro.',
        events: { card: 'tarjeta', fixed: 'fijos', saved: 'ahorro' },
        minFrames: 75,
      },
      {
        act: 'solution',
        voice: 'Platín hace la cuenta y te dice cuánto podés gastar de verdad.',
        caption: 'platin te dice cuánto podés *gastar de verdad.*',
        events: { turn: 0, free: 0.3, perDay: 0.75 },
        minFrames: 120,
      },
      {
        act: 'closing',
        voice: 'Platín. <break time="0.7s" /> Tu plata, más clara. Empezá gratis.',
        // Slower, with a pause after the brand (an ElevenLabs break tag): the name and the
        // tagline need room to land.
        voiceSpeed: 0.8,
        events: { closing: 0 },
        minFrames: 100,
      },
    ],
  } satisfies Record<CutId, Beat[]>,

  problem: {
    balanceLabel: 'Saldo en tus cuentas',
    /** The three things already spoken for, in the order they fall. */
    tickets: {
      card: { label: 'Resumen de la tarjeta', detail: 'vence el 28' },
      fixed: { label: 'Alquiler y servicios', detail: 'este mes' },
      saved: { label: 'Ahorro para el viaje', detail: 'lo que apartaste' },
    },
    unknown: '¿?',
  },

  closing: {
    name: 'platin',
    tagline: 'Tu plata, *más clara.*',
    cta: 'Empezá gratis en',
  },

  /**
   * The music brief for `pnpm music` (ElevenLabs Music): a global style and one per act. Each
   * section lasts exactly as long as its act, so the mood turns with the story.
   * Direction "pulso → beat": no melody; the tension and the relief come from the rhythm.
   * (The melodic take is in out/musica-melodica/ and in git history.)
   */
  music: {
    positive: ['minimal rhythmic electronic', 'beat-driven', 'no melody', 'modern social media ad', 'instrumental', '100 bpm', 'clean mix'],
    negative: ['melody', 'piano', 'lead synth', 'vocals', 'orchestral', 'epic', 'dubstep'],
    sections: {
      problem: {
        name: 'Problem',
        positive: ['low sub bass pulse', 'clock ticking', 'subtle building tension', 'sparse and dry', 'no drums'],
        negative: ['melody', 'chords', 'drums', 'bright'],
      },
      solution: {
        name: 'Solution',
        positive: ['beat drops right at the start', 'punchy clean kick and claps', 'simple repeating bass line', 'steady confident groove'],
        negative: ['melody', 'piano', 'aggressive', 'busy'],
      },
      closing: {
        name: 'Closing',
        positive: ['groove continues under the voice', 'stops on a single final hit at the very end', 'clean ending'],
        negative: ['fade out', 'new melody', 'long silence'],
      },
    },
  },

  audio: {
    /** Optional, in public/ (`pnpm music` makes them). {cut} is 30 or 15; without it, no music. */
    music: 'music-{cut}.mp3',
    /** ElevenLabs speed (0.7–1.2): brisk, like a short video. */
    voiceSpeed: 1.1,
    voiceVolume: 1,
    musicVolume: 0.35,
    /** Music volume when there is a voiceover (ducking). */
    musicUnderVoiceVolume: 0.18,
    /** Music during the problem, relative to the rest: it opens up on "Platín hace esa cuenta". */
    musicProblemLevel: 0.5,
    /**
     * Re-edit of the generated track, per cut: from each event, play the track from `from`
     * seconds ('sync' = the same second as the video). Jumps are snapped to the bar (100 BPM,
     * 2.4 s = 72 frames) so the rhythm never stumbles; `loop` repeats a region (a whole number of
     * bars) while the part lasts.
     */
    musicEdit: {
      '30': [
        // "¿Cuánto te queda de verdad?": the more exciting part of the track (about 12–18 s).
        { at: 'question', from: 12 },
        // The app on screen: the part with the new sound (from 21 s), looped two bars at a time.
        { at: 'turn', from: 21, loop: [21, 25.8] },
        // The closing: back to the track's own ending, with its final hit.
        { at: 'closing', from: 'sync' },
      ],
    } as Partial<Record<CutId, { at: EventId; from: number | 'sync'; loop?: [number, number] }[]>>,
    musicBarFrames: 72,
    /** Sound effects (public/sfx/, made by `pnpm sfx`). 0 turns them off. */
    sfxVolume: 0.25,
  },
} as const;
