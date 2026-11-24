// Generates the music with ElevenLabs Music: one instrumental track per cut, in sections that last
// exactly as long as the video's acts (problem → turn → solution → closing), so the change of mood
// lands on "Platín hace esa cuenta por vos". Output: public/music-<cut>.mp3.
//
//   node scripts/music.mjs              both cuts (skips a cut whose plan did not change)
//   node scripts/music.mjs --cut 30     one cut
//   node scripts/music.mjs --force      generate again (another take)
//   node scripts/music.mjs --dry        print the plans, no requests
//
// Run it after `pnpm voiceover`: the acts' lengths come from the voice. About 900 credits per
// minute of music (both cuts: ~700). Needs the Music permission on the API key.
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { CONFIG } = await import('../src/config.ts');
const { FPS, buildTimeline } = await import('../src/timeline.ts');

const ROOT = new URL('../', import.meta.url);
const PUBLIC = new URL('public/', ROOT);
const PLANS = new URL('music-plans.json', PUBLIC);

for (const line of readFileSync(fileURLToPath(new URL('.env', ROOT)), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const cuts = args.includes('--cut') ? [args[args.indexOf('--cut') + 1]] : Object.keys(CONFIG.beats);

// The voice's real lengths, as the video uses them.
const voice = JSON.parse(await readFile(new URL('voice/manifest.json', PUBLIC), 'utf8'));
const timelineOf = (cut) => {
  const beats = CONFIG.beats[cut];
  const entry = (i) => {
    const e = voice[`${cut}-${String(i + 1).padStart(2, '0')}.mp3`];
    return e && e.key.text === beats[i].voice ? e : undefined;
  };
  return buildTimeline(cut, beats, (i) => entry(i)?.seconds, (i) => entry(i)?.words);
};

/** The music brief: one style for the whole piece, and one per act. */
const STYLE = CONFIG.music;

function planFor(cut) {
  const t = timelineOf(cut);
  const ms = (frames) => Math.round((frames / FPS) * 1000);
  const sections = ['problem', 'solution', 'closing']
    .filter((act) => t.acts[act])
    .map((act) => ({
      section_name: STYLE.sections[act].name,
      positive_local_styles: STYLE.sections[act].positive,
      negative_local_styles: STYLE.sections[act].negative,
      duration_ms: ms(t.acts[act].frames),
      lines: [],
    }));
  return {
    positive_global_styles: STYLE.positive,
    negative_global_styles: STYLE.negative,
    sections,
  };
}

async function compose(plan) {
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' },
    // No lyrics in any section and "vocals" excluded: instrumental (force_instrumental is only for prompts).
    body: JSON.stringify({ composition_plan: plan, model_id: 'music_v1' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const plans = existsSync(PLANS) ? JSON.parse(await readFile(PLANS, 'utf8')) : {};
try {
  for (const cut of cuts) {
    const plan = planFor(cut);
    const file = new URL(`music-${cut}.mp3`, PUBLIC);
    const summary = plan.sections.map((s) => `${s.section_name} ${(s.duration_ms / 1000).toFixed(1)} s`).join(' → ');
    if (dry) {
      console.log(`${cut} s: ${summary}`);
      continue;
    }
    if (!force && existsSync(file) && JSON.stringify(plans[cut]) === JSON.stringify(plan)) {
      console.log(`${cut} s: unchanged (${summary})`);
      continue;
    }
    if (!process.env.ELEVENLABS_API_KEY) throw new Error('Missing ELEVENLABS_API_KEY (marketing/video/.env)');
    await writeFile(file, await compose(plan));
    plans[cut] = plan;
    console.log(`public/music-${cut}.mp3: ${summary}`);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
}
if (!dry) await writeFile(PLANS, `${JSON.stringify(plans, null, 2)}\n`);
