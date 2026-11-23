import React from 'react';
import { AbsoluteFill, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Sfx } from '../components/AudioTracks';
import { Caption, useExit } from '../components/Text';
import { TICKET, Ticket } from '../components/Ticket';
import { CONFIG } from '../config';
import { RAIN_FRAMES } from '../timeline';
import { COLORS, FONTS, SAFE, SPRING } from '../theme';

/** Where each ticket lands in the rain (top-left corner, rotation in degrees). */
const RAIN_SPOTS = [
  { x: 110, y: 300, r: -4 },
  { x: 390, y: 470, r: 3 },
  { x: 140, y: 640, r: -2 },
  { x: 380, y: 810, r: 4 },
  { x: 100, y: 980, r: -3 },
  { x: 370, y: 1150, r: 2 },
];

/** The month that receives them. */
const MONTH = { x: 200, y: 1010, width: 680, height: 560 };
const GAP = 12;

function stackSpot(k: number) {
  return {
    x: MONTH.x + (MONTH.width - TICKET.width) / 2,
    y: MONTH.y + MONTH.height - 20 - TICKET.height * (k + 1) - GAP * k,
    r: 0,
  };
}

/** 5–12 s: small purchases rain down (5–9 s), then pile up on next month and overflow it. */
export const Tickets: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = useExit(duration, 10);
  const tickets = CONFIG.rain.tickets;

  const monthIn = spring({ frame: frame - RAIN_FRAMES, fps, config: SPRING.soft });
  // Overflow: the border turns expense once the pile passes the month's top.
  const overflowing = spring({ frame: frame - RAIN_FRAMES - 40, fps, config: SPRING.soft });
  const border = interpolateColors(overflowing, [0, 1], [COLORS.inkSoft, COLORS.expense]);

  return (
    <AbsoluteFill style={{ background: COLORS.ink, opacity: exit }}>
      {/* Next month */}
      <div
        style={{
          position: 'absolute',
          left: MONTH.x,
          top: MONTH.y,
          width: MONTH.width,
          height: MONTH.height,
          borderRadius: 40,
          border: `4px solid ${border}`,
          background: 'rgba(255, 255, 255, 0.04)',
          boxSizing: 'border-box',
          opacity: monthIn,
          transform: `scale(${0.96 + monthIn * 0.04})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: MONTH.x,
          width: MONTH.width,
          top: MONTH.y + MONTH.height + 18,
          textAlign: 'center',
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: 44,
          color: border,
          opacity: monthIn,
        }}
      >
        {CONFIG.overflow.month}
      </div>

      {tickets.map((t, i) => {
        const fall = spring({ frame: frame - 4 - i * 10, fps, config: SPRING.gentle });
        const rain = RAIN_SPOTS[i];
        const stack = stackSpot(i);
        const move = spring({ frame: frame - RAIN_FRAMES - 6 - i * 6, fps, config: SPRING.gentle });
        const x = interpolate(move, [0, 1], [rain.x, stack.x]);
        const yRain = interpolate(fall, [0, 1], [rain.y - 900, rain.y]);
        const y = interpolate(move, [0, 1], [yRain, stack.y]);
        const r = interpolate(move, [0, 1], [rain.r, stack.r]);
        return (
          <Ticket
            key={t.label}
            label={t.label}
            detail={t.detail}
            amount={t.amount}
            style={{
              left: x,
              top: y,
              opacity: Math.min(1, fall * 1.4),
              transform: `rotate(${r}deg)`,
            }}
          />
        );
      })}

      {/* A soft tick as each ticket lands, softer as they pile up. */}
      {tickets.map((t, i) => (
        <React.Fragment key={`sfx-${t.label}`}>
          <Sfx name="tick" at={16 + i * 10} volume={0.8} />
          <Sfx name="tick" at={RAIN_FRAMES + 20 + i * 6} volume={0.45} />
        </React.Fragment>
      ))}

      {frame < RAIN_FRAMES ? (
        <Caption
          text={CONFIG.rain.caption}
          top={1400}
          delay={58}
          duration={RAIN_FRAMES}
          color={COLORS.white}
          highlight={COLORS.expense}
        />
      ) : (
        <Caption
          text={CONFIG.overflow.caption}
          top={SAFE.top + 30}
          delay={RAIN_FRAMES + 16}
          duration={duration}
          exit={false}
          color={COLORS.white}
          highlight={COLORS.expense}
        />
      )}
    </AbsoluteFill>
  );
};
