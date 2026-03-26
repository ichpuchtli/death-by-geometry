# Death by Geometry Gameplay Excitement Roadmap

This document is organized for Ralph-loop execution. Each phase is meant to be independently playable and shippable before moving to the next one.

## Mission

Turn Death by Geometry into a more legible, dramatic, and rewarding arcade shooter without losing its fast, skill-first identity.

### Mission Intent

Make the run feel more authored and exciting by improving combat readability, payoff, pacing, and end-of-run reflection. The player should always understand when the game is escalating, when a threat is special, and when they have earned a meaningful moment of power or spectacle.

### Mission Tasks

- [ ] Keep the core loop arcade-first and readable
  Intent: Preserve the current survival-shooter identity while improving feedback and pacing rather than burying it under meta systems.
- [ ] Ship in slices rather than one monolithic update
  Intent: Ensure every milestone can land cleanly, be playtested, and improve the game on its own.
- [ ] Prioritize readability, payoff, and pacing before broad content expansion
  Intent: Fix the feel of the existing game first so later content lands on stronger foundations.
- [ ] Start with minimal net-new content in the first content pass
  Intent: Avoid solving excitement problems with content volume when presentation and structure are the real bottlenecks.
- [ ] Ship exactly one miniboss before expanding the boss roster
  Intent: Prove the encounter structure before scaling it.
- [ ] Keep heat presentation-first in v1
  Intent: Make strong runs look and sound better without quietly destabilizing difficulty balance.
- [ ] Treat elite powerup drops as a later extension unless they become necessary sooner
  Intent: Keep the first elite rollout focused on clarity, threat value, and reward feel rather than introducing pickup complexity too early.

### Mission Exit Criteria

- [ ] The game feels more exciting without becoming harder to read
- [ ] Every shipped phase creates a clear improvement to moment-to-moment play
- [ ] New systems remain compatible with desktop and mobile play
- [ ] The roadmap can be executed top-to-bottom without inventing new product direction midstream

### Mission Notes

- This roadmap is optimized for staged delivery, not a single large release
- The intent text exists to help future implementation decisions stay aligned with the design goal

---

## Phase 1: Readability + Impact Foundation

- [x] Phase complete (commit `0318975`)

### Goal

Make every important combat event easier to read and more satisfying without changing the core controls or survival loop.

### Intent

The player should immediately understand formation danger, phase escalation, and why certain kills feel bigger than others. This phase should improve the game even if no later phase ships.

### Tasks

- [x] Add a lightweight combat feedback state in the main loop for hitstop, kill accents, phase banners, and short-lived visual pulses
- [x] Add selective hitstop support with per-event duration/config
- [x] Freeze gameplay simulation during hitstop while keeping intentional render pulse feedback active
- [x] Add enemy-family kill signature lookup keyed by base enemy type
- [x] Implement `rhombus` kill signature: crystal burst, narrow rays, sharp kill sting
- [x] Implement `square` / `square2` kill signature: chunkier fragments, heavier impact accent, lower thud
- [x] Implement `pinwheel` kill signature: spark spiral and rotational breakup feel
- [x] Implement `sierpinski` kill signature: layered fractal collapse / peel
- [ ] Strengthen black hole pre-death instability read without replacing the current special death treatment
  Intent: Deferred — BlackHole already has strong death treatment; instability read can be added with elite layer.
- [x] Extend spawn request/event data to include formation telegraph metadata
- [x] Add border warning arcs for `wall`, `pincer`, `surround`, `ambush`, and `cascade`
- [ ] Add world-position spawn glyph rendering during spawn-in
  Intent: Existing spawn animations (growing rings + shape fade-in) serve this role; dedicated glyphs deferred.
- [x] Add distinct telegraph audio motifs per formation type
- [x] Detect phase changes once and fire a dedicated phase-transition event
- [x] Add phase transition HUD banner support
- [x] Add arena-wide border pulse and brief color shift for phase transitions
- [x] Add short music intensity bump or accent on phase transitions
- [x] Keep telegraphs readable and non-obstructive to player/aim reads

