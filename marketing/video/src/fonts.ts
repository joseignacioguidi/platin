// Local fonts (public/fonts): Uncut Sans for text, JetBrains Mono for amounts and dates.
import { continueRender, delayRender, staticFile } from 'remotion';

const FACES: { family: string; file: string; weight: string }[] = [
  { family: 'Uncut Sans', file: 'uncut-sans-latin-400-normal.woff2', weight: '400' },
  { family: 'Uncut Sans', file: 'uncut-sans-latin-500-normal.woff2', weight: '500' },
  { family: 'Uncut Sans', file: 'uncut-sans-latin-600-normal.woff2', weight: '600' },
  { family: 'Uncut Sans', file: 'uncut-sans-latin-700-normal.woff2', weight: '700' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-wght-normal.woff2', weight: '100 800' },
];

let loaded = false;

export function loadFonts(): void {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('Loading fonts');
  Promise.all(
    FACES.map(async ({ family, file, weight }) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, {
        weight,
        style: 'normal',
      });
      document.fonts.add(await face.load());
    }),
  )
    .then(() => continueRender(handle))
    .catch((err: unknown) => {
      console.error(err);
      continueRender(handle);
    });
}
