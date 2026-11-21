// Typed access to public/captures/meta.json (written by scripts/capture.mjs).
import meta from '../public/captures/meta.json';

export type Box = { x: number; y: number; width: number; height: number };

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
  bars?: (Box & { label: string })[];
};

export type ScreenName = 'inicio' | 'inicio-oculto' | 'tarjeta-cuotas' | 'compromisos' | 'metas';

export const CAPTURES = meta as unknown as {
  viewport: { width: number; height: number };
  scale: number;
  screens: Record<ScreenName, Screen>;
};

export const screen = (name: ScreenName): Screen => CAPTURES.screens[name];
