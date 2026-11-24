import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SPRING, VIDEO } from '../theme';

/** 0 → 1 with a calm spring from `at` (0 before it, or when `at` is undefined). */
export function useSpringAt(at: number | undefined, config = SPRING.soft, durationInFrames?: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (at === undefined) return 0;
  return spring({ frame: frame - at, fps, config, durationInFrames });
}

/** Phone entering from below, in video px. */
export function usePhoneOffset(delay: number): number {
  const p = useSpringAt(delay, SPRING.slow);
  return interpolate(p, [0, 1], [1400, 0]);
}

/** A circle of `color` that grows from the center over the previous background. */
export const Wipe: React.FC<{ color: string; delay?: number }> = ({ color, delay = 0 }) => {
  const p = useSpringAt(delay, SPRING.soft, 26);
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
