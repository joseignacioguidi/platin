// Scene lengths in frames (30 fps). The 15 s cut reuses the same scenes.
// Plain TypeScript with no imports: scripts/voiceover.mjs also loads it with Node.
export const FPS = 30;

export const DURATION = {
  hook: 90, // 0–3 s
  pause: 60, // 3–5 s
  tickets: 210, // 5–12 s: rain (5–9 s) and overflow (9–12 s)
  card: 240, // 12–20 s
  home: 120, // 20–24 s
  hide: 60, // 24–26 s
  closing: 120, // 26–30 s
} as const;

/** Inside the tickets scene, when the rain ends and the overflow begins. */
export const RAIN_FRAMES = 120;

export type SceneId = keyof typeof DURATION;
export type CutId = '30' | '15';

export const CUTS: Record<CutId, SceneId[]> = {
  '30': ['hook', 'pause', 'tickets', 'card', 'home', 'hide', 'closing'],
  '15': ['hook', 'card', 'closing'],
};

export const totalFrames = (cut: CutId): number =>
  CUTS[cut].reduce((sum, id) => sum + DURATION[id], 0);

/** First frame of a scene within a cut. */
export function sceneStart(cut: CutId, scene: SceneId): number {
  let frame = 0;
  for (const id of CUTS[cut]) {
    if (id === scene) return frame;
    frame += DURATION[id];
  }
  throw new Error(`Scene ${scene} is not in the ${cut} s cut`);
}
