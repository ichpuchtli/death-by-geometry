# Audio System Reference

## When to Use
Use when working on sound effects, music, audio mixing, the ElevenLabs pipeline, or any file in `core/audio.ts`, `config.ts` audio constants, or `sounds/`.

---

## Architecture

- **SFX:** 11 WAV files loaded via Web Audio API. `playSFX(name)` creates a new AudioBufferSourceNode each call.
- **SFX config source of truth:** `config.ts` `SFX_NAMES` lists only shipped `.wav` files in `sounds/`.
- **Music:** 4-layer procedural synthwave (bass pad, rhythm, arpeggio, lead). Layers cross-fade based on 0-1 intensity from game state. Intensity = difficulty phase + enemy count + phase transition bump + heat (0.15 * heat).
- Safari quirk: AudioContext must be created/resumed on user gesture.
- **Music-start race (fixed):** the first game starts on the *same* gesture that kicks off the async `init()`, so `startGame()`→`startMusic()` runs before `this.music` exists. `startMusic()`/`stopMusic()` set a `wantMusic` flag; `init()` flushes it (`music.start()`) once ready. Without this, music never played on the first playthrough (only after a restart). Guard: `tests/flows/92-music-first-run.yml`.
- **Total silence?** the audio graph itself (`masterGain` 0.5 → `sfxGain`/`musicGain` → destination) is robust; the usual cause of "no sound at all" is the **persisted mute** — `M` toggles `_muted` and writes `gg_muted` to localStorage, and `init()` restores it (`masterGain=0`). Clear it by pressing `M` again (or removing `gg_muted`).

## Procedural Kill SFX

`playKillSignature(family)` generates per-family death sounds:
- **Rhombus:** sharp crystalline ping (2400→1200 Hz sine)
- **Square:** heavy thud (120→40 Hz sine + noise crunch)
- **Pinwheel:** spinning whoosh (sawtooth sweep 400→1600→200 Hz through bandpass)
- **Sierpinski:** layered fractal tones (3 descending triangle waves at 880/660/440 Hz)
- **Circle / Shard / MiniMandel:** short soft bubble pop (`playKillPop` — sine ~820–1340→×0.38 Hz, ~0.12s, gain 0.09) with **randomised pitch** so a circle flock (supernova ejecta, up to 36 at once) crackles instead of going silent or machine-gunning. Previously these families had no case and were silent.
- **BlackHole:** existing procedural explosion (`playBlackHoleDeath`)

## Weapon SFX

- **Shoot:** `playShoot(pellets)` — procedural **"Deep Thump"** weapon blast fired by `Game` each trigger pull (player only; the wingman is silent to avoid doubling). Picked in the Player Design Lab (`?player=1`), replacing the old bright shotgun crack. A saturated sub-bass sine kick that drops in pitch (~130→32 Hz) via `makeSaturator(2.5–4)` so the low sub reads on laptop speakers, plus a tiny triangle click transient (320→90 Hz) for the attack edge. `pellets` (2–6, = `shots.length`) is normalized `t=(pellets-2)/4`; higher `t` deepens/lengthens/loudens the thump, so a 6-pellet Hex Storm hits heavier than a 2-pellet Twin. ~0.2–0.26s, modest gain for the ~3/s cadence. Paired with ship recoil + a Ring-Pop muzzle flash (see combat-feedback skill).

## Supernova / BlackHole SFX

- `playBlackHoleSpawn(volume = 1)` — **BlackHole spawn-in sound (low & bassy, ominous).** Replaced the old `playSFX('deathstar')` WAV (SpawnSystem `playEnemySpawnSFX`/`playSFXAtVolume` case `'blackhole'`). Three layers over ~2s (matches the ~3s spawn telegraph): a *saturated* sub sweeping DOWN 70→28 Hz (matter collapsing inward; `makeSaturator(3.0)` so it reads on laptop speakers), a detuned second sub 73→30 Hz beating slowly against the first for an uneasy wobble, and a low-passed noise rumble (420→110 Hz) for the "tearing open" texture. `volume` scales all three (formation leakthrough passes a reduced volume).
- `playBlackHoleDeath(absorbed)` — production detonation: sub-boom (80→20 Hz), bandpassed noise burst, descending tone-cluster tail, metallic ring layer. Scales with `absorbed/12` intensity.
- `playSupernovaWarning(durationMs = 1500)` — rising sub-drone (30→50 Hz) + high whine; duration now **parameterized** to match `BlackHole.destabilizeDuration` (Threat Lab presets use 350–1500ms windows).
- `setBlackHoleStress(level)` — **continuous wobbling sub-bass stress loop** (two detuned sines beating 1→4 Hz + LFO tremolo 3→9 Hz, gain `level²·0.32`, pitch 32→44 Hz). Level = most-fed BH's `absorbedCount/MAX_ABSORB` (1 while destabilizing), fed each frame by `GravitySystem.update()` (and the Threat Lab). Silent at 0; params smoothed with `setTargetAtTime`. Zeroed on `gravity.clear()` and game over. This is the pre-warning "you can hear how unstable it is" signal; sequencing is **stress wobble → 350ms warning → subdrop burst**.
- `playSupernovaVariant(variant, absorbed)` — detonation variants; **production uses `SUPERNOVA_SOUND_VARIANT = 'subdrop'`** (`config/audio.ts`), called by `GravitySystem.detonate()`. `SupernovaSoundVariant = 'classic' | 'subdrop' | 'doom' | 'quake'` exported from `core/audio.ts`:
  - **classic** — delegates to `playBlackHoleDeath`
  - **subdrop** — cinematic bass drop: kick transient (150→40 Hz) into a *saturated* 55→16 Hz sub with ~3s decay + bright air-crack noise. Saturation (tanh WaveShaper via `makeSaturator(amount)`) adds harmonics so the sub reads on laptop speakers.
  - **doom** — distorted chaos: crushed square sub (42→22 Hz through lowpass + hard saturation), long crushed noise wall, 3 detuned sawtooth screams diving 800→90 Hz.
  - **quake** — double-hit thunder: noise crack + 90→30 Hz thump, then a 350ms-delayed deeper aftershock (saturated 45→14 Hz) with a 6 Hz-tremolo rumble tail.
