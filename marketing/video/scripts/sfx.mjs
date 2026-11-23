// Synthesizes the video's sound effects into public/sfx/*.wav: no downloads, no licenses.
// Soft and short, like the brand. Replace any file with your own (same name) if you prefer.
//
//   node scripts/sfx.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const RATE = 44100;
const OUT = new URL('../public/sfx/', import.meta.url);

/** Deterministic noise, so every run writes the same files. */
function noise(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s / 4294967296) * 2 - 1;
  };
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const render = (seconds, fn) => Array.from({ length: Math.round(seconds * RATE) }, (_, i) => fn(i / RATE));

/** Short fade at both ends, so nothing clicks by accident. */
function edges(samples, ms = 3) {
  const n = Math.round((ms / 1000) * RATE);
  for (let i = 0; i < n; i++) {
    samples[i] *= i / n;
    samples[samples.length - 1 - i] *= i / n;
  }
  return samples;
}

// Tick: a soft wooden tap, as a ticket lands.
function tick() {
  const rnd = noise(7);
  return edges(
    render(0.09, (t) => {
      const body = Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 70);
      const grain = rnd() * Math.exp(-t * 300) * 0.25;
      return (body + grain) * 0.45;
    }),
  );
}

// Whoosh: airy noise that swells and fades, with a sweeping low-pass.
function whoosh() {
  const rnd = noise(3);
  const dur = 0.7;
  let low = 0;
  return edges(
    render(dur, (t) => {
      const p = t / dur;
      const cutoff = 300 + 2600 * Math.sin(Math.PI * p); // Hz, up and down
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
      low += a * (rnd() - low);
      const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
      return low * env * 0.9;
    }),
    10,
  );
}

// Click: the switch, two tiny taps.
function click() {
  const tap = (t, f) => (t < 0 ? 0 : Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 260));
  return edges(render(0.08, (t) => (tap(t, 2200) * 0.5 + tap(t - 0.028, 1600) * 0.35) * 0.8));
}

// Pop: a round bubble, rising in pitch.
function pop() {
  let phase = 0;
  return edges(
    render(0.14, (t) => {
      const f = 380 + 620 * Math.min(1, t / 0.07);
      phase += (2 * Math.PI * f) / RATE;
      return Math.sin(phase) * Math.exp(-t * 32) * 0.5;
    }),
  );
}

await mkdir(OUT, { recursive: true });
for (const [name, make] of Object.entries({ tick, whoosh, click, pop })) {
  await writeFile(new URL(`${name}.wav`, OUT), wav(make()));
  console.log(`public/sfx/${name}.wav`);
}
