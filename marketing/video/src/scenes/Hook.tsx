import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { WordReveal, useEnter, useExit } from '../components/Text';
import { CONFIG } from '../config';
import { COLORS, FONTS, SAFE, SPRING, VIDEO } from '../theme';

const QUESTION_SIZE = 108;
/** Vertical position of the question while it is the only thing on screen. */
const QUESTION_TOP = 640;
/** Where it rests during the pause, to leave room for the answer. */
export const QUESTION_LIFTED_TOP = SAFE.top + 90;

/** The question, with its words already revealed (`delay` < 0) or revealing. */
export const Question: React.FC<{ delay?: number; top: number; dim?: number }> = ({
  delay = 6,
  top,
  dim = 0,
}) => (
  <div
    style={{
      position: 'absolute',
      left: SAFE.left,
      width: VIDEO.width - SAFE.left - SAFE.right,
      top,
      opacity: 1 - dim * 0.55,
    }}
  >
    <WordReveal
      text={CONFIG.hook.question}
      delay={delay}
      stagger={6}
      fontSize={QUESTION_SIZE}
      color={COLORS.white}
      highlight={COLORS.brand}
    />
  </div>
);

/** 0–3 s: ink background, the question word by word. `exit` fades it out (15 s cut). */
export const Hook: React.FC<{ duration: number; exit: boolean }> = ({ duration, exit }) => {
  const fade = useExit(duration, 10);
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <div style={{ opacity: exit ? fade : 1 }}>
        <Question top={QUESTION_TOP} />
      </div>
    </AbsoluteFill>
  );
};

/** 3–5 s: the question goes up, a caret blinks, "…" and then the answer. */
export const Pause: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const lift = useEnter(0, SPRING.slow);
  const top = interpolate(lift, [0, 1], [QUESTION_TOP, QUESTION_LIFTED_TOP]);
  const answer = useEnter(32, SPRING.soft);
  const exit = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Caret: on for 8 frames, off for 8, until the answer shows.
  const caretOn = Math.floor(frame / 8) % 2 === 0 && frame < 32;
  const dots = frame >= 14 && frame < 32 ? CONFIG.pause.dots : '';

  return (
    <AbsoluteFill style={{ background: COLORS.ink, opacity: exit }}>
      <Question delay={-1000} top={top} dim={answer} />
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: 1080,
          height: 130,
          display: 'flex',
          alignItems: 'center',
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: 100,
          color: COLORS.white,
          letterSpacing: '-0.02em',
        }}
      >
        {frame < 32 ? (
          <>
            <span>{dots}</span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 104,
                marginLeft: 10,
                background: COLORS.brand,
                opacity: caretOn ? 1 : 0,
              }}
            />
          </>
        ) : (
          <span style={{ opacity: answer, transform: `translateY(${(1 - answer) * 30}px)` }}>
            {CONFIG.pause.answer}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
