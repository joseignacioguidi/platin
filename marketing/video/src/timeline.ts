// The video's timing comes from the voice: each beat lasts as long as its line plus a short
// breath, and the closing stretches to reach the cut's length. Events can be anchored to a word
// of the line, so the animation lands when it is said.
// Plain TypeScript with no imports: scripts/voiceover.mjs also loads it with Node.
import type { ActId, Beat, CutId, EventId } from './config.ts';

export const FPS = 30;

/** Target length of each cut, in frames. */
export const TARGET: Record<CutId, number> = { '30': 30 * FPS, '15': 15 * FPS };

/** Frames before the voice starts in a beat, and after it ends. */
export const LEAD = 3;
export const TAIL = 6;
const MIN_BEAT = 36;
/** Most the closing grows past its own length, so it does not linger. */
const CLOSING_EXTRA = 40;
/** Frames an animation anchored to a word starts before the word, so it lands on it. */
const WORD_LEAD = 4;

/** When a word starts in a generated line (ElevenLabs alignment). */
export type WordTime = { word: string; start: number };

/** ElevenLabs tags like <break time="0.7s" /> are not spoken. */
export const spokenText = (text: string): string =>
  text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Lowercase, no accents or punctuation: to match an anchor with a spoken word. */
const plain = (w: string): string =>
  w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Seconds of the pause tags in a line. */
const breakSeconds = (text: string): number =>
  [...text.matchAll(/<break time="([\d.]+)s"/g)].reduce((sum, m) => sum + Number(m[1]), 0);

/**
 * Seconds a line takes before it is generated: a brisk Rioplatense read, about 16 characters per
 * second at speed 1.1 (measured). Pauses for punctuation and break tags.
 */
export function estimateSeconds(text: string, speed = 1.1): number {
  const spoken = spokenText(text);
  const pauses = (spoken.match(/[.…?!,]/g) ?? []).length * 0.12;
  return ((spoken.length / 16 + pauses) * 1.1) / speed + breakSeconds(text);
}

/**
 * Seconds into the line where `anchor` is said: from the real word timings or, before the line is
 * generated, in proportion to where the word sits in the text.
 */
function anchorSeconds(text: string, anchor: string, seconds: number, words?: WordTime[]): number {
  const target = plain(anchor);
  const hit = words?.find((w) => plain(w.word).startsWith(target));
  if (hit) return hit.start;
  const spoken = spokenText(text);
  const at = spoken.toLowerCase().indexOf(anchor.toLowerCase());
  return at < 0 ? 0 : (at / spoken.length) * seconds;
}

export type TimedBeat = Beat & {
  index: number;
  from: number;
  frames: number;
  /** Frame the voice starts at. */
  voiceFrom: number;
  voiceFrames: number;
};

export type Timeline = {
  beats: TimedBeat[];
  /** Global frame of each event. */
  events: Partial<Record<EventId, number>>;
  /** First frame and length of each act present in the cut. */
  acts: Partial<Record<ActId, { from: number; frames: number }>>;
  total: number;
  /** Frames over the target, if the voice does not fit (0 when it does). */
  over: number;
};

/**
 * `seconds(i)` is the real length of line i, or undefined to estimate it; `words(i)` its word
 * timings, if known.
 */
export function buildTimeline(
  cut: CutId,
  beats: readonly Beat[],
  seconds: (index: number) => number | undefined,
  words: (index: number) => WordTime[] | undefined = () => undefined,
): Timeline {
  const lengths = beats.map((beat, index) => {
    const voiceFrames = Math.ceil((seconds(index) ?? estimateSeconds(beat.voice, beat.voiceSpeed)) * FPS);
    return { voiceFrames, frames: Math.max(beat.minFrames ?? MIN_BEAT, LEAD + voiceFrames + TAIL) };
  });

  // Time left to reach the target: first the closing (up to CLOSING_EXTRA), then the rest is
  // shared among the other beats, in proportion to their length, as a breath after each line.
  let short = TARGET[cut] - lengths.reduce((sum, l) => sum + l.frames, 0);
  const last = lengths[lengths.length - 1];
  if (short > 0 && last) {
    const extra = Math.min(short, CLOSING_EXTRA);
    last.frames += extra;
    short -= extra;
  }
  if (short > 0) {
    const others = lengths.slice(0, -1);
    const base = others.reduce((sum, l) => sum + l.frames, 0);
    let given = 0;
    others.forEach((l, i) => {
      const add = i === others.length - 1 ? short - given : Math.floor((short * l.frames) / base);
      l.frames += add;
      given += add;
    });
  }

  let from = 0;
  const timed: TimedBeat[] = beats.map((beat, index) => {
    const { frames, voiceFrames } = lengths[index];
    const t = { ...beat, index, from, frames, voiceFrom: from + LEAD, voiceFrames };
    from += frames;
    return t;
  });

  const events: Timeline['events'] = {};
  const acts: Timeline['acts'] = {};
  for (const beat of timed) {
    for (const [id, at] of Object.entries(beat.events) as [EventId, number | string][]) {
      events[id] =
        typeof at === 'number'
          ? beat.from + Math.round(at * beat.frames)
          : Math.max(
              beat.from,
              beat.voiceFrom +
                Math.round(anchorSeconds(beat.voice, at, beat.voiceFrames / FPS, words(beat.index)) * FPS) -
                WORD_LEAD,
            );
    }
    const act = acts[beat.act];
    if (act) act.frames = beat.from + beat.frames - act.from;
    else acts[beat.act] = { from: beat.from, frames: beat.frames };
  }

  return { beats: timed, events, acts, total: from, over: Math.max(0, from - TARGET[cut]) };
}
