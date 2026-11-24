// The story's amounts, from the demo data (scripts/seed-demo.mjs writes story.json and checks
// that balance − card − fixed − saved = free, the home's "Te quedan para gastar").
import story from '../public/captures/story.json';

export const STORY = story as {
  today: string;
  balance: number;
  card: number;
  fixed: number;
  saved: number;
  free: number;
  perDay: number;
};

/** "$ 1.721.800" (ARS, no decimals, as the app shows whole amounts). */
export const ars = (n: number): string => `$ ${Math.round(n).toLocaleString('es-AR')}`;
