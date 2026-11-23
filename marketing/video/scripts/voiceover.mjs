// Generates the voiceover with ElevenLabs: one MP3 per line of CONFIG.voice (src/config.ts),
// in public/voice/<cut>-<n>.mp3. The video places each line at its scene's frame.
//
//   node scripts/voiceover.mjs              all lines of both cuts (skips unchanged ones)
//   node scripts/voiceover.mjs --cut 30     only the 30 s cut
//   node scripts/voiceover.mjs --force      regenerate everything
//
// Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in marketing/video/.env (see .env.example).
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Node strips the types of these two plain-TypeScript files.
const { CONFIG } = await import('../src/config.ts');
const { CUTS, DURATION, FPS, sceneStart, totalFrames } = await import('../src/timeline.ts');

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/voice/', ROOT);
const MANIFEST = new URL('manifest.json', OUT);
const BITRATE = 128_000; // output_format below

// --- Settings -------------------------------------------------------------------------------

function loadEnv() {
  const file = fileURLToPath(new URL('.env', ROOT));
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const env = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback === undefined) throw new Error(`Missing ${name} (marketing/video/.env)`);
    return fallback;
  }
  return value;
};

const API_KEY = env('ELEVENLABS_API_KEY');
const VOICE_ID = env('ELEVENLABS_VOICE_ID');
const MODEL = env('ELEVENLABS_MODEL', 'eleven_multilingual_v2');
const LANGUAGE = env('ELEVENLABS_LANGUAGE', '');
const SETTINGS = {
  stability: Number(env('ELEVENLABS_STABILITY', '0.5')),
  similarity_boost: Number(env('ELEVENLABS_SIMILARITY', '0.75')),
  style: Number(env('ELEVENLABS_STYLE', '0.15')),
  use_speaker_boost: true,
  speed: Number(env('ELEVENLABS_SPEED', '1')),
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const cutArg = args.includes('--cut') ? args[args.indexOf('--cut') + 1] : undefined;
const cuts = cutArg ? [cutArg] : Object.keys(CUTS);

// --- Generation -----------------------------------------------------------------------------

async function speak(text, previous, next) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: SETTINGS,
        // Neighbouring lines give the voice a continuous intonation.
        previous_text: previous,
        next_text: next,
        ...(LANGUAGE ? { language_code: LANGUAGE } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const seconds = (frames) => frames / FPS;
const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : {};
await mkdir(OUT, { recursive: true });
let warnings = 0;

// Errors (an invalid key, a voice the plan does not allow) end with their message only; the
// lines already generated are kept in the manifest.
try {
  for (const cut of cuts) {
    if (!CUTS[cut]) throw new Error(`Unknown cut ${cut} (30 or 15)`);
    const lines = CONFIG.voice[cut];
    const starts = lines.map((l) => sceneStart(cut, l.scene) + l.at);
    console.log(`\n${cut} s cut`);

    for (const [i, line] of lines.entries()) {
      const name = `${cut}-${String(i + 1).padStart(2, '0')}.mp3`;
      const file = new URL(name, OUT);
      const key = { text: line.text, voice: VOICE_ID, model: MODEL, settings: SETTINGS, language: LANGUAGE };
      const unchanged = existsSync(file) && JSON.stringify(manifest[name]?.key) === JSON.stringify(key);

      let audio;
      if (unchanged && !force) {
        audio = await readFile(file);
      } else {
        audio = await speak(line.text, lines[i - 1]?.text, lines[i + 1]?.text);
        await writeFile(file, audio);
      }
      // Constant bitrate: the length follows from the size.
      const length = (audio.length * 8) / BITRATE;
      manifest[name] = { key, seconds: Number(length.toFixed(2)) };

      // Room until the next line (or the end of the cut).
      const end = i + 1 < lines.length ? starts[i + 1] : totalFrames(cut);
      const room = seconds(end - starts[i]);
      const fits = length <= room - 0.1;
      if (!fits) warnings++;
      console.log(
        `${fits ? '  ok ' : '  !! '}${name}  ${length.toFixed(2)} s of ${room.toFixed(2)} s` +
          `${unchanged && !force ? ' (unchanged)' : ''}  "${line.text}"`,
      );
    }
  }
} catch (err) {
  console.error(`
${err.message}`);
  process.exitCode = 1;
}

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
if (warnings) {
  console.log(
    `\n${warnings} line(s) longer than their room: shorten the text, raise ELEVENLABS_SPEED ` +
      `(up to 1.2) or move "at" in src/config.ts. Scene lengths: src/timeline.ts (${Object.keys(DURATION).join(', ')}).`,
  );
}
