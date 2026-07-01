# AI Agent — a self-playing bot for Death by Geometry

A neural-network policy, trained by **neuroevolution**, that plays the game on its own.
Built for automated soak/crash/balance testing and for watching the game play itself.

> TL;DR — load the game with **`?bot=1`** (or press **B** in-game) and watch the 🤖 agent
> play. To make it smarter, run `cd web && npx tsx scripts/train.ts` and reload.

---

## How it works

There are three pieces: a **digital twin** to train against, a **policy** (the brain),
and a **trainer** that evolves the policy.

```
              ┌─────────────────────────── shared, pure TypeScript ──────────────────────────┐
              │  observation.ts  (world → feature vector)                                     │
              │  policy.ts       (feature vector → action vector, tiny MLP forward pass)      │
              │  action.ts       (action vector → move/aim/fire)                              │
              └───────────────────────────────────────────────────────────────────────────────┘
                        ▲                                              ▲
         Node (training) │                                             │ browser (live play)
                        │                                              │
   scripts/train.ts ──▶ sim/headless-game.ts                    ai/bot.ts ──▶ game.ts
   (Cross-Entropy         (real gameplay loop,                  (loads trained-policy.json,
    Method evolution)      renderer/audio stubbed)               drives Input each frame)
```

The key property: **the observation encoder and the policy forward pass are the exact
same code** in Node and the browser, and the headless sim reuses the **real** gameplay
systems. So a policy trained offline transfers directly to the live game.

### 1. Digital twin — `web/src/sim/headless-game.ts`

A headless clone of the game's `update()` loop. It reuses the real `Player`, enemy
classes, `BulletPool`, `checkCollisions`, `WaveManager`, and all five gameplay systems
(`Lifecycle`, `Combat`, `Spawn`, `Gravity`, `Boss`) — only the renderer, audio, camera,
and HUD are replaced with no-op stubs (`sim/stubs.ts`). Enemy AI, spawning, black-hole
gravity, separation, and collision therefore behave exactly as in the browser.

Two refactors made this possible without dragging WebGL into Node:

- **`import type` for renderer/GL classes.** `Renderer`, `SpringMassGrid`, `Camera`,
  `AudioManager`, `ExplosionPool`, and `HUD` are imported as types wherever they're only
  used as types. Since the systems receive these as injected dependencies (never
  instantiate them), the headless import graph never loads a module that imports `.glsl`
  or touches a WebGL context.
- **`InputSource` interface.** `Player` depends on an interface, not the DOM-backed
  `Input`. The browser uses `Input`; the twin uses `ScriptedInput`, which just returns
  the agent's chosen action.

Separation logic lives in `systems/separation.ts`, shared by both `Game` and the twin so
they never drift.

Episodes default to a **single life** for a crisp survival signal. `reset(phase, lives)`
can start at any difficulty phase.

### 2. Policy — `web/src/ai/policy.ts`

A small multilayer perceptron: `[OBS_SIZE, 24, 16, 4]`, `tanh` everywhere. The forward
pass is a few loops of plain TypeScript — **no TensorFlow, no ML runtime dependency.**
Weights flatten to a `Float32Array` (for evolution) and serialize to plain JSON
(`trained-policy.json`), which the browser imports straight into the bundle.

**Observation** (`ai/observation.ts`, `OBS_SIZE = 43`) is egocentric and order-invariant:

- player position (2) + velocity (2)
- wall clearance in 4 directions (4)
- a 16-sector angular "radar": nearest-enemy **proximity** per sector (16)
- the same 16 sectors' **closing speed** (how fast that enemy is approaching) (16)
- nearest enemy overall: unit direction + proximity (3)

The radar is why the agent copes with chaotic swarms — it summarizes any number of
enemies into a fixed vector.

**Action** (`ai/action.ts`): outputs a move vector (analog, clamped to the unit disk with
a small dead zone) and an aim vector (→ angle). Fire is always on.

### 3. Trainer — `web/scripts/train.ts`

**Cross-Entropy Method (CEM)**, a simple gradient-free policy search:

1. Keep a search distribution over weight vectors (per-dimension mean + std).
2. Each generation, sample a population of candidate weight vectors.
3. Score each candidate by running full episodes in the twin
   (fitness = survival-time × 5 + 0.02 × score, measured *since episode start*).
4. Take the top **elites** and refit the distribution's mean/std to them.
5. Repeat. Checkpoint the best policy to `src/ai/trained-policy.json` every generation.

