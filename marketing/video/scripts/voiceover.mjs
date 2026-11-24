// Generates the voiceover with ElevenLabs: one MP3 per beat of CONFIG.beats (src/config.ts),
// in public/voice/<cut>-<n>.mp3. The video times each beat by its line, so it always fits.
//
//   node scripts/voiceover.mjs                all lines of both cuts (skips unchanged ones)
//   node scripts/voiceover.mjs --cut 30       only the 30 s cut
//   node scripts/voiceover.mjs --only 30-07   a single line, to try the voice or the speed
//   node scripts/voiceover.mjs --force        regenerate, even if nothing changed
//   node scripts/voiceover.mjs --dry          no requests: estimated timing of each cut
//
// Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in marketing/video/.env (see .env.example).
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Node strips the types of these two plain-TypeScript files.
const { CONFIG } = await import('../src/config.ts');
const { FPS, TARGET, buildTimeline } = await import('../src/timeline.ts');

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

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dry = flag('--dry');
const force = flag('--force');
const only = option('--only');
const cuts = option('--cut') ? [option('--cut')] : Object.keys(CONFIG.beats);

const VOICE_ID = dry ? '' : env('ELEVENLABS_VOICE_ID');
const MODEL = env('ELEVENLABS_MODEL', 'eleven_multilingual_v2');
const LANGUAGE = env('ELEVENLABS_LANGUAGE', '');
const SETTINGS = {
  stability: Number(env('ELEVENLABS_STABILITY', '0.5')),
  similarity_boost: Number(env('ELEVENLABS_SIMILARITY', '0.75')),
  style: Number(env('ELEVENLABS_STYLE', '0.15')),
  use_speaker_boost: true,
  // The pace belongs to the video's design, so it lives in src/config.ts.
  speed: CONFIG.audio.voiceSpeed,
};

// --- Generation -----------------------------------------------------------------------------

/** The audio and when each word starts (the video anchors animations to words). */
async function speak(text, previous, next, settings) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': env('ELEVENLABS_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: settings,
        // Neighbouring lines give the voice a continuous intonation.
        previous_text: previous,
        next_text: next,
        ...(LANGUAGE ? { language_code: LANGUAGE } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { audio: Buffer.from(data.audio_base64, 'base64'), words: wordTimes(data.alignment) };
}

/** Characters with their start times → words with theirs. */
function wordTimes(alignment) {
  const words = [];
  let word = '';
  let start = 0;
  alignment?.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (word) words.push({ word, start: Number(start.toFixed(3)) });
      word = '';
      return;
    }
    if (!word) start = alignment.character_start_times_seconds[i];
    word += ch;
  });
  if (word) words.push({ word, start: Number(start.toFixed(3)) });
  return words;
}

const fileName = (cut, i) => `${cut}-${String(i + 1).padStart(2, '0')}.mp3`;
const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : {};
await mkdir(OUT, { recursive: true });

// Errors (an invalid key, a voice the plan does not allow) end with their message only; the
// lines already generated are kept in the manifest.
try {
  for (const cut of cuts) {
    const beats = CONFIG.beats[cut];
    if (!beats) throw new Error(`Unknown cut ${cut} (30 or 15)`);
    console.log(`\n${cut} s cut`);

    for (const [i, beat] of beats.entries()) {
      const name = fileName(cut, i);
      if (only && only !== name.replace('.mp3', '')) continue;
      const file = new URL(name, OUT);
      const settings = { ...SETTINGS, speed: beat.voiceSpeed ?? SETTINGS.speed };
      const key = { text: beat.voice, voice: VOICE_ID, model: MODEL, settings, language: LANGUAGE };
      // Lines with word-anchored animations need the word timings too.
      const needsWords = Object.values(beat.events).some((at) => typeof at === 'string');
      const current =
        existsSync(file) &&
        JSON.stringify(manifest[name]?.key) === JSON.stringify(key) &&
        (!needsWords || Boolean(manifest[name]?.words));

      if (dry) {
        const state = manifest[name]?.key?.text === beat.voice ? `${manifest[name].seconds} s` : 'estimated';
        console.log(`  ${name}  ${state.padEnd(10)}  "${beat.voice}"`);
        continue;
      }
      let audio;
      let words = manifest[name]?.words;
      if (current && !force) {
        audio = await readFile(file);
      } else {
        ({ audio, words } = await speak(beat.voice, beats[i - 1]?.voice, beats[i + 1]?.voice, settings));
        await writeFile(file, audio);
      }
      // Constant bitrate: the length follows from the size.
      const seconds = Number(((audio.length * 8) / BITRATE).toFixed(2));
      manifest[name] = { key, seconds, ...(words ? { words } : {}) };
      console.log(`  ${name}  ${seconds.toFixed(2)} s${current && !force ? ' (unchanged)' : ''}  "${beat.voice}"`);
    }

    // The timing the video will use: real lengths where the text matches, estimates elsewhere.
    const entry = (i) => {
      const e = manifest[fileName(cut, i)];
      return e && e.key.text === beats[i].voice ? e : undefined;
    };
    const timeline = buildTimeline(cut, beats, (i) => entry(i)?.seconds, (i) => entry(i)?.words);
    const total = (timeline.total / FPS).toFixed(1);
    console.log(
      timeline.over > 0
        ? `  !! ${total} s: ${(timeline.over / FPS).toFixed(1)} s over the ${TARGET[cut] / FPS} s target. Shorten a line or raise voiceSpeed (src/config.ts).`
        : `  ok ${total} s (the closing stretches to fill ${TARGET[cut] / FPS} s)`,
    );
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
}

if (!dry) await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
