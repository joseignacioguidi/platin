import React from 'react';
import { Sequence } from 'remotion';
import type { ActId } from '../config';
import type { Timeline } from '../timeline';
import { Caption } from './Text';

/** The captions of an act's beats, each during its beat (the act starts at frame 0 here). */
export const BeatCaptions: React.FC<{
  timeline: Timeline;
  act: ActId;
  color: string;
  highlight: string;
  delay?: number;
}> = ({ timeline, act, color, highlight, delay = 2 }) => {
  const start = timeline.acts[act]?.from ?? 0;
  return (
    <>
      {timeline.beats
        .filter((b) => b.act === act && b.caption)
        .map((b) => (
          <Sequence key={b.index} from={b.from - start} durationInFrames={b.frames} layout="none">
            <Caption
              text={b.caption ?? ''}
              delay={delay}
              duration={b.frames}
              color={color}
              highlight={highlight}
            />
          </Sequence>
        ))}
    </>
  );
};
