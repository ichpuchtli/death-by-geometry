---
name: elevenlabs-game-audio
description: Use when generating or iterating Death by Geometry sound effects or menu music with ElevenLabs, including replacements for existing WAVs, active enemy form/destroy pairs, procedural audio.ts cues, and stitched menu themes.
---

# ElevenLabs Game Audio

Use this skill when the task is to generate, revise, or batch-run audio assets for this repo with ElevenLabs.

This project already has the workflow pieces. Prefer using them instead of rebuilding prompts or shell commands from scratch.

## Before You Start

1. Confirm `ELEVENLABS_API_KEY` is available in the shell session.
2. Read [CLAUDE.md](../../../../CLAUDE.md) audio notes only if you need the current source-of-truth summary.
3. Keep outputs in `sounds/generated/` unless the user explicitly asks to replace shipped assets.
4. Do not wire generated assets into gameplay unless asked.

## Core Generator

Use:

`node scripts/generate-elevenlabs-sfx.mjs`

Or via npm:

`npm run sfx:elevenlabs -- --manifest <manifest>`

Single prompt mode is supported, but manifest mode is preferred for repeatability.

## Existing Prompt Packs

Use the smallest matching manifest:

- `scripts/elevenlabs-sfx-jobs-existing-sounds.json`
  Use for variants/replacements of the shipped legacy/core sounds in `sounds/`.

- `scripts/elevenlabs-sfx-jobs-unit-form-and-destroy.json`
  Use for active enemy family formation/destruction pairs:
  `rhombus`, `square`, `pinwheel`, `sierpinski`, `blackhole`.

- `scripts/elevenlabs-procedural-sfx.json`
  Use for discrete procedural cues from `web/src/core/audio.ts`.
  This covers kill signatures, phase transition, elite arrive/kill, telegraph warning, recovery start/expire, and black-hole death.

- `scripts/elevenlabs-menu-soundtracks.json`
  Use for the long-form menu tracks that extend `sounds/start.wav` and `sounds/die.wav`.

## Menu Soundtrack Workflow

Generate the six source segments:

`npm run sfx:elevenlabs -- --manifest scripts/elevenlabs-menu-soundtracks.json`

Then stitch them into final 1min+ tracks:

`npm run sfx:stitch-menus`

Outputs:

- `sounds/generated/menu/start_menu_theme_elevenlabs_v1.mp3`
- `sounds/generated/menu/gameover_menu_theme_elevenlabs_v1.mp3`

## Prompt Tuning Rules

- Keep prompts faithful to gameplay role first, filename second.
- When replacing procedural cues, anchor prompts to the current pitch/envelope notes already encoded in `web/src/core/audio.ts`.
- For "close to existing" iterations, increase `promptInfluence` toward `0.6-0.7`.
- For broader exploration, lower `promptInfluence` toward `0.45-0.55`.
- ElevenLabs short effects must still respect its minimum duration limits; do not set sub-`0.5s` durations.

## Project Conventions

- Generated exploration assets belong in `sounds/generated/`.
- Treat generated `.mp3` files as audition assets first.
- Only convert or swap them into shipped `/sounds` assets after explicit user approval.
- If you change the workflow, manifests, or helper scripts, update [CLAUDE.md](../../../../CLAUDE.md) in the same task.

## When You Need New Prompts

Base them on these repo truths:

- Legacy shipped sound roles: [PRD.md](../../../../PRD.md)
- Current audio implementation and procedural contours: [web/src/core/audio.ts](../../../../web/src/core/audio.ts)
- Existing generated manifests in `scripts/`

Keep new prompts concise, event-specific, and mix-aware.
