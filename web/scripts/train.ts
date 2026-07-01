/**
 * Neuroevolution trainer for the Death by Geometry AI agent.
 *
 * Uses the Cross-Entropy Method (CEM) — a simple, robust, gradient-free policy-search
 * algorithm — to evolve a small MLP policy that plays the game. Each candidate policy is
 * scored by running full episodes in the headless digital twin (`sim/headless-game.ts`);
 * the top "elite" candidates seed the next generation's search distribution.
 *
 * Run:  npx tsx scripts/train.ts [--gens=30] [--pop=40] [--elite=8] [--secs=25] [--dt=33]
 * Output: src/ai/trained-policy.json  (imported directly by the browser bot)
 *
 * No ML framework, no gradients — just the forward pass in ai/policy.ts and lots of
 * fast headless simulation.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HeadlessGame } from '../src/sim/headless-game';
import { Policy } from '../src/ai/policy';
import { encodeObservation, OBS_SIZE } from '../src/ai/observation';
import { decodeAction, ACTION_SIZE } from '../src/ai/action';

// ---- config (CLI-overridable) ----
const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'];
}));
const num = (k: string, d: number) => (args.has(k) ? Number(args.get(k)) : d);

const GENS = num('gens', 30);
const POP = num('pop', 40);
const ELITE = num('elite', 8);
const EPISODE_SECS = num('secs', 25);
const DT = num('dt', 33);
const EPISODES_PER_CAND = num('eps', 2);
const SIGMA0 = num('sigma', 0.8);
const SIGMA_FLOOR = 0.05;
const ARCH = [OBS_SIZE, 24, 16, ACTION_SIZE];
const PHASES = ['tutorial', 'rampUp', 'midGame'];

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ai', 'trained-policy.json');

// ---- gaussian sampler (Box–Muller) ----
function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---- episode rollout ----
const game = new HeadlessGame();
const policy = new Policy(ARCH);
const obs = new Float32Array(OBS_SIZE);
const maxSteps = Math.floor((EPISODE_SECS * 1000) / DT);

function evalParams(params: Float32Array): number {
  policy.setFlat(params);
  let total = 0;
  for (let ep = 0; ep < EPISODES_PER_CAND; ep++) {
    const phase = PHASES[Math.floor(Math.random() * PHASES.length)];
    game.reset(phase, 1);
    const startT = game.gameTime; // phases start at a time offset — measure survival since reset
    const startScore = game.score;
    for (let s = 0; s < maxSteps; s++) {
      encodeObservation(game.player, game.enemies, game.arenaW, game.arenaH, obs);
      game.setAction(decodeAction(policy.forward(obs)));
      game.step(DT);
      if (!game.alive) break;
    }
    // Reward: survival time is primary (learn to dodge), score nudges toward aiming + killing.
    total += (game.gameTime - startT) * 5 + 0.02 * (game.score - startScore);
  }
  return total / EPISODES_PER_CAND;
}

// ---- CEM main loop ----
const P = Policy.paramCount(ARCH);
const mean = new Float32Array(P);      // start at zero → near-zero (idle) policy
const sigma = new Float32Array(P).fill(SIGMA0);
const cand = new Float32Array(P);

let bestFit = -Infinity;
let bestParams = mean.slice();

console.log(`CEM training — arch=[${ARCH}] params=${P} pop=${POP} elite=${ELITE} gens=${GENS} episode=${EPISODE_SECS}s dt=${DT}ms`);
const t0 = Date.now();

for (let gen = 0; gen < GENS; gen++) {
  const scored: { fit: number; params: Float32Array }[] = [];
  for (let k = 0; k < POP; k++) {
    for (let i = 0; i < P; i++) cand[i] = mean[i] + sigma[i] * gauss();
    const fit = evalParams(cand);
    scored.push({ fit, params: cand.slice() });
  }
  scored.sort((a, b) => b.fit - a.fit);
  const elites = scored.slice(0, ELITE);

  // Refit search distribution to the elites (per-dimension mean + std).
  for (let i = 0; i < P; i++) {
    let m = 0;
    for (const e of elites) m += e.params[i];
    m /= ELITE;
    let varSum = 0;
    for (const e of elites) { const d = e.params[i] - m; varSum += d * d; }
    mean[i] = m;
    sigma[i] = Math.max(SIGMA_FLOOR, Math.sqrt(varSum / ELITE));
  }

  if (elites[0].fit > bestFit) {
    bestFit = elites[0].fit;
    bestParams = elites[0].params.slice();
  }

  const meanEliteFit = elites.reduce((s, e) => s + e.fit, 0) / ELITE;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(
    `gen ${String(gen + 1).padStart(3)}/${GENS}  best=${elites[0].fit.toFixed(2)}  eliteAvg=${meanEliteFit.toFixed(2)}  allTimeBest=${bestFit.toFixed(2)}  [${secs}s]`,
  );

  // Checkpoint every generation so an interrupted run still leaves usable weights.
  policy.setFlat(bestParams);
  writeFileSync(OUT_PATH, JSON.stringify(policy.toJSON()));
}

policy.setFlat(bestParams);
writeFileSync(OUT_PATH, JSON.stringify(policy.toJSON()));
console.log(`\nDone. Best fitness ${bestFit.toFixed(2)} written to ${OUT_PATH}`);
