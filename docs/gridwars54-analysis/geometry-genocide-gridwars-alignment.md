# Death by Geometry / Grid Wars Alignment

This document translates the generated manifests in this folder into concrete rewrite and port decisions.

Primary source bundle:
- `docs/GridWars54/images.bmx`
- `docs/GridWars54/sound.bmx`
- `docs/GridWars54/gridwars.bmx`
- `docs/GridWars54/music/*.it`

Current Death by Geometry references:
- `web/src/game.ts`
- `web/src/spawner/spawn-patterns.ts`
- `web/src/config.ts`
- `web/src/core/audio.ts`

## Direct matches

- Pinwheel is already a close match. Grid Wars `pinkpinwheel` maps cleanly to GG `pinwheel`, and the family is active from tutorial onward.
- Black Hole has a direct thematic match. Grid Wars uses `redcircle` for Dwight the Black Hole; GG already has `blackhole`, but it is tuned much more like an elite hazard than a standard roster member.
- Square splitting is conceptually present. Grid Wars separates Shy the Square and Cubie the Cube; GG already has `square` and `square2`, so the structural behavior exists even if the naming and scoring do not.

## Near matches

- Dimmy the Diamond is closest to GG `rhombus`. The gameplay role is close enough that this is mostly a naming, scoring, and sprite-style question.
- The original player and bullet are sprite-based (`whiteplayer`, `yellowshot`), while GG currently renders both procedurally. This is an aesthetic divergence, not a missing system.
- Grid Wars powerups are fully recoverable from the atlas and source mapping, but GG currently uses score-driven weapon progression instead of the original collectible-heavy upgrade identity.

## Missing or degraded original roster

- Seeker is present in GG only as `circle`, a child spawned from BlackHole overload. To feel like Grid Wars again, Circle should become an active pool enemy.
- Snake has dedicated source art (`snakehead`, `snaketail`) and dedicated audio cues (`snake1.wav`, `snakehit.wav`, `tailhit.wav`), but no active GG counterpart exists.
- Interceptor has dedicated art (`redclone`) and spawn identity, but no active GG counterpart exists.
- Triangle exists in GG source as an unwired enemy. This is the easiest missing family to restore because code scaffolding is already there.
- Butterfly has original art (`indigotriangle`) and dedicated SFX naming, but no GG counterpart exists.

## Audio alignment

- Grid Wars ships 37 WAV files plus 3 active Impulse Tracker modules and one older module revision.
- GG currently ships an 11-SFX legacy/core pack in `web/src/config.ts` and supplements it with generated MP3s plus procedural kill signatures in `web/src/core/audio.ts`.
- If the goal is stronger Grid Wars fidelity, the lowest-risk change is not replacing GG audio wholesale. Add an optional "Grid Wars source audio" mode and map original spawn / hit / death cues by enemy family.
- `click.wav` and `pop1.wav` appear archival but unused in the examined Grid Wars source.
- `shieldwarning.wav` is referenced by source but missing from the recovered archive, so any faithful port will need either reconstruction or a substitute.

## Music alignment

- The original soundtrack is recoverable at composition level because the source bundle contains `.it` tracker modules, not only rendered audio.
- GG currently uses adaptive procedural music, which is architecturally different but still valuable. Do not throw it away just to chase fidelity.
- The best compromise is a dual-mode system:
  1. Default GG procedural/adaptive soundtrack.
  2. Optional Grid Wars soundtrack mode backed by module playback or offline renders derived from `Theme0.it`, `Theme1.it`, and `Theme2.it`.

## Recommended port order

1. Re-enable Triangle in GG.
Reason: source code already exists, the original art family is clear, and it restores a major missing Grid Wars identity cheaply.

2. Promote Circle back into active spawn pools.
Reason: Seeker is a core original family and requires less new implementation than entirely new enemies.

3. Implement Snake.
Reason: the source bundle gives both visual and audio references, making it one of the highest-confidence faithful restorations.

4. Implement Interceptor.
Reason: it is a clearly distinct original family and increases authenticity more than adding another abstract GG-exclusive fractal enemy.

5. Add optional Grid Wars soundtrack playback.
Reason: the modules are already parsed in `gridwars54-music-manifest.json`; this unlocks a high-fidelity mode without sacrificing GG's procedural system.

## Rewrite guidance

- Treat `gridwars54-asset-manifest.json` as the source inventory for sprite, atlas, and WAV recovery.
- Treat `gridwars54-music-manifest.json` as the source inventory for tracker-module reconstruction. It contains sample names, order lists, pattern rows, and event summaries.
- Treat `gridwars54-alignment.json` as the machine-readable mapping for port planning and tooling.
- Preserve GG-only systems when they add value:
  - scrolling arena
  - adaptive procedural music
  - heat / recovery spectacle
  - fractal/topology expansion enemies
- Separate "source-faithful mode" from "modern GG mode" wherever possible. That keeps the port honest without flattening the current game's identity.
