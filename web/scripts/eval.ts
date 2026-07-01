/** Quick diagnostic: average survival time + score for the trained policy vs a do-nothing baseline. */
import { HeadlessGame } from '../src/sim/headless-game';
import { Policy } from '../src/ai/policy';
import { encodeObservation, OBS_SIZE } from '../src/ai/observation';
import { decodeAction } from '../src/ai/action';
import trained from '../src/ai/trained-policy.json';

const DT = 33, SECS = 40, N = 8;
const maxSteps = (SECS * 1000) / DT;
const game = new HeadlessGame();
const obs = new Float32Array(OBS_SIZE);
const policy = Policy.fromJSON(trained as { arch: number[]; params: number[] });

function run(phase: string, usePolicy: boolean) {
  let t = 0, sc = 0;
  for (let i = 0; i < N; i++) {
    game.reset(phase, 1);
    for (let s = 0; s < maxSteps; s++) {
      if (usePolicy) {
        encodeObservation(game.player, game.enemies, game.arenaW, game.arenaH, obs);
        game.setAction(decodeAction(policy.forward(obs)));
      } else {
        game.setAction({ moveX: 0, moveY: 0, aimAngle: 0, fire: true }); // idle + fire
      }
      game.step(DT);
      if (!game.alive) break;
    }
    t += game.gameTime; sc += game.score;
  }
  return { t: (t / N).toFixed(1), sc: Math.round(sc / N) };
}

for (const phase of ['tutorial', 'rampUp', 'midGame', 'intense', 'chaos']) {
  const idle = run(phase, false);
  const bot = run(phase, true);
  console.log(`${phase.padEnd(9)}  idle: surv=${idle.t}s score=${idle.sc}   |   BOT: surv=${bot.t}s score=${bot.sc}`);
}
