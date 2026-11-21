// platin's visual identity for the video: the ONLY place with colors, fonts and layout constants.
import type { SpringConfig } from 'remotion';

export const COLORS = {
  brand: '#00B99A',
  brandStrong: '#007A65',
  ink: '#181818',
  muted: '#6D6D6D',
  expense: '#FE8363',
  pending: '#F9C558',
  transfer: '#0590CB',
  card: '#8B7FFF',
  savings: '#7DE2F2',
  white: '#FFFFFF',
  /** Soft text on the ink background. */
  inkSoft: '#9A9A9A',
} as const;

export const FONTS = {
  sans: '"Uncut Sans", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

/**
 * Reels / Shorts safe area: nothing important in the top and bottom 250 px, and room on the
 * right for the platform's buttons.
 */
export const SAFE = { top: 250, bottom: 250, left: 90, right: 130 } as const;

/** Calm springs: no bounce, no overshoot. */
export const SPRING: Record<'soft' | 'gentle' | 'slow', Partial<SpringConfig>> = {
  soft: { damping: 200, mass: 0.8 },
  gentle: { damping: 26, stiffness: 90, mass: 1 },
  slow: { damping: 200, mass: 2 },
};

/** The phone mockup: the app screen is 390 CSS px wide. */
export const PHONE = {
  screenWidth: 600,
  bezel: 18,
  radius: 72,
} as const;
