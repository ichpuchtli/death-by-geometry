# Death by Geometry Art Direction Review

## Overall Verdict

The current web build has a clear and mostly coherent **neon-vector arcade** identity. Its strongest choices are the procedural line-art shapes, the black negative-space arena, the reactive grid, and the heavy bloom/trail treatment that gives motion real spectacle. At its best, the game feels like a confident Geometry Wars homage with enough mathematical personality to justify its own name. The main weakness is not lack of style, but **style compression**: too much of the non-combat presentation collapses into the same green monospace language, which makes parts of the game feel closer to a polished prototype than a fully authored world.

## Key Findings

### 1. The combat layer has a stronger identity than the UI layer

The gameplay visuals already operate with a broad, intentional palette: green player, red bullets, blue/cyan rhombus and black hole accents, magenta pinwheels, gold fractals, and a purple-blue-pink reactive grid. That creates a good arcade spectrum and supports the "neon chaos" intent in [web/src/config.ts](/Users/sam/src/geometry-genocide/web/src/config.ts#L17) and [web/src/config.ts](/Users/sam/src/geometry-genocide/web/src/config.ts#L47). By contrast, the menu, HUD, loading, and much of the settings UI rely on nearly the same green monospace glow treatment everywhere in [web/src/ui/hud.ts](/Users/sam/src/geometry-genocide/web/src/ui/hud.ts#L57) and [web/src/ui/settings-panel.ts](/Users/sam/src/geometry-genocide/web/src/ui/settings-panel.ts#L213). The result is functional, but visually flatter and less authored than the playfield.

### 2. The procedural vector look is the right foundation for this game

The strongest art-direction decision is committing to **shape grammar over texture detail**. The player silhouette in [web/src/entities/player.ts](/Users/sam/src/geometry-genocide/web/src/entities/player.ts#L22) reads as a sharp pincer rather than a generic triangle, and the black hole in [web/src/entities/enemies/blackhole.ts](/Users/sam/src/geometry-genocide/web/src/entities/enemies/blackhole.ts#L94) feels materially different from the line-loop enemies because it becomes a plasma mass with orbiting shards and instability rings. That contrast gives the roster hierarchy and prevents the game from looking like a uniform set of abstract outlines.

### 3. Motion polish is carrying a lot of the game's appeal

From a `game-designer` perspective, the best stylistic choices are the ones that create feel through animation principles rather than raw complexity: the player smear in the trail screenshots, the bullet bead spacing, the pulsing enemy glows, and the black-hole wobble all add overlap, exaggeration, and secondary action. The screenshots in `tests/screenshots/12-visual-trails.png` and `tests/screenshots/06-mid-soak.png` show that the game becomes much more convincing once movement and trails are present. Static frames undersell it; motion is doing the heavy lifting.

### 4. The current UI language undersells the mathematical/sci-fi premise

The gameplay world suggests cosmic geometry, but the front-end framing is mostly "green terminal with glow." The title screen in `tests/screenshots/02-menu-screen.png` is clean and readable, but it does not communicate the same visual richness as the grid, starfield, and enemy palette. The repo even contains a stronger, more distinctive gradient wordmark in [gfx/logo.png](/Users/sam/src/geometry-genocide/gfx/logo.png), but the active menu instead renders plain green text in [web/src/ui/hud.ts](/Users/sam/src/geometry-genocide/web/src/ui/hud.ts#L137). This creates a gap between available branding language and shipped presentation.

### 5. Some visual systems are competing instead of collaborating

The grid, trails, bloom, starfield, HUD text, and enemy glows are all individually on-theme, but they are not yet fully orchestrated into a visual hierarchy. The starfield introduces galaxy and nebula colors in [web/src/renderer/starfield.ts](/Users/sam/src/geometry-genocide/web/src/renderer/starfield.ts#L54), while the grid already carries purple, cyan, and pink stress colors in [web/src/config.ts](/Users/sam/src/geometry-genocide/web/src/config.ts#L196). In isolation those are good choices; together they risk broadening the palette faster than the rest of the art direction can frame it. The game still reads, but it is close to the threshold where "neon chaos" becomes "everything glows."

### 6. The settings panel looks engineered, not art-directed

The settings surface is admirably consistent and readable, but it looks like a developer console attached to a stylish game, not a natural part of the same product. The monochrome text, thin borders, and dense slider stack in [web/src/ui/settings-panel.ts](/Users/sam/src/geometry-genocide/web/src/ui/settings-panel.ts#L213) make sense for debugging, but they do not extend the playfield's stronger visual personality. For an internal tuning tool this is fine. For a player-facing feature, it weakens the premium feel.

## What To Preserve

- Keep the **black-field + faint grid + bright vector shapes** foundation. It gives the game clarity, speed, and arcade legitimacy.
- Keep the player/enemy procedural silhouette approach. It is the right match for a geometry-themed shooter.
- Keep the aggressive bloom and trails, but treat them as signature effects rather than applying the same glow logic to every UI surface.
- Keep the black hole treatment as a benchmark for future enemy art direction. It has depth, motion, hierarchy, and a clear fantasy.

## Recommended Art-Direction Changes

### 1. Differentiate the UI from the HUD without abandoning the arcade look

Retain the monospace influence, but stop using one green-glow treatment for title, HUD, prompts, loading, and settings. Give the menu and meta screens their own palette logic, likely borrowing from the grid/logo spectrum so the front-end feels like the same universe rather than a temporary shell.

### 2. Promote a deliberate color hierarchy

Reserve green primarily for the player and core state feedback. Let the arena and meta surfaces lean more on cyan, violet, and magenta. This would make the player feel more special and reduce the sense that every non-enemy surface belongs to the same semantic tier.

### 3. Use the existing logo and mathematical theme more aggressively

The current title presentation is clean but generic. Pull visual cues from [gfx/logo.png](/Users/sam/src/geometry-genocide/gfx/logo.png), enemy design motifs, or the grid geometry so the opening screen signals "cosmic mathematics under pressure" rather than just "retro shooter."

### 4. Establish effect budgets per layer

Decide what owns spectacle in each layer:
- Background: starfield and grid should set atmosphere
- Gameplay: trails, flashes, and enemy glows should sell motion and impact
- UI: should remain readable and selective, not equally luminous

That separation will make the chaos feel composed instead of uniformly saturated.

### 5. Rework player-facing settings into a branded control surface

If settings are meant to stay visible to players, turn the current panel into a diegetic or stylized "systems console" rather than a debug form. The current structure is fine; the issue is presentation, not information architecture.

## Bottom Line

This game already has a viable art direction. The combat space is expressive, readable, and often attractive in motion. The next step is not adding more effects; it is **curating the presentation around what already works** so the menus, overlays, and utility screens feel as authored as the arena itself.
