import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { screen } from '../captures';
import { AppScreen, Phone, SCALE, screenOrigin } from '../components/Phone';
import { Caption } from '../components/Text';
import { TICKET, Ticket } from '../components/Ticket';
import { CONFIG } from '../config';
import { COLORS, FONTS, SPRING, VIDEO } from '../theme';

const CARD = screen('tarjeta-cuotas');
const BARS = CARD.bars ?? [];
const CHART_BG = CARD.chart?.background ?? COLORS.white;

/** Frames of the scene's beats. */
const T = {
  phoneIn: 16,
  ticketIn: 54,
  split: 96,
  chipStagger: 7,
  scroll: 178,
} as const;
/** How far the card screen scrolls at the end, to show the installments list (CSS px). */
export const CARD_END_SCROLL = 260;

/** Phone entering from below, in video px. */
export function usePhoneOffset(delay: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: SPRING.slow });
  return interpolate(p, [0, 1], [1400, 0]);
}

/** A brand circle that grows from the center over the previous background. */
export const Wipe: React.FC<{ color: string; delay?: number }> = ({ color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: SPRING.soft, durationInFrames: 26 });
  const r = p * 2300;
  return (
    <div
      style={{
        position: 'absolute',
        left: VIDEO.width / 2 - r,
        top: VIDEO.height / 2 - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        background: color,
      }}
    />
  );
};

/** 12–20 s: the phone with the card's "Cuotas" tab; a purchase splits into monthly installments. */
export const CardSolution: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const offset = usePhoneOffset(T.phoneIn);
  const scrollP = spring({ frame: frame - T.scroll, fps, config: SPRING.slow });
  const scroll = scrollP * CARD_END_SCROLL;
  const origin = screenOrigin(0, offset);

  const ticketIn = spring({ frame: frame - T.ticketIn, fps, config: SPRING.soft, durationInFrames: 12 });
  const ticketOut = spring({ frame: frame - T.split, fps, config: SPRING.soft, durationInFrames: 14 });
  const ticketX = (VIDEO.width - TICKET.width) / 2;
  const ticketY = 960;
  const ticketCenter = { x: VIDEO.width / 2, y: ticketY + TICKET.height / 2 };

  const chips = BARS.slice(0, 6).map((bar, i) => {
    const start = T.split + i * T.chipStagger;
    const move = spring({ frame: frame - start, fps, config: SPRING.gentle, durationInFrames: 24 });
    const target = {
      x: origin.x + (bar.x + bar.width / 2) * SCALE,
      y: origin.y + (bar.y + bar.height * 0.55 - scroll) * SCALE,
    };
    return {
      i,
      x: interpolate(move, [0, 1], [ticketCenter.x, target.x]),
      y: interpolate(move, [0, 1], [ticketCenter.y, target.y]),
      opacity: frame < start ? 0 : interpolate(move, [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
      reveal: spring({ frame: frame - start - 16, fps, config: SPRING.soft, durationInFrames: 18 }),
    };
  });

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <Wipe color={COLORS.brand} />
      <Caption text={CONFIG.card.caption} delay={14} duration={duration} highlight={COLORS.ink} />
      <Phone offsetY={offset}>
        <AppScreen name="tarjeta-cuotas" scroll={scroll}>
          {/* Each bar stays hidden until its installment arrives, then grows from the bottom. */}
          {BARS.map((bar, i) => {
            const reveal = chips[i]?.reveal ?? 1;
            return (
              <div
                key={bar.label}
                style={{
                  position: 'absolute',
                  left: bar.x - 2,
                  top: bar.y - 2,
                  width: bar.width + 4,
                  height: (bar.height + 4) * (1 - reveal),
                  background: CHART_BG,
                }}
              />
            );
          })}
        </AppScreen>
      </Phone>

      {/* The purchase, as a ticket in the card color. */}
      <Ticket
        label={CONFIG.card.purchase.label}
        detail={CONFIG.card.purchase.detail}
        amount={CONFIG.card.purchase.amount}
        color={COLORS.card}
        style={{
          left: ticketX,
          top: ticketY + (1 - ticketIn) * 60,
          opacity: ticketIn * (1 - ticketOut),
          transform: `scale(${1 - ticketOut * 0.3})`,
        }}
      />

      {/* Its six installments, one to each month. */}
      {chips.map((c) => (
        <div
          key={c.i}
          style={{
            position: 'absolute',
            left: c.x - 58,
            top: c.y - 28,
            width: 116,
            height: 56,
            borderRadius: 28,
            background: COLORS.card,
            color: COLORS.ink,
            boxShadow: '0 10px 24px rgba(24, 24, 24, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONTS.mono,
            fontWeight: 600,
            fontSize: 30,
            fontVariantNumeric: 'tabular-nums',
            opacity: c.opacity,
          }}
        >
          {c.i + 1}/6
        </div>
      ))}
    </AbsoluteFill>
  );
};
