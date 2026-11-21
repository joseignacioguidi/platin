import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { CAPTURES, screen, type ScreenName } from '../captures';
import { COLORS, PHONE, VIDEO } from '../theme';

/** CSS px of the app → video px. */
export const SCALE = PHONE.screenWidth / CAPTURES.viewport.width;
export const SCREEN_HEIGHT = CAPTURES.viewport.height * SCALE;
const OUTER_WIDTH = PHONE.screenWidth + PHONE.bezel * 2;

/** Where the phone sits in the Card, Home and Hide scenes (same place, so they chain). */
export const PHONE_POSITION = {
  left: (VIDEO.width - OUTER_WIDTH) / 2,
  top: 560,
} as const;

/** Top-left corner of the app screen in video px, for a phone offset by (dx, dy). */
export function screenOrigin(dx = 0, dy = 0): { x: number; y: number } {
  return {
    x: PHONE_POSITION.left + PHONE.bezel + dx,
    y: PHONE_POSITION.top + PHONE.bezel + dy,
  };
}

/** The phone frame. Its children are drawn inside the screen, clipped to it. */
export const Phone: React.FC<{ offsetY?: number; children: React.ReactNode }> = ({
  offsetY = 0,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: PHONE_POSITION.left,
      top: PHONE_POSITION.top + offsetY,
      width: OUTER_WIDTH,
      height: SCREEN_HEIGHT + PHONE.bezel * 2,
      borderRadius: PHONE.radius,
      background: COLORS.ink,
      padding: PHONE.bezel,
      boxShadow: '0 40px 90px rgba(24, 24, 24, 0.28)',
    }}
  >
    <div
      style={{
        position: 'relative',
        width: PHONE.screenWidth,
        height: SCREEN_HEIGHT,
        borderRadius: PHONE.radius - PHONE.bezel,
        overflow: 'hidden',
        background: COLORS.white,
      }}
    >
      {children}
    </div>
  </div>
);

/**
 * A real capture of the app: the whole page (scrollable by `scroll`, in CSS px) with the fixed
 * bottom bar on top. `children` are overlays in the page's CSS px coordinates.
 */
export const AppScreen: React.FC<{
  name: ScreenName;
  scroll?: number;
  opacity?: number;
  children?: React.ReactNode;
}> = ({ name, scroll = 0, opacity = 1, children }) => {
  const s = screen(name);
  const barHeight = CAPTURES.viewport.height - s.barTop;
  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CAPTURES.viewport.width,
          height: s.height,
          transformOrigin: '0 0',
          transform: `scale(${SCALE}) translateY(${-scroll}px)`,
        }}
      >
        <Img
          src={staticFile(`captures/${s.file}`)}
          style={{ width: CAPTURES.viewport.width, height: s.height, display: 'block' }}
        />
        {children}
      </div>
      {/* The fixed bottom bar, cropped from the viewport capture. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: PHONE.screenWidth,
          height: barHeight * SCALE,
          overflow: 'hidden',
        }}
      >
        <Img
          src={staticFile(`captures/${s.viewport}`)}
          style={{
            position: 'absolute',
            left: 0,
            top: -s.barTop * SCALE,
            width: PHONE.screenWidth,
            height: SCREEN_HEIGHT,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
