#!/usr/bin/env node
/**
 * Sync ElevenLabs black-hole audition assets into web/public so the SFX Lab
 * (`?sfx=1`) can play them. The generator (scripts/generate-elevenlabs-sfx.mjs)
 * writes to the repo-root `sounds/generated/<category>/`, which Vite cannot
 * serve — this script copies whatever exists into
 * `web/public/sfx-audition/<category>/` and writes an `index.json` describing
 * EVERY candidate in the manifest (including ones not yet generated, flagged
 * `available: false`) so the lab can render the full list immediately.
 *
 * Categories: blackhole-hit (bullet-hit sounds) and blackhole-spawn (spawn
 * sounds — the spawn list also appends a copy-only 11th candidate: the legacy
 * `blackhole_form_elevenlabs_v1.mp3` from the unit form/destroy pack).
 *
 * Usage: npm run sfx:sync   (from web/)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

const WEB = join(fileURLToPath(import.meta.url), '..', '..');
const ROOT = join(WEB, '..');

const CATEGORIES = [
  {
    dir: 'blackhole-hit',
    manifest: join(ROOT, 'scripts', 'elevenlabs-sfx-jobs-blackhole-hit.json'),
    manifestRel: 'scripts/elevenlabs-sfx-jobs-blackhole-hit.json',
    prefix: 'blackhole_hit_',
    extra: [],
  },
  {
    dir: 'blackhole-spawn',
    manifest: join(ROOT, 'scripts', 'elevenlabs-sfx-jobs-blackhole-spawn.json'),
    manifestRel: 'scripts/elevenlabs-sfx-jobs-blackhole-spawn.json',
    prefix: 'blackhole_spawn_',
    // Copy-only candidates: not in the generation manifest, appended after the jobs.
    extra: [
      {
        file: 'blackhole_form_elevenlabs_v1.mp3',
        src: join(ROOT, 'sounds', 'generated', 'blackhole_form_elevenlabs_v1.mp3'),
        name: 'Legacy Form',
        prompt: 'Legacy form sound from the unit form/destroy pack (deathstar-era role).',
        duration: 1.0,
      },
    ],
  },
];

/** "blackhole_spawn_void_bloom_elevenlabs_v1.mp3" → "Void Bloom" (prefix per category) */
function shortName(file, prefix) {
  return basename(file, '.mp3')
    .replace(new RegExp(`^${prefix}`), '')
    .replace(/_elevenlabs_v\d+$/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

for (const cat of CATEGORIES) {
  const target = join(WEB, 'public', 'sfx-audition', cat.dir);
  const jobs = JSON.parse(readFileSync(cat.manifest, 'utf8'));

  mkdirSync(target, { recursive: true });
  // Clean previously synced mp3s (regenerable copies; index.json is rewritten below)
  for (const f of readdirSync(target)) {
    if (f.endsWith('.mp3')) rmSync(join(target, f));
  }

  let available = 0;
  const candidates = jobs.map((job, i) => {
    const file = basename(job.out);
    const src = join(ROOT, job.out);
    const has = existsSync(src);
    if (has) {
      copyFileSync(src, join(target, file));
      available++;
    }
    return {
      id: i + 1,
      name: shortName(file, cat.prefix),
      file,
      prompt: job.text,
      duration: job.duration,
      available: has,
    };
  });

  // Copy-only extras (legacy/one-off files that live outside the category dir)
  for (const extra of cat.extra) {
    const has = existsSync(extra.src);
    if (has) {
      copyFileSync(extra.src, join(target, extra.file));
      available++;
    }
    candidates.push({
      id: candidates.length + 1,
      name: extra.name,
      file: extra.file,
      prompt: extra.prompt,
      duration: extra.duration,
      available: has,
    });
  }

  writeFileSync(join(target, 'index.json'), JSON.stringify(candidates, null, 2) + '\n');
  console.log(`sfx:sync [${cat.dir}] — ${candidates.length} candidates listed, ${available} mp3(s) copied → ${join('public', 'sfx-audition', cat.dir)}`);
  if (available < candidates.length) {
    console.log(`Pending generation: npm run sfx:elevenlabs -- --manifest ${cat.manifestRel} (from repo root, needs ELEVENLABS_API_KEY), then npm run sfx:sync again.`);
  }
}
