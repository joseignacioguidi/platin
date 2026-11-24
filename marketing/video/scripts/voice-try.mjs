// Voice A/B test: the lines where the mood turns (problem → solution), in a few variants, into
// out/pruebas-voz/ to listen side by side. It does not touch public/voice/ (the video's voice).
//
//   node scripts/voice-try.mjs                          tone variants of the .env voice
//   node scripts/voice-try.mjs --voices id1,id2,id3     the same two lines with other voices
//                                                       (current settings, to compare timbres)
//
// Same .env as scripts/voiceover.mjs. Each variant costs about 60 characters.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { CONFIG } = await import('../src/config.ts');

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('out/pruebas-voz/', ROOT);

for (const line of readFileSync(fileURLToPath(new URL('.env', ROOT)), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
if (!API_KEY || !VOICE_ID) throw new Error('Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID (.env)');

/** The two lines where the tone changes, from the 30 s cut. */
const LINES = [
  { id: 'pregunta', index: 4, mood: 'frustrated' },
  { id: 'solucion', index: 5, mood: 'relieved' },
].map((l) => ({ ...l, text: CONFIG.beats['30'][l.index].voice }));

const VARIANTS = [
  {
    id: 'A-expresiva',
    model: 'eleven_multilingual_v2',
    settings: { stability: 0.35, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true, speed: CONFIG.audio.voiceSpeed },
    text: (l) => l.text,
  },
  {
    // eleven_v3 reads audio tags in brackets; its stability takes 0 (creative), 0.5 or 1.
    id: 'B-v3-con-tono',
    model: 'eleven_v3',
    settings: { stability: 0.5, similarity_boost: 0.75, speed: CONFIG.audio.voiceSpeed },
    text: (l) => `[${l.mood}] ${l.text}`,
  },
];

const args = process.argv.slice(2);
const voices = args.includes('--voices') ? args[args.indexOf('--voices') + 1].split(',').filter(Boolean) : [];

async function speak(text, model, settings, voiceId = VOICE_ID) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(OUT, { recursive: true });
try {
  for (const l of LINES) {
    // The current take, to compare against.
    const current = new URL(`public/voice/30-${String(l.index + 1).padStart(2, '0')}.mp3`, ROOT);
    if (existsSync(current)) await copyFile(current, new URL(`${l.id}-0-actual.mp3`, OUT));
    // Other voices, with the video's settings: only the timbre changes.
    for (const id of voices) {
      const name = `${l.id}-voz-${id}.mp3`;
      const settings = { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: CONFIG.audio.voiceSpeed };
      await writeFile(new URL(name, OUT), await speak(l.text, 'eleven_multilingual_v2', settings, id));
      console.log(`out/pruebas-voz/${name}  "${l.text}"`);
    }
    if (voices.length) continue;
    for (const [n, v] of VARIANTS.entries()) {
      const name = `${l.id}-${n + 1}-${v.id}.mp3`;
      await writeFile(new URL(name, OUT), await speak(v.text(l), v.model, v.settings));
      console.log(`out/pruebas-voz/${name}  "${v.text(l)}"`);
    }
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
}
