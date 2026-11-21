import React from 'react';
import { Audio, getStaticFiles, interpolate, staticFile, useVideoConfig } from 'remotion';
import { CONFIG } from '../config';

const has = (name: string): boolean => getStaticFiles().some((f) => f.name === name);

/** Optional voiceover and music from public/. Without them the video is silent. */
export const AudioTracks: React.FC = () => {
  const { durationInFrames, fps } = useVideoConfig();
  const { voiceover, music, voiceoverVolume, musicVolume, musicUnderVoiceVolume } = CONFIG.audio;
  const withVoice = has(voiceover);
  const level = withVoice ? musicUnderVoiceVolume : musicVolume;

  return (
    <>
      {has(music) ? (
        <Audio
          src={staticFile(music)}
          volume={(f) =>
            level *
            interpolate(f, [0, fps / 2, durationInFrames - fps, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}
      {withVoice ? <Audio src={staticFile(voiceover)} volume={voiceoverVolume} /> : null}
    </>
  );
};
