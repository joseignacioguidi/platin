import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Sfx } from '../components/AudioTracks';
import { BeatCaptions } from '../components/BeatCaptions';
import { useSpringAt } from '../components/Motion';
import { useExit } from '../components/Text';
import { TICKET, Ticket } from '../components/Ticket';
import { CONFIG } from '../config';
import { STORY, ars } from '../story';
import { COLORS, FONTS, SAFE, SPRING, VIDEO } from '../theme';
import type { Timeline } from '../timeline';

const WIDTH = VIDEO.width - SAFE.left - SAFE.right;
const BALANCE_TOP = 640;
const TICKETS_TOP = 940;
const GAP = 20;

const TICKETS = [
  { id: 'card', color: COLORS.card, amount: STORY.card },
  { id: 'fixed', color: COLORS.pending, amount: STORY.fixed },
  { id: 'saved', color: COLORS.savings, amount: STORY.saved },
] as const;

/**
 * Act 1, on ink: the balance looks like plenty; three things already spoken for fall under it,
 * the balance gets crossed out and turns into a question.
 */
export const Problem: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const act = timeline.acts.problem ?? { from: 0, frames: 0 };
  // Events relative to the act.
  const at = (id: keyof Timeline['events']) => {
    const e = timeline.events[id];
    return e === undefined ? undefined : e - act.from;
  };
  const exit = useExit(act.frames, 8);

  const balanceIn = useSpringAt(at('balanceIn'), SPRING.soft);
  const count = useSpringAt(at('balanceIn'), SPRING.slow, 34);
  const landed = [
    useSpringAt(at('card'), SPRING.gentle),
    useSpringAt(at('fixed'), SPRING.gentle),
    useSpringAt(at('saved'), SPRING.gentle),
  ];
  const question = useSpringAt(at('question'), SPRING.soft, 18);
  // Crossed out as soon as the last one lands.
  const saved = at('saved');
  const strike = useSpringAt(saved === undefined ? undefined : saved + 16, SPRING.soft, 16);
  // Each ticket that lands makes the balance a little less believable.
  const dim = 1 - landed.reduce((sum, p) => sum + p * 0.15, 0);

  return (
    <AbsoluteFill style={{ background: COLORS.ink, opacity: exit }}>
      <BeatCaptions timeline={timeline} act="problem" color={COLORS.white} highlight={COLORS.brand} />

      {/* The balance. */}
      <div style={{ position: 'absolute', left: SAFE.left, top: BALANCE_TOP, width: WIDTH, opacity: balanceIn }}>
        <div style={{ fontFamily: FONTS.sans, fontWeight: 500, fontSize: 40, color: COLORS.inkSoft }}>
          {CONFIG.problem.balanceLabel}
        </div>
        <div style={{ position: 'relative', marginTop: 8, height: 150 }}>
          <div
            style={{
              position: 'absolute',
              fontFamily: FONTS.mono,
              fontWeight: 700,
              fontSize: 124,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              color: COLORS.white,
              whiteSpace: 'nowrap',
              opacity: dim * (1 - question),
            }}
          >
            {ars(STORY.balance * count)}
            {/* Crossed out once all three are in. */}
            <div
              style={{
                position: 'absolute',
                left: -6,
                top: '52%',
                height: 10,
                borderRadius: 5,
                width: `calc((100% + 12px) * ${strike})`,
                opacity: strike > 0 ? 1 : 0,
                background: COLORS.expense,
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              fontFamily: FONTS.mono,
              fontWeight: 700,
              fontSize: 124,
              color: COLORS.white,
              opacity: question,
              transform: `translateY(${(1 - question) * 20}px)`,
            }}
          >
            $ {CONFIG.problem.unknown}
          </div>
        </div>
      </div>

      {/* What is already spoken for. */}
      {TICKETS.map((t, i) => {
        const p = landed[i];
        const top = TICKETS_TOP + i * (TICKET.height + GAP);
        const copy = CONFIG.problem.tickets[t.id];
        return (
          <React.Fragment key={t.id}>
            <Ticket
              label={copy.label}
              detail={copy.detail}
              amount={`− ${ars(t.amount)}`}
              color={t.color}
              width={WIDTH}
              style={{
                // Slides in from the right into its own row, so it never covers the one above.
                left: interpolate(p, [0, 1], [SAFE.left + 260, SAFE.left]),
                top,
                opacity: Math.min(1, p * 1.6),
                transform: `rotate(${(1 - p) * 2}deg)`,
              }}
            />
            {at(t.id) !== undefined ? <Sfx name="tick" at={(at(t.id) ?? 0) + 10} volume={0.8} /> : null}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
