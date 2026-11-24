// Typed access to public/captures/meta.json (written by scripts/capture.mjs).
import meta from '../public/captures/meta.json';

export type Box = { x: number; y: number; width: number; height: number };

export type Rounded = Box & { radius: number; background: string };

export type Screen = {
  file: string;
  viewport: string;
  height: number;
  barTop: number;
  boxes: Record<string, Box | null>;
  headline?: Box & {
    text: string;
    fontSize: number;
    fontWeight: string;
    letterSpacing: string;
    color: string;
    background: string;
  };
  chart?: Box & { background: string };
  /** Rounded containers: the "por día" pill, the free card, the trip goal. */
  perDay?: Rounded;
  freeCard?: Rounded;
  goal?: Rounded;
  bars?: (Box & { label: string })[];
};

export type ScreenName = 'inicio' | 'tarjeta-cuotas' | 'metas';

export const CAPTURES = meta as unknown as {
  viewport: { width: number; height: number };
  scale: number;
  screens: Record<ScreenName, Screen>;
};

export const screen = (name: ScreenName): Screen => CAPTURES.screens[name];
