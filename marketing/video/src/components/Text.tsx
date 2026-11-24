import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, SAFE, SPRING, VIDEO } from '../theme';

/** 0 → 1 with a calm spring, starting at `delay`. */
export function useEnter(delay = 0, config = SPRING.soft, durationInFrames?: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config, durationInFrames });
}

/** 1 → 0 over the last `frames` frames of a scene of `duration` frames. */
export function useExit(duration: number, frames = 10): number {
  const frame = useCurrentFrame();
  return interpolate(frame, [duration - frames, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Splits "a *b c* d" into words, marking the ones between asterisks. */
export function parseHighlights(text: string): { word: string; hi: boolean }[] {
  const out: { word: string; hi: boolean }[] = [];
  let hi = false;
  // Plain spaces only: a non-breaking space (config) keeps two words on the same line.
  for (const raw of text.split(/[ \t\n]+/)) {
    let word = raw;
    const opens = word.startsWith('*');
    if (opens) {
      hi = true;
      word = word.slice(1);
    }
    const closes = word.endsWith('*');
    if (closes) word = word.slice(0, -1);
    out.push({ word, hi });
    if (closes) hi = false;
  }
  return out;
}

/** Words that rise and fade in one after another. */
export const WordReveal: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  fontSize: number;
  color: string;
  highlight: string;
  weight?: number;
  align?: 'left' | 'center';
}> = ({ text, delay = 0, stagger = 5, fontSize, color, highlight, weight = 600, align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = parseHighlights(text);
  return (
    <div
      style={{
        fontFamily: FONTS.sans,
        fontWeight: weight,
        fontSize,
        lineHeight: 1.12,
        letterSpacing: '-0.02em',
        textAlign: align,
        color,
      }}
    >
      {words.map(({ word, hi }, i) => {
        const p = spring({ frame: frame - delay - i * stagger, fps, config: SPRING.soft });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: '0.26em',
              opacity: p,
              transform: `translateY(${(1 - p) * 0.4}em)`,
              color: hi ? highlight : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** A scene caption inside the safe area: fades and rises in, fades out at the end. */
export const Caption: React.FC<{
  text: string;
  top?: number;
  delay?: number;
  duration: number;
  exit?: boolean;
  color?: string;
  highlight?: string;
  fontSize?: number;
  align?: 'left' | 'center';
}> = ({
  text,
  top = SAFE.top + 20,
  delay = 0,
  duration,
  exit = true,
  color = COLORS.ink,
  highlight = COLORS.white,
  fontSize = 66,
  align = 'left',
}) => {
  const fade = useExit(duration, 8);
  const out = exit ? fade : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.left,
        width: VIDEO.width - SAFE.left - SAFE.right,
        top,
        opacity: out,
      }}
    >
      <WordReveal
        text={text}
        delay={delay}
        stagger={3}
        fontSize={fontSize}
        color={color}
        highlight={highlight}
        align={align}
      />
    </div>
  );
};
