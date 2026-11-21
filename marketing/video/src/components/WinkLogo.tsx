import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../theme';

/**
 * The platin wink face alone, the peso sign with eyes (docs/brand/glifo-guino.svg), in ink.
 * At rest both eyes are open; from `winkAt` it winks once and opens again, frame by frame,
 * with the same keyframes as `pl-wink` in libs/web-ui (its 1.4 s "once" animation).
 */

/** Length of one wink, as in pl-wink's `pl-eye-*-once` (1.4 s). */
export const WINK_FRAMES = 42;

const EASE_IN = Easing.in(Easing.ease);
const DRAW = Easing.bezier(0.3, 0, 0.2, 1);
/** pl-wink's springy `cubic-bezier(0.2, 1.6, 0.4, 1)`. */
const BOUNCE = Easing.bezier(0.2, 1.6, 0.4, 1);

/** Keyframe percentages of pl-wink's "once" animation → frames. */
const at = (percent: number): number => (percent / 100) * WINK_FRAMES;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function openEye(t: number): { opacity: number; scaleY: number } {
  if (t <= 0 || t >= WINK_FRAMES) return { opacity: 1, scaleY: 1 };
  if (t < at(13.6)) {
    return { opacity: 1, scaleY: interpolate(t, [0, at(13.6)], [1, 0.12], { ...clamp, easing: EASE_IN }) };
  }
  if (t < at(18.2)) {
    return { opacity: interpolate(t, [at(13.6), at(18.2)], [1, 0], clamp), scaleY: 0.12 };
  }
  if (t < at(77.3)) return { opacity: 0, scaleY: 0.12 };
  if (t < at(81.8)) {
    return { opacity: interpolate(t, [at(77.3), at(81.8)], [0, 1], clamp), scaleY: 0.12 };
  }
  return {
    opacity: 1,
    scaleY: interpolate(t, [at(81.8), WINK_FRAMES], [0.12, 1], { ...clamp, easing: BOUNCE }),
  };
}

function winkLine(t: number): { opacity: number; dash: number; rotate: number } {
  if (t < at(11.4) || t >= at(84.1)) return { opacity: 0, dash: 1, rotate: 0 };
  const opacity =
    t < at(13.6)
      ? interpolate(t, [at(11.4), at(13.6)], [0, 1], clamp)
      : t > at(81.8)
        ? interpolate(t, [at(81.8), at(84.1)], [1, 0], clamp)
        : 1;
  let dash: number;
  let rotate: number;
  if (t < at(31.8)) {
    dash = interpolate(t, [at(13.6), at(31.8)], [1, 0], { ...clamp, easing: DRAW });
    rotate = interpolate(t, [at(13.6), at(31.8)], [0, -10], { ...clamp, easing: DRAW });
  } else if (t < at(47.7)) {
    dash = 0;
    rotate = interpolate(t, [at(31.8), at(47.7)], [-10, 0], { ...clamp, easing: BOUNCE });
  } else if (t < at(72.7)) {
    dash = 0;
    rotate = 0;
  } else {
    dash = interpolate(t, [at(72.7), at(81.8)], [0, 1], clamp);
    rotate = 0;
  }
  return { opacity, dash, rotate };
}

/** Center of the open right eye and of the wink stroke, to scale and rotate around them. */
const EYE = { cx: 662, cy: 372 };
const WINK_CENTER = { cx: 669, cy: 358 };

/** The glyph's box in the brand SVG: 524 × 638. */
const VIEW = { x: 252, y: 270, width: 524, height: 638 };

export const WinkLogo: React.FC<{ height: number; winkAt: number; style?: React.CSSProperties }> = ({
  height,
  winkAt,
  style,
}) => {
  const frame = useCurrentFrame();
  const t = frame - winkAt;
  const eye = openEye(t);
  const wink = winkLine(t);
  return (
    <svg
      width={(height * VIEW.width) / VIEW.height}
      height={height}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
      style={{ overflow: 'visible', ...style }}
      aria-hidden="true"
    >
      <g fill="none" stroke={COLORS.ink} strokeLinecap="round" strokeLinejoin="round">
        <path
          strokeWidth="96"
          d="M612 548 C584 512 540 494 488 494 C416 494 366 526 366 572 C366 620 416 636 488 648 C560 660 612 680 612 726 C612 772 560 804 488 804 C434 804 388 786 360 750"
        />
        <path strokeWidth="88" d="M488 418 V494 M488 804 V858" />
        {/* The wink: a bit smaller than in the static glyph, as in pl-wink. */}
        <path
          strokeWidth="60"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={wink.dash}
          opacity={wink.opacity}
          transform={`translate(${WINK_CENTER.cx} ${WINK_CENTER.cy}) rotate(${wink.rotate}) scale(0.82) translate(${-WINK_CENTER.cx} ${-WINK_CENTER.cy})`}
          d="M596 386 Q648 322 742 338"
        />
      </g>
      <circle cx="314" cy="372" r="54" fill={COLORS.ink} />
      <circle
        cx={EYE.cx}
        cy={EYE.cy}
        r="54"
        fill={COLORS.ink}
        opacity={eye.opacity}
        transform={`translate(${EYE.cx} ${EYE.cy}) scale(1 ${eye.scaleY}) translate(${-EYE.cx} ${-EYE.cy})`}
      />
    </svg>
  );
};