### Exit Criteria

- [x] Every current active enemy family has a visibly distinct death read
- [x] Every formation type is identifiable before enemies become dangerous
- [x] Every phase transition is obvious without checking debug state
- [x] Ordinary kills still feel fast; only major moments use hitstop
- [x] Desktop and mobile readability remain acceptable

### Notes

- Hitstop durations: square 35ms, sierpinski 50ms, blackhole 75ms — all under 80ms cap
- Telegraphs render on arena border (edges) or as dashed rings (surround/ambush) — no overlap with player/aim area
- Two tasks deferred (BH instability read, spawn glyphs) — not blocking; can be picked up in Phase 2 or later

---

## Phase 2: Elite Layer

- [x] Phase complete

### Goal

Introduce cheap, readable threat variety by upgrading existing enemies into elite variants before promoting more dormant enemy types into active play.

### Intent

Use elites to create higher-value threats, more memorable kill moments, and more run texture without needing a broad content explosion.

### Tasks

- [x] Add reusable enemy metadata fields: `baseType`, `variantType`, `isElite`, optional `threatTier`
- [x] Build elite modifiers as composable stat/behavior overlays on existing enemies
- [x] Add elite presentation layer: thicker glow, crown/ring, distinct spawn telegraph, arrival sting
- [x] Implement elite `rhombus`: faster pursuit, brighter trail, larger reward
- [x] Implement elite `square`: armor shell or extra HP before split
- [x] Implement elite `pinwheel`: burst speed or spark hazard identity
- [x] Implement elite `blackhole`: larger pull radius, stronger instability read, rare appearance
- [x] Add elite injection rules to wave pacing after `rampUp`
- [x] Prevent early-game elite overlap and over-stacking
- [x] Add elite-specific kill signature and short hitstop
- [x] Add elite reward hooks: score bonus, heat bonus, stats tracking
- [ ] Add placeholder future hook for elite powerup drops without requiring the pickup system yet
  Intent: Deferred — pickup system not yet needed; elite metadata is extensible when ready.

### Exit Criteria

- [x] Elite threats are readable within one second of spawn
- [x] Elites feel meaningfully different without tutorial text
- [x] Elite frequency increases variety without turning the arena into noise
- [x] Elite kills are obviously more valuable and more satisfying

### Notes

- No new enemy classes — elites are composable overlays via `ELITE_MODIFIERS` config
- `baseType` and `isElite` tracked on Enemy base class
- Concurrent cap (MAX_CONCURRENT_ELITES=3) prevents noise
- Phase-gated injection: 0% tutorial/rampUp, 8% midGame, 15% intense, 22% chaos

---

## Phase 3: Heat System + Recovery Window

- [x] Phase complete

### Goal

Make strong runs feel visually and sonically hotter, and turn post-death recovery into a short, exciting comeback moment instead of only a penalty.

### Intent

The player should feel that a strong run is climbing somewhere, and that losing a life briefly creates a comeback fantasy rather than only a setback.

### Tasks

- [x] Add global `heat` meter to game state
  Intent: Track overall run intensity in one reusable signal.
- [x] Increase heat from elite kills, dense combat windows, and survival pacing
  Intent: Tie spectacle growth to strong play and rising pressure.
- [x] Add slow passive heat decay during calm periods
  Intent: Make heat breathe instead of only climbing.
- [x] Hook heat into border brightness
  Intent: Let the arena itself communicate rising intensity.
- [x] Hook heat into starfield motion intensity
  Intent: Increase the sense of acceleration and momentum during stronger runs.
- [x] Hook heat into grid turbulence or arena energy
  Intent: Make the world feel more unstable as the player performs well.
- [x] Hook heat into safe bloom/trail intensity scaling
  Intent: Add spectacle without losing control of readability or performance.
- [x] Hook heat into music density or intensity behavior without changing core balance
  Intent: Reinforce run escalation through audio while keeping the game mechanically fair.
