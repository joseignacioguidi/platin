// Captures the REAL platin screens for the video, from a local app with the demo data
// (run seed-demo.mjs first). Writes public/captures/*.png and public/captures/meta.json
// with the boxes of the elements the video animates over.
//
//   node scripts/capture.mjs              (web at http://localhost:4200)
//   WEB_URL=http://localhost:4200 node scripts/capture.mjs
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO } from './demo-user.mjs';

const WEB = process.env.WEB_URL ?? 'http://localhost:4200';
const OUT = fileURLToPath(new URL('../public/captures/', import.meta.url));
const VIEWPORT = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const meta = { viewport: VIEWPORT, scale: 3, screens: {} };

async function settle() {
  await page.waitForLoadState('networkidle');
  // Fonts and the skeletons' fade-out.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

/** Box (CSS px, page coordinates) of the first element matching a locator, or null. */
async function box(locator) {
  const el = locator.first();
  if ((await el.count()) === 0) return null;
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  const b = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  return b;
}

/**
 * Two images per screen: `<name>-viewport.png` (what the phone shows, with the fixed bottom bar)
 * and `<name>.png`, the whole page without fixed elements, so the video can scroll it and lay the
 * bottom bar (cropped from the viewport image, from `barTop`) over it.
 */
async function shot(name, boxes = {}, extra = async () => ({})) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle();
  const resolved = {};
  for (const [key, locator] of Object.entries(boxes)) resolved[key] = await box(locator);
  const more = await extra();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  await page.screenshot({ path: join(OUT, `${name}-viewport.png`) });
  const barTop = await page.evaluate((vh) => {
    const tops = [...document.querySelectorAll('body *')]
      .filter((el) => getComputedStyle(el).position === 'fixed')
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.top > vh / 2 && r.bottom >= vh - 1)
      .map((r) => r.top);
    return tops.length ? Math.min(...tops) : vh;
  }, VIEWPORT.height);

  await page.addStyleTag({ content: '[data-video-hidden]{visibility:hidden!important}' });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).position === 'fixed') el.setAttribute('data-video-hidden', '');
    }
  });
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-video-hidden]')) {
      el.removeAttribute('data-video-hidden');
    }
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  meta.screens[name] = { file, viewport: `${name}-viewport.png`, height, barTop, boxes: resolved, ...more };
  console.log('captured', file);
}

/** The biggest money amount on screen (the home's headline number): box, text and styles. */
function headlineAmount() {
  return page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll('body *')) {
      const text = el.textContent?.trim() ?? '';
      if (el.children.length > 2 || !/^\$\s?[\d.,]+$/.test(text)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (!best || size > best.size) best = { el, size, text };
    }
    if (!best) return {};
    const r = best.el.getBoundingClientRect();
    return {
      headline: {
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
        text: best.text,
        fontSize: best.size,
        fontWeight: getComputedStyle(best.el).fontWeight,
        letterSpacing: getComputedStyle(best.el).letterSpacing,
        color: getComputedStyle(best.el).color,
        background: (() => {
          for (let n = best.el; n; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
          }
          return 'rgb(255, 255, 255)';
        })(),
      },
    };
  });
}

/** The "Cuotas por resumen" card and its bars (each bar is a button). */
function installmentsChart() {
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll('body *')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Cuotas por resumen',
    );
    if (!heading) return {};
    let card = heading;
    while (card.parentElement && card.getBoundingClientRect().height < 150) card = card.parentElement;
    const abs = (r) => ({ x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height });
    const bars = [...card.querySelectorAll('button')]
      .map((b) => ({ label: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '', ...abs(b.getBoundingClientRect()) }))
      .filter((b) => b.height > 60);
    const background = getComputedStyle(card).backgroundColor;
    return { chart: { ...abs(card.getBoundingClientRect()), background }, bars };
  });
}

// Sign in through the real login form.
await page.addInitScript(() => localStorage.setItem('platin.hideAmounts', 'false'));
await page.goto(`${WEB}/ingresar`);
await settle();
await page.locator('input[autocomplete="email"]').fill(DEMO.email);
await page.locator('input[autocomplete="current-password"]').fill(DEMO.password);
await page.locator('button[type="submit"]').click();
await page.waitForURL(/\/app/);

// Home.
await page.goto(`${WEB}/app`);
await shot('inicio', { toggle: page.getByRole('button', { name: /ocultar montos/i }) }, headlineAmount);

// Card, "Cuotas" tab.
await page.goto(`${WEB}/app/tarjetas`);
await settle();
await page.getByText('Visa Galicia').first().click();
await page.waitForURL(/\/app\/tarjetas\/[0-9a-f-]+/);
await settle();
await page.getByRole('radio', { name: 'Cuotas' }).or(page.getByRole('button', { name: 'Cuotas' })).first().click();
await shot('tarjeta-cuotas', {}, installmentsChart);

// Commitments and goals.
await page.goto(`${WEB}/app/compromisos`);
await shot('compromisos');
await page.goto(`${WEB}/app/ahorros`);
await shot('metas');

// Home again with "ocultar montos" on.
await page.addInitScript(() => localStorage.setItem('platin.hideAmounts', 'true'));
await page.goto(`${WEB}/app`);
await shot('inicio-oculto', {}, headlineAmount);

await writeFile(join(OUT, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
await browser.close();
