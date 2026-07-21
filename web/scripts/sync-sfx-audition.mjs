#!/usr/bin/env node
/**
 * Sync ElevenLabs black-hole-hit audition assets into web/public so the SFX Lab
 * (`?sfx=1`) can play them. The generator (scripts/generate-elevenlabs-sfx.mjs)
 * writes to the repo-root `sounds/generated/blackhole-hit/`, which Vite cannot
 * serve — this script copies whatever exists into
 * `web/public/sfx-audition/blackhole-hit/` and writes an `index.json` describing
 * EVERY candidate in the manifest (including ones not yet generated, flagged
 * `available: false`) so the lab can render the full list immediately.
 *
 * Usage: npm run sfx:sync   (from web/)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

const WEB = join(fileURLToPath(import.meta.url), '..', '..');
const ROOT = join(WEB, '..');
const MANIFEST = join(ROOT, 'scripts', 'elevenlabs-sfx-jobs-blackhole-hit.json');
const TARGET = join(WEB, 'public', 'sfx-audition', 'blackhole-hit');

/** "blackhole_hit_cinematic_swallow_elevenlabs_v1.mp3" → "Cinematic Swallow" */
function shortName(file) {
  return basename(file, '.mp3')
    .replace(/^blackhole_hit_/, '')
    .replace(/_elevenlabs_v\d+$/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const jobs = JSON.parse(readFileSync(MANIFEST, 'utf8'));

mkdirSync(TARGET, { recursive: true });
// Clean previously synced mp3s (regenerable copies; index.json is rewritten below)
for (const f of readdirSync(TARGET)) {
  if (f.endsWith('.mp3')) rmSync(join(TARGET, f));
}

let available = 0;
const candidates = jobs.map((job, i) => {
  const file = basename(job.out);
  const src = join(ROOT, job.out);
  const has = existsSync(src);
  if (has) {
    copyFileSync(src, join(TARGET, file));
    available++;
  }
  return {
    id: i + 1,
    name: shortName(file),
    file,
    prompt: job.text,
    duration: job.duration,
    available: has,
  };
});

writeFileSync(join(TARGET, 'index.json'), JSON.stringify(candidates, null, 2) + '\n');
console.log(`sfx:sync — ${candidates.length} candidates listed, ${available} mp3(s) copied → ${join('public', 'sfx-audition', 'blackhole-hit')}`);
if (available < candidates.length) {
  console.log('Pending generation: npm run sfx:elevenlabs -- --manifest scripts/elevenlabs-sfx-jobs-blackhole-hit.json (from repo root, needs ELEVENLABS_API_KEY), then npm run sfx:sync again.');
}
