// Which voice files are current, and the timeline they give each cut.
import manifest from '../public/voice/manifest.json';
import { CONFIG, type CutId } from './config';
import { buildTimeline, type Timeline, type WordTime } from './timeline';

type Entry = { key: { text: string }; seconds: number; words?: WordTime[] };
const MANIFEST = manifest as unknown as Record<string, Entry | undefined>;

/** public/voice/<cut>-<n>.mp3, n from 01 (made by `pnpm voiceover`). */
export const voiceFile = (cut: CutId, index: number): string =>
  `${cut}-${String(index + 1).padStart(2, '0')}.mp3`;

/** The manifest entry of a line, only if it was generated from the current text. */
function current(cut: CutId, index: number): Entry | undefined {
  const entry = MANIFEST[voiceFile(cut, index)];
  return entry && entry.key.text === CONFIG.beats[cut][index].voice ? entry : undefined;
}

export const voiceSeconds = (cut: CutId, index: number): number | undefined => current(cut, index)?.seconds;

const timeline = (cut: CutId): Timeline =>
  buildTimeline(
    cut,
    CONFIG.beats[cut],
    (i) => voiceSeconds(cut, i),
    (i) => current(cut, i)?.words,
  );

export const TIMELINES: Record<CutId, Timeline> = { '30': timeline('30'), '15': timeline('15') };
