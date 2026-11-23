import React from 'react';
import { Composition, Series } from 'remotion';
import { AudioTracks } from './components/AudioTracks';
import { loadFonts } from './fonts';
import { CardSolution } from './scenes/CardSolution';
import { Closing } from './scenes/Closing';
import { HideAmounts, Home } from './scenes/Home';
import { Hook, Pause } from './scenes/Hook';
import { Tickets } from './scenes/Tickets';
import { COLORS, VIDEO } from './theme';
import { CUTS, DURATION, totalFrames, type CutId, type SceneId } from './timeline';

loadFonts();

const Scene: React.FC<{ id: SceneId; next?: SceneId }> = ({ id, next }) => {
  const duration = DURATION[id];
  switch (id) {
    case 'hook':
      // Into the pause the question stays; into anything else it fades out.
      return <Hook duration={duration} exit={next !== 'pause'} />;
    case 'pause':
      return <Pause duration={duration} />;
    case 'tickets':
      return <Tickets duration={duration} />;
    case 'card':
      return <CardSolution duration={duration} />;
    case 'home':
      return <Home duration={duration} />;
    case 'hide':
      return <HideAmounts duration={duration} />;
    case 'closing':
      // Both cuts reach the closing from a brand scene (card or hide).
      return <Closing from={COLORS.brand} />;
  }
};

type CutProps = {
  cut: CutId;
  /** false renders without music (to pick the platform's audio when publishing). */
  music: boolean;
};

const Cut: React.FC<CutProps> = ({ cut, music }) => (
  <>
    <Series>
      {CUTS[cut].map((id, i) => (
        <Series.Sequence key={id} durationInFrames={DURATION[id]} name={id}>
          <Scene id={id} next={CUTS[cut][i + 1]} />
        </Series.Sequence>
      ))}
    </Series>
    <AudioTracks cut={cut} music={music} />
  </>
);

export const Root: React.FC = () => (
  <>
    <Composition
      id="Platin30"
      component={Cut}
      defaultProps={{ cut: '30', music: true } satisfies CutProps}
      durationInFrames={totalFrames('30')}
      {...VIDEO}
    />
    <Composition
      id="Platin15"
      component={Cut}
      defaultProps={{ cut: '15', music: true } satisfies CutProps}
      durationInFrames={totalFrames('15')}
      {...VIDEO}
    />
  </>
);