CEM was chosen over PPO/DQN because it needs no autodiff, is robust to the noisy
fitness of a stochastic game, and is trivial to implement in pure TS. A full run is fast
(~30s) because the twin has no rendering.

---

## Usage

### Watch it play

- **In the browser:** press **`B`** during play, or open the game with **`?bot=1`**
  (e.g. `http://localhost:5173/?bot=1`). It auto-starts and auto-restarts on death. A
  "🤖 AI AGENT PLAYING" badge appears while active.
- The agent respects all normal game settings (arena size, spawn rate, phase, etc.), so
  it's useful for exercising specific scenarios.

### Play beside it (AI wingman)

Turn on **AI Wingman** in the settings panel (or set `gameSettings.aiWingman = true`) to
spawn a **cyan ally ship that fights alongside you** while *you* keep control of your own
ship. The wingman (`web/src/entities/wingman.ts`) runs the same trained policy but
observes and acts from its own position, so it dodges and shoots independently. Its
bullets share the bullet pool, so its kills count toward your score; it reuses your
current weapon stage and is a non-colliding helper (it can't be killed). A
"🤖 AI WINGMAN" badge shows while it's active, and the toggle takes effect immediately —
even from the pause menu (`Game.syncWingman()` creates/destroys it each frame).

This differs from the takeover bot above: `?bot=1` / **B** replaces *your* input with the
AI; the wingman is *additive* — a second AI ship next to your human-controlled one.

### Train / improve it

```bash
cd web
npx tsx scripts/train.ts                       # default: 30 gens, pop 40
npx tsx scripts/train.ts --gens=60 --pop=56 --elite=8 --secs=35 --eps=3
npx tsx scripts/eval.ts                         # survival/score vs a do-nothing baseline

# survival-focused long run with a LIVE dashboard (open http://localhost:8787):
npx tsx scripts/train.ts --live --gens=150 --pop=64 --elite=10 --secs=45 --eps=3 \
  --survW=10 --scoreW=0.004 --phases=tutorial,rampUp,midGame,intense,chaos
```

`train.ts` overwrites `src/ai/trained-policy.json` **every generation** (a checkpoint, so
an interrupted run still leaves usable weights); reload the game to use the new brain.
Reward shaping is now CLI-tunable (`--survW`, `--scoreW`); network shape (`ARCH`) is near
the top of `train.ts`, and the phases trained on default to all five.

CLI flags: `--gens` generations, `--pop` population size, `--elite` elites kept,
`--secs` episode length, `--dt` sim timestep (ms), `--eps` episodes averaged per
candidate, `--sigma` initial exploration std, `--survW`/`--scoreW` reward weights
(survival-seconds × `survW` + score × `scoreW`), `--phases` comma-separated phase list.

### Watch it train (live dashboard)

Pass `--live` (optionally `--port=8787`) and `train.ts` starts a zero-dependency HTTP
server (Node `http`, no framework) that serves `scripts/train-dashboard.html`. Open
`http://localhost:8787` to watch, in real time:

- **generation + candidate progress bars** and elapsed timer;
- a **fitness chart** (all-time best / gen best / elite average over generations);
- **per-phase survival + score** of the current best policy (re-evaluated each generation
  across every phase);
- **live heatmaps of the evolving network weights** (one per layer, diverging colormap).

The dashboard polls `/progress` (JSON) every ~600ms. The CEM loop yields to the event
loop after each candidate (`await setImmediate`) so the server stays responsive during a
generation. The server keeps serving after training finishes (Ctrl-C to exit).

### Test

`tests/flows/73-ai-agent-plays.yml` (tag `ai`) loads `?bot=1`, waits, and asserts the
agent auto-started, is alive, and is scoring from kills:

```bash
./tests/playwright.sh ai --headless
```

`window.game` is exposed for flow assertions.

---

## Extending it

- **Better play:** longer/more training (`--gens`, `--eps`), a bigger `ARCH`, or richer
  observations (e.g. add bullet-position features, or player invulnerability state).
- **Different objectives:** change the fitness in `train.ts` (e.g. reward black-hole
  kills, or pure survival with zero score weight for a defensive "runner").
- **Swap the algorithm:** the policy exposes `getFlat()`/`setFlat()`; any black-box
  optimizer (ES, PSO, PPO with an added gradient path) can drive it.
- **Faithfulness:** if the twin ever diverges from the live game, it's because a
  gameplay-affecting call was dropped from `HeadlessGame.step()` — keep it in sync with
  the `playing` branch of `Game.update()`.