- Private helpers: `makeSaturator(amount)` (soft-clip WaveShaper) and `makeNoiseSource(lenSec)`.
- `playBlackHoleDeath` remains the kill-by-gunfire sound (via `playKillSignature('blackhole')`); the supernova path uses the subdrop variant.

## Event SFX

- **Phase transition:** `playPhaseTransition()` — rising sawtooth sweep + bass impact hit
- **Telegraph:** `playTelegraphWarning()` — short square wave buzz
- **Recovery start:** `playRecoveryStart()` — ascending power chord (E4/A4/E5 + shimmer)
- **Recovery expire:** `playRecoveryExpire()` — descending two-tone warning
- **Elite arrive:** `playEliteArrive()` — ascending two-tone chime
- **Elite kill:** `playEliteKill()` — major chord stab (C5/E5/G5 triangle) + sub thud

## Miniboss SFX

- `playMinibossWarning()` — pulsing bass rumble + descending square wave klaxon
- `playMinibossArrive()` — rising sweep into bass drop + metallic crash
- `playMinibossStageBreak()` — heavy sawtooth crack + sub thud
- `playMinibossDeath()` — bass boom + C major triumph chord + noise crash + shimmer tail

## Formation Group Spawn Sound

When a formation with 6+ enemies spawns, a single procedural "gatling brrrr" replaces stacked individual SFX. First 2 enemies still play individual SFX at 15% volume for type identity.

- `playSFXAtVolume(name, volume)` — plays named SFX through intermediate gain node
- `playFormationSpawn(formation, count)` — dispatches to per-formation procedural synth:
  - **Swarm:** 25Hz square LFO on 600→900Hz bandpass noise. Steady machine gun.
  - **Surround:** 20→28Hz LFO on sweeping 800→1000→600Hz bandpass. Whirr.
  - **Wall:** 15Hz LFO on 300Hz bandpass + 60→30Hz sub-bass. Heavy stamps.
  - **Pincer:** 30Hz LFO, two bursts at 500/700Hz with gap. Double tap.
  - **Ambush:** 35→20Hz LFO on 1200→600Hz bandpass. Sharp decaying crackle.
  - **Cascade:** 15→40Hz LFO on 500→1200Hz bandpass. Accelerating stutter.

Config: `FORMATION_SOUND_MIN_COUNT=6`, `FORMATION_LEAKTHROUGH_COUNT=2`, `FORMATION_LEAKTHROUGH_VOLUME=0.15`

Wired in `game.ts`: `formationSpawnCounts` map tracks per-formation spawn counts. Group sound triggered from telegraph loop. Individual SFX suppressed in spawn loop for formation members (after leakthrough quota).

## Game Over & Medal SFX

- `playGameOver()` — ElevenLabs-generated dark dramatic stinger (`sounds/generated/gameover.mp3`)
- `playMedalReveal()` — ElevenLabs-generated triumphant fanfare (`sounds/generated/medal-reveal.mp3`)

## Generated SFX Pipeline

`GENERATED_SFX` in `config.ts` maps names to MP3 paths in `sounds/generated/`. Loaded in `audio.ts` via `loadGeneratedSFX()` alongside WAV files. Files also copied to `web/public/sounds/generated/` for Vite serving.

## ElevenLabs Generation

- **Generator script:** `scripts/generate-elevenlabs-sfx.mjs` — calls ElevenLabs API using `ELEVENLABS_API_KEY`. Single prompt (`--text`, `--out`) or JSON batch (`--manifest`).
- **Prompt packs (JSON manifests):**
  - `scripts/elevenlabs-sfx-jobs-existing-sounds.json` — one prompt per shipped legacy SFX
  - `scripts/elevenlabs-sfx-jobs-unit-form-and-destroy.json` — paired form/destroy prompts for active enemy families
  - `scripts/elevenlabs-menu-soundtracks.json` — long-form menu theme prompts (3x 24s segments, stitched locally)
  - `scripts/elevenlabs-procedural-sfx.json` — replacements for discrete procedural cues (kill signatures, phase transition, elite, telegraph, recovery, blackhole death)
- **Menu stitching:** `npm run sfx:stitch-menus` wraps `scripts/stitch-elevenlabs-menu-themes.sh`
- **Kill signature previews:** `sounds/kill-signature-previews/` — FFmpeg-synthesized WAVs from `scripts/generate-kill-signature-previews.sh` (not wired into gameplay)
- **Project skill doc:** `.agents/skills/elevenlabs-game-audio/SKILL.md`
