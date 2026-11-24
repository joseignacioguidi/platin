import React from 'react';
import { AbsoluteFill, Composition, Sequence } from 'remotion';
import { AudioTracks } from './components/AudioTracks';
import type { CutId } from './config';
import { loadFonts } from './fonts';
import { Closing } from './scenes/Closing';
import { Problem } from './scenes/Problem';
import { Solution } from './scenes/Solution';
import { COLORS, VIDEO } from './theme';
import { TIMELINES } from './voice';

loadFonts();

type CutProps = {
  cut: CutId;
  /** false renders without music (to pick the platform's audio when publishing). */
  music: boolean;
};

/** Three acts (problem on ink, solution on brand, closing on white), timed by the voice. */
const Cut: React.FC<CutProps> = ({ cut, music }) => {
  const timeline = TIMELINES[cut];
  const { problem, solution, closing } = timeline.acts;
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {problem ? (
        <Sequence from={problem.from} durationInFrames={problem.frames} name="problem">
          <Problem timeline={timeline} />
        </Sequence>
      ) : null}
      {solution ? (
        <Sequence from={solution.from} durationInFrames={solution.frames} name="solution">
          <Solution timeline={timeline} />
        </Sequence>
      ) : null}
      {closing ? (
        <Sequence from={closing.from} durationInFrames={closing.frames} name="closing">
          <Closing from={COLORS.brand} />
        </Sequence>
      ) : null}
      <AudioTracks cut={cut} music={music} />
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="Platin30"
      component={Cut}
      defaultProps={{ cut: '30', music: true } satisfies CutProps}
      durationInFrames={TIMELINES['30'].total}
      {...VIDEO}
    />
    <Composition
      id="Platin15"
      component={Cut}
      defaultProps={{ cut: '15', music: true } satisfies CutProps}
      durationInFrames={TIMELINES['15'].total}
      {...VIDEO}
    />
  </>
);
