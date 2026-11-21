// Scene lengths in frames (30 fps). The 15 s cut reuses the same scenes.
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

export const CUT_30: SceneId[] = ['hook', 'pause', 'tickets', 'card', 'home', 'hide', 'closing'];
export const CUT_15: SceneId[] = ['hook', 'card', 'closing'];

export const totalFrames = (cut: SceneId[]): number =>
  cut.reduce((sum, id) => sum + DURATION[id], 0);