- [x] Add short-lived respawn recovery state to player/game state
  Intent: Create a bounded comeback window after life loss.
- [x] Implement default recovery buff: brief shield pulse plus temporary fire-rate boost
  Intent: Give the player a satisfying revenge beat without trivializing danger.
- [x] Add recovery start and expiry audiovisual cues
  Intent: Make the buff readable and emotionally legible.
- [x] Add HUD/banner support for recovery state
  Intent: Ensure the player knows they are in a temporary empowered state.
- [x] Update player rendering to communicate active recovery protection clearly
  Intent: Support fast recognition in combat, not just menu-level understanding.

### Exit Criteria

- [x] A strong run looks and sounds hotter than a weak run
- [x] Heat changes spectacle, not hidden difficulty, in v1
- [x] Recovery feels strong but short and non-stackable
- [x] Respawning creates a clear comeback moment

### Notes

- Heat is presentation-first in this phase — no mechanical effects on difficulty
- Recovery is 3.5s duration with 1.8x fire rate + full invulnerability + pulsing cyan shield ring
- Heat decay kicks in after 2s with no kills (0.04/s), so it breathes naturally
- Grid turbulence only activates above heat 0.1 to avoid noise during calm early game
- Starfield drift uses per-layer parallax multipliers (0.3x nebulae, 0.5x galaxies, 0.6x suns, 1.0x stars)
- Recovery shield shows orange blink warning at 800ms remaining

---

## Phase 4: One Signature Miniboss

- [ ] Phase complete

### Goal

Add one memorable encounter that punctuates the run and creates a chapter-like moment without stalling the pace of play.

### Intent

The first miniboss should prove that Death by Geometry can deliver authored encounter beats inside the survival loop without turning into a boss-rush game.

### Tasks

- [ ] Pick and lock the first miniboss archetype before implementation
  Intent: Avoid building encounter tech around an undefined fantasy.
- [ ] Define one signature mechanic only for the first miniboss
  Intent: Keep the fight readable and memorable.
- [ ] Keep fight structure to `2-3` HP stages max
  Intent: Maintain pace and mobile viability.
- [ ] Add dedicated miniboss encounter state/event flow
  Intent: Support clear staging, spawn suppression, rewards, and post-fight cleanup.
- [ ] Add dramatic spawn announcement and telegraph package
  Intent: Make the encounter feel like a chapter break, not just a larger enemy.
- [ ] Briefly soften surrounding spawn pressure during miniboss entrance
  Intent: Protect readability at the moment the encounter begins.
- [ ] Implement miniboss-specific visuals, audio cues, and stage-break feedback
  Intent: Make the fight feel authored and premium rather than a scaled-up elite.
- [ ] Add miniboss death sequence: heavy hitstop, spectacle burst, major reward
  Intent: Deliver a payoff worthy of the encounter pacing change.
- [ ] Add fixed spawn gate by survival time or phase boundary
  Intent: Make the first boss appearance feel expected and authored rather than random.
- [ ] Prevent overlap with another large event during the encounter
  Intent: Preserve encounter staging and avoid chaos that undermines readability.
- [ ] Track miniboss defeat in run stats and medals
  Intent: Let the encounter matter after the run ends.

### Exit Criteria

- [ ] The first miniboss is memorable on first sight
- [ ] The encounter is readable without tutorial text
- [ ] The fight punctuates the run instead of stalling it
- [ ] The fight remains readable on mobile

### Notes

- Ship one boss first rather than building a boss roster too early
- Prefer a short, high-impact encounter over a mechanically broad one
- If an unused enemy file is not already mechanically strong, do not force it into the first miniboss slot

---

## Phase 5: Curated Content Expansion

- [ ] Phase complete

### Goal

Expand variety carefully by promoting only a small number of dormant enemy types and adding one set-piece objective event that creates short-term goals.

### Intent

Content should create new player decisions, not just increase visual density. Every promoted enemy and set-piece should justify itself through behavior, pacing role, or tactical pressure.

### Tasks

