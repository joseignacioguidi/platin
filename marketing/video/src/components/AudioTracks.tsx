import React from 'react';
import { Audio, Sequence, getStaticFiles, interpolate, staticFile, useVideoConfig } from 'remotion';
import { CONFIG } from '../config';
import { sceneStart, type CutId, type SceneId } from '../timeline';

const has = (path: string): boolean => getStaticFiles().some((f) => f.name === path);

/** public/voice/<cut>-<n>.mp3, n from 01 (made by `pnpm voiceover`). */
export const voiceFile = (cut: CutId, index: number): string =>
  `voice/${cut}-${String(index + 1).padStart(2, '0')}.mp3`;

/** The voiceover lines of a cut, each at its frame. Missing files are skipped. */
export function voiceLines(cut: CutId): { file: string; from: number }[] {
  return CONFIG.voice[cut]
    .map((line, i) => ({
      file: voiceFile(cut, i),
      from: sceneStart(cut, line.scene as SceneId) + line.at,
    }))
    .filter((line) => has(line.file));
}

/** Voiceover and optional music. Without the files the video is silent. */
export const AudioTracks: React.FC<{ cut: CutId; music: boolean }> = ({ cut, music }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const { voiceVolume, musicVolume, musicUnderVoiceVolume } = CONFIG.audio;
  const lines = voiceLines(cut);
  const level = lines.length > 0 ? musicUnderVoiceVolume : musicVolume;

  return (
    <>
      {music && has(CONFIG.audio.music) ? (
        <Audio
          src={staticFile(CONFIG.audio.music)}
          volume={(f) =>
            level *
            interpolate(f, [0, fps / 2, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}
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
