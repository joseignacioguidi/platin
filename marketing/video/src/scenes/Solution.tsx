import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CAPTURES, screen, type Box } from '../captures';
import { Sfx } from '../components/AudioTracks';
import { BeatCaptions } from '../components/BeatCaptions';
import { Wipe, usePhoneOffset, useSpringAt } from '../components/Motion';
import { AppScreen, Phone } from '../components/Phone';
import { STORY, ars } from '../story';
import { COLORS, FONTS, SPRING } from '../theme';
import type { Timeline } from '../timeline';

const HOME = screen('inicio');
const CARD = screen('tarjeta-cuotas');
const GOALS = screen('metas');
const HEADLINE = HOME.headline;
const BARS = CARD.bars ?? [];
const CHART_BG = CARD.chart?.background ?? COLORS.white;
/** Goals screen scrolled toward the trip card, without going past the end of the page (CSS px). */
const GOALS_SCROLL = Math.max(
  0,
  Math.min((GOALS.goal?.y ?? 0) - 240, GOALS.height - CAPTURES.viewport.height),
);

/** Frames the headline takes to count up to the free amount. */
const COUNT_FRAMES = 36;
const BAR_STAGGER = 5;

/** A ring that draws attention to part of the app (CSS px of the page, inside the screen). */
const Ring: React.FC<{ box: Box & { radius?: number }; p: number; out?: number }> = ({ box, p, out = 0 }) => {
  const pad = 6;
  const visible = p * (1 - out);
  if (visible <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x - pad,
        top: box.y - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
        borderRadius: Math.min((box.radius ?? 12) + pad, (box.height + pad * 2) / 2),
        border: `3px solid ${COLORS.brandStrong}`,
        boxSizing: 'border-box',
        opacity: visible,
        transform: `scale(${1.08 - p * 0.08})`,
      }}
    />
  );
};

/**
 * Act 2, on brand: the phone with the real app. The home does the math (free this month and per
 * day), then the card's installments month by month and the trip goal.
 */
export const Solution: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const act = timeline.acts.solution ?? { from: 0, frames: 0 };
  const at = (id: keyof Timeline['events']) => {
    const e = timeline.events[id];
    return e === undefined ? undefined : e - act.from;
  };
  const turn = at('turn') ?? 0;
  const offset = usePhoneOffset(turn + 4);

  // The home's headline counts up to the free amount while the voice says platin does the math.
  const countFrom = turn + 14;
  const count = interpolate(frame, [countFrom, countFrom + COUNT_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - (1 - t) ** 3,
  });
  const overlay = interpolate(frame, [countFrom + COUNT_FRAMES + 4, countFrom + COUNT_FRAMES + 10], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const freeRing = useSpringAt(at('free'), SPRING.soft, 14);
  const perDayRing = useSpringAt(at('perDay'), SPRING.soft, 14);
  const toCard = useSpringAt(at('installments'), SPRING.soft, 14);
  const toGoals = useSpringAt(at('goal'), SPRING.soft, 14);
  const goalRing = useSpringAt(at('goal') === undefined ? undefined : (at('goal') ?? 0) + 10, SPRING.soft, 14);
  const barsFrom = (at('installments') ?? 0) + 10;

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <Wipe color={COLORS.brand} delay={turn} />
      <Sfx name="whoosh" at={turn} volume={0.3} />
      <BeatCaptions timeline={timeline} act="solution" color={COLORS.ink} highlight={COLORS.ink} delay={4} />

      <Phone offsetY={offset}>
        <AppScreen name="inicio">
          {HEADLINE && overlay > 0 ? (
            <div
              style={{
                position: 'absolute',
                left: HEADLINE.x - 2,
                top: HEADLINE.y - 2,
                width: HEADLINE.width + 8,
                height: HEADLINE.height + 4,
                background: HEADLINE.background,
                color: HEADLINE.color,
                fontFamily: FONTS.mono,
                fontWeight: Number(HEADLINE.fontWeight),
                fontSize: HEADLINE.fontSize,
                letterSpacing: HEADLINE.letterSpacing,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: `${HEADLINE.height + 4}px`,
                paddingLeft: 2,
                whiteSpace: 'pre',
                opacity: overlay,
              }}
            >
              {ars(STORY.free * count)}
            </div>
          ) : null}
          {HEADLINE ? <Ring box={HEADLINE} p={freeRing} out={perDayRing} /> : null}
          {HOME.perDay ? <Ring box={HOME.perDay} p={perDayRing} out={toCard} /> : null}
        </AppScreen>

        {toCard > 0 ? (
          <AppScreen name="tarjeta-cuotas" opacity={toCard}>
            {/* Each bar stays hidden until its turn, then grows from the bottom. */}
            {BARS.map((bar, i) => {
              const p = interpolate(frame, [barsFrom + i * BAR_STAGGER, barsFrom + i * BAR_STAGGER + 12], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: (t) => 1 - (1 - t) ** 3,
              });
              return (
                <div
                  key={bar.label}
                  style={{
                    position: 'absolute',
                    left: bar.x - 2,
                    top: bar.y - 2,
                    width: bar.width + 4,
                    height: (bar.height + 4) * (1 - p),
                    background: CHART_BG,
                  }}
                />
              );
            })}
          </AppScreen>
        ) : null}

        {toGoals > 0 ? (
          <AppScreen name="metas" scroll={GOALS_SCROLL} opacity={toGoals}>
            {GOALS.goal ? <Ring box={GOALS.goal} p={goalRing} /> : null}
          </AppScreen>
        ) : null}
      </Phone>

      {at('installments') !== undefined
        ? BARS.map((bar, i) => (
            <Sfx key={bar.label} name="pop" at={barsFrom + i * BAR_STAGGER + 6} volume={0.5} />
          ))
        : null}
      {at('perDay') !== undefined ? <Sfx name="click" at={at('perDay') ?? 0} volume={0.7} /> : null}
    </AbsoluteFill>
  );
};