- [ ] Review dormant enemy roster and select only `2-3` mechanically distinct candidates
  Intent: Keep the roster curated and readable.
- [ ] Assign each selected enemy a specific phase role before enabling it
  Intent: Prevent random inclusion without pacing purpose.
- [ ] Add the first curated dormant enemy to wave pools with controlled cadence
  Intent: Introduce new pressure one readable piece at a time.
- [ ] Add the second curated dormant enemy to wave pools with controlled cadence
  Intent: Expand variety without overwhelming the player.
- [ ] Optionally add a third curated enemy only if readability remains strong
  Intent: Treat readability as the cap, not content ambition.
- [ ] Verify each promoted enemy creates a new player decision, not just more noise
  Intent: Keep additions strategically meaningful.
- [ ] Design one destructible set-piece event type
  Intent: Add a short-term objective that changes the arena rhythm.
- [ ] Implement set-piece spawn and announce flow as a declared event, not background clutter
  Intent: Give the set-piece proper staging and player awareness.
- [ ] Implement set-piece behavior that temporarily alters the arena until destroyed
  Intent: Create a tactical objective without breaking the survival loop.
- [ ] Add set-piece destroy reward package: spectacle, reward, stats hook
  Intent: Make objective completion feel worth the attention shift.
- [ ] Reuse elite, telegraph, kill-signature, and heat systems for set-piece presentation
  Intent: Keep the feature coherent with the rest of the feedback language.

### Exit Criteria

- [ ] New content increases decision variety rather than just visual noise
- [ ] Each promoted enemy serves a clear phase purpose
- [ ] The set-piece event creates a short-term objective without derailing the survival loop
- [ ] The arena remains readable under dense spawns

### Notes

- Do not activate dormant enemies simply because they already exist in the repo
- Promote only the enemies that add distinct decision pressure
- Keep the set-piece as a declared event with staging, not a hidden passive modifier

---

## Phase 6: Audio Success Language + End-of-Run Story

- [ ] Phase complete

### Goal

Make the soundscape celebrate mastery, and make game over feel like a summary of how the run unfolded instead of only a final score screen.

### Intent

The game should sound like success matters, not just danger, and the run should end with authored reflection rather than abrupt score-only finality.

### Tasks

- [ ] Expand audio event taxonomy to cover success-forward events
  Intent: Give the audio system enough structure to reward player mastery and milestone moments.
- [ ] Add phase change audio cue
  Intent: Make pacing transitions audible as well as visible.
- [ ] Add telegraph-type audio cues
  Intent: Improve threat recognition when the player cannot visually parse everything at once.
- [ ] Add elite arrival audio cue
  Intent: Mark higher-value threats immediately.
- [ ] Add elite kill audio cue
  Intent: Make elite payoff unmistakable.
- [ ] Add miniboss arrival audio cue
  Intent: Stage the encounter as an authored chapter moment.
- [ ] Add miniboss stage-break audio cue
  Intent: Clarify fight progression and reinforce large impact moments.
- [ ] Add recovery start and expiry audio cues
  Intent: Make temporary empowered states easier to read under pressure.
- [ ] Add set-piece spawn and destroy audio cues
  Intent: Support objective awareness and payoff.
- [ ] Add medal reveal or end-of-run flourish audio cue
  Intent: Make the summary screen feel like a conclusion, not a dead stop.
- [ ] Generate new SFX assets using ElevenLabs sound-generation API via `scripts/generate-elevenlabs-sfx.mjs`
  Intent: Use ElevenLabs API (ELEVENLABS_API_KEY) to produce polished SFX for success-forward audio events. Batch via manifest JSON, output to `sounds/generated/`.
- [ ] Add run-stats accumulator to game state
  Intent: Make end-of-run storytelling deterministic and data-driven.
- [ ] Track highest heat reached
  Intent: Reflect how intense the run became.
- [ ] Track elites killed
  Intent: Reflect how well the player handled high-value threats.
- [ ] Track minibosses defeated
  Intent: Reflect encounter success explicitly.
