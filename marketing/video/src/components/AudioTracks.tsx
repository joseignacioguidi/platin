import React from 'react';
import { Audio, Sequence, getStaticFiles, interpolate, staticFile, useVideoConfig } from 'remotion';
import { CONFIG, type CutId } from '../config';
import { FPS } from '../timeline';
import { TIMELINES, voiceFile, voiceSeconds } from '../voice';

const has = (path: string): boolean => getStaticFiles().some((f) => f.name === path);

/** Frames the music takes to rise at the question and at the turn. */
const MUSIC_RISE = 8;
/** Short fades at each jump of the re-edited track, so no cut clicks. */
const EDGE = 2;

/**
 * The voiceover lines of a cut, each at its beat. Only files generated from the current text
 * play: a stale one (the text changed since) stays silent until `pnpm voiceover` runs again.
 */
export function voiceLines(cut: CutId): { file: string; from: number }[] {
  return TIMELINES[cut].beats
    .filter((b) => voiceSeconds(cut, b.index) !== undefined)
    .map((b) => ({ file: `voice/${voiceFile(cut, b.index)}`, from: b.voiceFrom }))
    .filter((line) => has(line.file));
}

/** A stretch of the video and the frame of the track it plays from. */
type Piece = { from: number; to: number; source: number };

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * How the track is laid on the video: as is, or re-edited (CONFIG.audio.musicEdit). Every jump
 * keeps the position within the bar, so the beat carries on.
 */
export function musicPieces(cut: CutId): Piece[] {
  const timeline = TIMELINES[cut];
  const total = timeline.total;
  const bar = CONFIG.audio.musicBarFrames;
  type Part = { frame: number; from: number | 'sync'; loop?: [number, number] };
  const edits: Part[] = (CONFIG.audio.musicEdit[cut] ?? []).flatMap((e) => {
    const frame = timeline.events[e.at];
    return frame === undefined ? [] : [{ frame, from: e.from, loop: e.loop }];
  });
  const parts: Part[] = [{ frame: 0, from: 'sync' }, ...edits.sort((a, b) => a.frame - b.frame)];

  const pieces: Piece[] = [];
  parts.forEach((part, i) => {
    const start = part.frame;
    const end = parts[i + 1]?.frame ?? total;
    if (end <= start) return;
    // The track frame to start from, on the same beat of the bar as the video.
    const target = part.from === 'sync' ? start : Math.round(part.from * FPS);
    let source = target + mod(start - target, bar);
    const loop = part.loop ? [Math.round(part.loop[0] * FPS), Math.round(part.loop[1] * FPS)] : undefined;
    let at = start;
    while (at < end) {
      const room = loop && source < loop[1] ? loop[1] - source : end - at;
      const to = Math.min(end, at + room);
      pieces.push({ from: at, to, source });
      source += to - at;
      at = to;
      if (loop && source >= loop[1]) source -= loop[1] - loop[0];
    }
  });
  return pieces;
}

/** Voiceover and optional music. Without the files the video is silent. */
export const AudioTracks: React.FC<{ cut: CutId; music: boolean }> = ({ cut, music }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const { voiceVolume, musicVolume, musicUnderVoiceVolume, musicProblemLevel } = CONFIG.audio;
  const lines = voiceLines(cut);
  const musicFile = CONFIG.audio.music.replace('{cut}', cut);
  const level = lines.length > 0 ? musicUnderVoiceVolume : musicVolume;

  // Lower during the problem, a step up at the question, full from the turn.
  const { question, turn = 0 } = TIMELINES[cut].events;
  const middle = (musicProblemLevel + 1) / 2;
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const act = (f: number) =>
    question !== undefined && question < turn
      ? interpolate(
          f,
          [question - MUSIC_RISE, question, turn - MUSIC_RISE, turn],
          [musicProblemLevel, middle, middle, 1],
          clamp,
        )
      : interpolate(f, [turn - MUSIC_RISE, turn], [musicProblemLevel, 1], clamp);
  const ends = (f: number) =>
    interpolate(f, [0, fps / 2, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], clamp);

  return (
    <>
      {music && has(musicFile)
        ? musicPieces(cut).map((p, i, all) => {
            const length = p.to - p.from;
            const fadeIn = i > 0 ? EDGE : 0;
            const fadeOut = i < all.length - 1 ? EDGE : 0;
            const edge = (f: number) =>
              Math.min(fadeIn ? Math.min(1, f / fadeIn) : 1, fadeOut ? Math.min(1, (length - f) / fadeOut) : 1);
            return (
              <Sequence
                key={`${p.from}-${p.source}`}
                from={p.from}
                durationInFrames={length}
                layout="none"
                name={`music @${p.source}`}
              >
                <Audio
                  src={staticFile(musicFile)}
                  startFrom={p.source}
                  volume={(f) => level * act(p.from + f) * ends(p.from + f) * edge(f)}
                />
              </Sequence>
            );
          })
        : null}
      {lines.map((line) => (
        <Sequence key={line.file} from={line.from} layout="none" name={line.file}>
          <Audio src={staticFile(line.file)} volume={voiceVolume} />
        </Sequence>
      ))}
    </>
  );
};

export type SfxName = 'tick' | 'whoosh' | 'click' | 'pop';

/** A sound effect from public/sfx/ at a frame of the current scene (silent if missing). */
export const Sfx: React.FC<{ name: SfxName; at: number; volume?: number }> = ({
  name,
  at,
  volume = 1,
}) => {
  const file = `sfx/${name}.wav`;
  const level = CONFIG.audio.sfxVolume * volume;
  if (level <= 0 || !has(file)) return null;
  return (
    <Sequence from={Math.round(at)} layout="none" name={`sfx ${name}`}>
      <Audio src={staticFile(file)} volume={level} />
    </Sequence>
  );
};