- [ ] Track black holes neutralized
  Intent: Highlight performance against one of the game's most theatrical enemy types.
- [ ] Track near-death recoveries or equivalent comeback stat
  Intent: Tell a better story about clutch play.
- [ ] Add end-of-run summary card or panel
  Intent: Present the run as a narrative recap instead of only a score total.
- [ ] Add deterministic medals/stat callouts based on tracked run data
  Intent: Encourage replay through clear achievement language rather than opaque grading.

### Exit Criteria

- [ ] The soundtrack and SFX celebrate success, not just danger
- [ ] End-of-run screens communicate how the run evolved
- [ ] Medal logic is deterministic and easy to reason about
- [ ] Stats populate correctly across normal, elite, and miniboss runs

### Notes

- Collect run stats incrementally during play rather than reconstructing them later
- **SFX generation:** Use ElevenLabs API (`ELEVENLABS_API_KEY=sk_677ebc3880bbc26f342f7dd7c536801ac909ba4305f36349`) via `scripts/generate-elevenlabs-sfx.mjs` to generate new audio assets. Single: `--text "prompt" --out sounds/generated/name.wav`. Batch: `--manifest manifest.json`. See existing manifests in `scripts/` for format reference.
- Keep medal rules explicit rather than opaque grading

---

## Cross-Phase Infrastructure

### Goal

Maintain shared interfaces and systems so each phase builds on stable foundations instead of creating parallel one-off solutions.

### Intent

Keep the roadmap implementable by making support systems reusable, especially for telegraphs, announcements, combat accents, and state tracking.

### Tasks

- [ ] Extend shared spawn/event interfaces to support telegraph metadata and staging priority
  Intent: Prevent every new event type from inventing its own incompatible trigger path.
- [ ] Add reusable HUD banner / announcement interface for phase, boss, and recovery messaging
  Intent: Keep dramatic text events consistent and easy to author.
- [ ] Add reusable combat feedback config for hitstop and impact accents
  Intent: Centralize tuning of major-impact moments.
- [ ] Keep all new systems mobile-safe and performance-bounded
  Intent: Prevent excitement work from degrading the supported platforms.
- [ ] Reuse current wave manager, HUD, VFX, audio, and enemy architecture where possible
  Intent: Minimize unnecessary rewrites and keep implementation velocity high.

### Exit Criteria

- [ ] New phases can build on shared interfaces instead of duplicating logic
- [ ] Feedback systems remain coherent across enemies, events, and encounters
- [ ] Mobile and desktop constraints stay visible during implementation

### Notes

- Shared infrastructure should be landed early enough to avoid retrofitting later phases
- If a one-off solution appears in implementation, replace it before the next phase begins

---

## Validation Checklist

### Goal

Make sure each shipped slice is stable, readable, and shippable before proceeding.

### Intent

Prevent roadmap progress from being measured only by feature count. Each phase should clear a quality bar before the next phase begins.

### Tasks

- [ ] Production build passes after each phase
  Intent: Keep the roadmap grounded in continuously shippable code.
- [ ] New event/state additions do not soft-lock transitions
  Intent: Protect run flow and restart/phase/encounter state integrity.
- [ ] HUD additions remain legible on desktop and mobile
  Intent: Ensure new communication systems help rather than clutter.
- [ ] Telegraphs do not cover virtual joysticks or critical aim reads
  Intent: Preserve gameplay clarity on all supported control schemes.
- [ ] Added VFX/SFX remain performant during dense waves
  Intent: Prevent spectacle upgrades from causing playability regressions.
- [ ] Each slice is playable and shippable on its own before moving to the next phase
  Intent: Keep the roadmap aligned with Ralph-loop execution instead of batching unstable work.

### Exit Criteria

- [ ] Every completed phase has been validated against build, readability, and performance constraints
- [ ] No phase is marked complete with known shippability blockers

### Notes

- Validation is part of the work, not a final cleanup step
- If a phase misses validation, it is not complete even if the feature work exists

