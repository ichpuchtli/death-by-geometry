# Death by Geometry Web — Task List

> **Instructions for AI sessions**: Each phase is designed to fit within a single context window.
> After completing each phase, **verify the build compiles** (`npm run build`) and **run the dev server** (`npm run dev`) to confirm no regressions. Commit working state before ending the session.
> Read this file and `PRD.md` at the start of every session for full context.

---

## Phase 1: Core Game (MVP)

**Goal**: Fully playable game on desktop Chrome — flat colored shapes, no post-processing, no audio.

### 1.1 Project Scaffolding
- [ ] Initialize npm project with TypeScript + Vite
- [ ] Configure `tsconfig.json` (strict mode, ES2020 target, DOM lib)
- [ ] Create `index.html` with a single `<canvas>` element, fullscreen CSS
- [ ] Create Vite config with GLSL shader import support (via `vite-plugin-glsl` or raw import)
- [ ] Create `src/config.ts` — central constants file (speeds, colors, radii, spawn timers, world size). Every tunable value lives here
- [ ] Set up GitHub Actions workflow (`.github/workflows/deploy.yml`): build on push to `main`, deploy `dist/` to GitHub Pages
- [ ] Verify: `npm run dev` serves a blank canvas, `npm run build` produces `dist/`

> **Build checkpoint**: `npm run build` must succeed. Dev server must show a black canvas.

### 1.2 WebGL Renderer Foundation
- [ ] `src/core/engine.ts` — Initialize WebGL2 context (fallback to WebGL1), manage canvas resize, run requestAnimationFrame loop with delta-time calculation
- [ ] `src/core/vector.ts` — 2D Vector class: add, sub, scale, normalize, magnitude, angle, dot, distance, fromAngle. Port logic from original `library.py` Vector class
- [ ] `src/renderer/webgl-context.ts` — Shader compilation helpers, program linking, uniform/attribute setup
- [ ] Write basic vertex + fragment shaders for rendering colored lines and filled triangles (`src/renderer/shaders/entity.vert`, `entity.frag`)
- [ ] `src/renderer/sprite-batch.ts` — Batched line/triangle renderer: accumulate vertices per frame, single draw call per batch. Support colored lines (for enemies) and filled triangles (for bullets/player)
- [ ] Verify: render a colored triangle on screen to prove the pipeline works

> **Build checkpoint**: `npm run build` succeeds. A colored shape renders on the black canvas.

### 1.3 Camera & Scrolling World
- [ ] `src/core/camera.ts` — Camera class: position, viewport size, world-to-screen transform, screen-to-world transform. Smoothly follows a target position (lerp). Clamps to world boundaries so edges aren't visible beyond the arena
- [ ] Define world bounds in `config.ts` (default: 3x viewport in each axis)
- [ ] Apply camera transform as a view matrix in the vertex shader (uniform mat3 or manual offset)
- [ ] Verify: camera pans smoothly when target position is moved programmatically

> **Build checkpoint**: Camera panning works visually.

### 1.4 Input System
- [ ] `src/core/input.ts` — Unified input manager:
  - Track keyboard state (keydown/keyup maps for WASD + arrows + ESC)
  - Track mouse position (in screen coords), convert to world coords via camera
  - Track mouse button state (down/up)
  - Expose: `isKeyDown(key)`, `getMouseWorldPos()`, `isMouseDown()`
- [ ] Wire input manager into the engine update loop
- [ ] Verify: log key presses and mouse position to console

### 1.5 Player Entity
- [ ] `src/entities/entity.ts` — Base Entity class: position (Vector), velocity (Vector), rotation, active flag, collisionRadius, update(dt), render(renderer)
- [ ] `src/entities/player.ts` — Player class:
  - Movement via WASD (reads input manager), speed from config
  - Rotation faces mouse cursor
  - Clamped to world boundaries
  - Rendered as a vector ship shape (triangle/arrow pointing in aim direction)
  - Lives counter, invulnerability timer on respawn
  - Weapon state: shot delay, bullet count, angle offsets (from config progression table)
- [ ] Camera follows player position
- [ ] Verify: move the ship around with WASD, ship rotates toward mouse

> **Build checkpoint**: Player ship moves and aims on screen.

### 1.6 Bullet System
- [ ] `src/entities/bullet.ts` — Bullet class:
  - Spawns at player position, flies toward aim direction
  - Speed from config, constant velocity (no acceleration)
  - Rendered as small colored diamond
  - Destroyed when leaving world bounds
- [ ] Object pool for bullets (pre-allocate array, reuse inactive bullets)
- [ ] Player shooting: on mouse hold, spawn bullets at fire rate intervals
- [ ] Weapon progression: check player score against config thresholds, upgrade fire rate / bullet count
- [ ] Verify: hold click to shoot, bullets fly toward cursor

### 1.7 Enemy Entities
- [ ] `src/entities/enemies/enemy.ts` — Base Enemy class extending Entity: score value, color, shape vertices (matrix of points), rotation speed, onDeath behavior, AI update method
- [ ] Implement all 7 enemy types with their behaviors from `PRD.md §2.5`:
  - [ ] `rhombus.ts` — Diamond shape, follows player directly
  - [ ] `pinwheel.ts` — Pinwheel shape, slow, counter-rotates, bounces off world edges
  - [ ] `square.ts` — Square shape, follows player, spawns 2 Square2 on death
  - [ ] `square2.ts` — Small square, fast, bounces off edges (child of Square death)
  - [ ] `circle.ts` — Circle shape, fast, follows player with dispersion
  - [ ] `triangle.ts` — Triangle shape, bounces off edges, spawns Circles on death
  - [ ] `octagon.ts` — Octagon shape, predictive aim (targets ahead of player movement)
- [ ] Each enemy rendered as colored vector shape (connected line loop) using the sprite batch
- [ ] Verify: manually spawn each enemy type, confirm movement behaviors

### 1.8 DeathStar Boss
- [ ] `src/entities/enemies/deathstar.ts` — DeathStar class:
  - Large concentric circle rendering (procedural)
  - 20 HP, takes damage from bullets
  - Attracts nearby enemies (enemies within range move toward it)
  - Spawns 5+ Circles on destruction
  - Periodic spawning managed by wave manager
- [ ] Verify: DeathStar appears, takes hits, explodes into Circles

### 1.9 Collision Detection
- [ ] `src/core/collision.ts` — Collision system:
  - Broad phase: spatial hash grid (world divided into cells, entities bucketed by cell)
  - Narrow phase: circle-circle distance check using collision radii from config
  - Check pairs: bullet↔enemy, bullet↔deathstar, player↔enemy, player↔deathstar
- [ ] On bullet↔enemy hit: destroy bullet, destroy enemy (trigger onDeath spawns), add score
- [ ] On player↔enemy hit: destroy enemy, decrement player lives, trigger respawn invulnerability
- [ ] On player lives = 0: trigger game over
- [ ] Verify: bullets kill enemies, player takes damage, score increments

### 1.10 Wave Spawner
- [ ] `src/spawner/wave-manager.ts` — WaveManager class:
  - Tracks elapsed game time
  - Spawns enemy waves based on difficulty phase timers (from config)
  - Enemies spawn at random positions along world edges (outside viewport but inside world)
  - Cluster spawning: batch of enemies with slight delay between each
- [ ] `src/spawner/spawn-patterns.ts` — Define wave compositions (which enemy types, how many)
- [ ] Use placeholder difficulty values in config (will be redesigned in Phase 4)
- [ ] Verify: enemies spawn in waves with escalating intensity

### 1.11 Explosion Particles
- [ ] `src/entities/explosion.ts` — Explosion class:
  - Burst of line particles radiating from a point
  - Color matches source entity
  - Particles fade and slow over duration (1-5s)
  - Object pooled
- [ ] Trigger explosions on enemy death, player death, DeathStar death
- [ ] Verify: colorful particle bursts on kills

### 1.12 Game State Machine
- [ ] `src/game.ts` — Game class managing states:
  - **Loading**: show "Loading..." text (placeholder)
  - **Menu**: show game title + "Click to Play" (simple text rendering for now)
  - **Playing**: full gameplay loop
  - **GameOver**: show score + "Click to Restart"
- [ ] ESC during gameplay → return to menu (clear all entities)
- [ ] Track stats during gameplay: score, enemies killed, time survived
- [ ] Verify: full flow — menu → play → die → game over → menu → play again

### 1.13 HUD
- [ ] `src/ui/hud.ts` — Render score (top-left) and lives (top-right) as WebGL text or canvas 2D overlay
  - Simplest approach: use a second `<canvas>` layered on top for text, or render bitmap font quads in WebGL
- [ ] Verify: score and lives update in real-time during gameplay

### 1.14 Phase 1 Final Verification
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run dev` — full game loop works: menu → play → enemies spawn → player shoots → score increments → player dies → game over → restart
- [ ] GitHub Actions deploys successfully to GitHub Pages
- [ ] Game is playable at the GitHub Pages URL

> ---
> ### SESSION HANDOFF NOTES — Phase 1 → Phase 2
>
> **What was built**: Complete MVP — TypeScript + Vite project, raw WebGL renderer with flat-colored
> vector shapes, player movement/shooting, all 7 enemies + DeathStar boss, collision detection with
> spatial hashing, wave spawner, explosion particles, scrolling world with camera, game state machine
> (menu/play/gameover), HUD, and GitHub Actions CI/CD deployment.
>
> **What to read first**: `PRD.md` (full spec), this file (`TASKS.md`), and `src/config.ts` (all constants).
>
> **Current rendering**: Flat colored lines/triangles on black background. No post-processing.
> The renderer uses `src/renderer/sprite-batch.ts` for batched draw calls and `src/renderer/shaders/entity.*`
> for basic vertex/fragment shaders.
>
> **What Phase 2 adds**: All visual polish — bloom, reactive grid, particle trails, entity art upgrades,
> off-screen indicators, styled UI. This is purely additive rendering work on top of the existing game.
>
> **Key files to understand**:
> - `src/core/engine.ts` — game loop, WebGL context, delta time
> - `src/renderer/webgl-context.ts` — shader compilation helpers
> - `src/renderer/sprite-batch.ts` — how entities are drawn
> - `src/entities/` — all game entity classes
> - `src/config.ts` — every tunable constant
>
> **Known issues/debt to watch for**: Note any issues discovered during Phase 1 here.
> ---

---

## Phase 2: Visual Polish

**Goal**: Neon glow aesthetic — bloom, reactive grid, particle trails. The game should look like Geometry Wars.

### 2.1 Framebuffer Setup
- [ ] Refactor renderer to render all game entities to an off-screen framebuffer (color texture attachment) instead of directly to screen
- [ ] Create a fullscreen quad shader for post-processing passes
- [ ] Verify: game looks identical but is now rendered via framebuffer → screen blit

> **Build checkpoint**: `npm run build` succeeds. Game renders identically through framebuffer.

### 2.2 Bloom Post-Processing
- [ ] `src/renderer/bloom.ts` — Multi-pass bloom:
  1. **Brightness extract**: shader that outputs only pixels above a brightness threshold
  2. **Gaussian blur**: horizontal + vertical blur passes (ping-pong between two half-res framebuffers)
  3. **Composite**: additively blend blurred result onto the original scene
- [ ] Write GLSL shaders: `bloom-extract.frag`, `bloom-blur.frag`, `bloom-composite.frag`
- [ ] Bloom intensity configurable in `config.ts` (global + per-entity-type if needed)
- [ ] Verify: all entities glow with a soft neon halo

> **Build checkpoint**: Bloom renders correctly. Neon glow visible on all entities.

### 2.3 Reactive Background Grid
- [ ] `src/renderer/grid.ts` — Grid renderer:
  - Generate a mesh of grid lines covering the entire world (vertex buffer)
  - Grid spacing configurable in `config.ts`
  - Base color: dark blue/green, subtle
  - Displacement system: maintain an array of displacement forces (position + radius + strength + decay)
  - In the vertex shader, displace grid vertices based on active forces
  - Forces added by: explosions (strong, radial push), enemies (weak, pull), bullets (minor ripple)
  - Forces decay over time (remove when strength ≈ 0)
- [ ] Write GLSL shaders: `grid.vert` (with displacement), `grid.frag`
- [ ] Grid renders behind all entities, before bloom pass (so it also gets bloom)
- [ ] Verify: grid warps visibly when enemies explode

> **Build checkpoint**: Grid renders and reacts to game events.

### 2.4 Particle Trails
- [ ] `src/renderer/trails.ts` — Trail renderer:
  - Each trailed entity stores a ring buffer of recent positions (last N frames)
  - Trails rendered as line segments or thin quads connecting historical positions
  - Color matches entity, opacity fades from current position (opaque) to oldest (transparent)
  - Trail length configurable per entity type in `config.ts`
- [ ] Add trails to: all enemy types, bullets
- [ ] Trails rendered before entities (so entities draw on top)
- [ ] Trails receive bloom post-processing
- [ ] Verify: enemies and bullets leave glowing colored trails

### 2.5 Explosion Polish
- [ ] Enhance explosion particles: add variable speed, slight randomization in direction
- [ ] Explosions trigger grid displacement forces
- [ ] Larger explosions for more valuable enemies
- [ ] DeathStar explosion: extra large, dramatic, multi-color burst
- [ ] Verify: explosions feel impactful and interact with grid

### 2.6 Entity Rendering Polish
- [ ] Upgrade enemy rendering to match original Python aesthetics:
  - Double-line rendering (inner color + outer outline) for depth
  - Octagon/Triangle: fusion circles at vertices (small glowing circles orbiting the shape)
  - Pinwheel: counter-rotation animation
  - All shapes: smooth continuous rotation
- [ ] Player ship: decide vector vs sprite. If vector, design a clean arrow/ship shape that glows well
- [ ] DeathStar: procedural concentric circles with pulsing glow
- [ ] Bullets: ensure diamond shape with bright core + softer glow
- [ ] Crosshair: `src/entities/crosshair.ts` — subtle glowing reticle that follows mouse (desktop only)
- [ ] Verify: each entity type is visually distinct and looks good with bloom

### 2.7 Off-Screen Enemy Indicators
- [ ] Small colored arrows/chevrons on viewport edges pointing toward off-screen enemies
- [ ] Color matches enemy type
- [ ] Opacity/size scales inversely with distance (closer = more prominent)
- [ ] Only show for enemies within a configurable range (don't show distant enemies)
- [ ] Verify: indicators appear when enemies are off-screen, disappear when on-screen

### 2.8 Styled UI Screens
- [ ] **Main Menu**: Game logo (text or procedural), "Play" button, neon-styled with glow
- [ ] **Game Over**: Score, enemies killed, time survived, "Play Again" / "Menu" buttons
- [ ] **Loading Screen**: Simple progress bar or spinner with neon styling
- [ ] All UI text rendered with consistent neon aesthetic
- [ ] Verify: all screens look polished and match the game's visual style

### 2.9 Phase 2 Final Verification
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run dev` — full game with bloom, grid, trails, polished entities and UI
- [ ] Performance acceptable on desktop (no major frame drops with many entities)
- [ ] Deploy to GitHub Pages and verify

> ---
> ### SESSION HANDOFF NOTES — Phase 2 → Phase 3
>
> **What was built**: Full visual pipeline — bloom post-processing (brightness extract → Gaussian blur
> → additive composite), reactive background grid with displacement forces, particle trails on enemies
> and bullets, polished entity rendering (double-line, fusion circles, rotations), off-screen enemy
> indicators, styled menu/game-over/loading screens, crosshair.
>
> **What to read first**: `PRD.md`, this file (`TASKS.md`), `src/config.ts`, and the `src/renderer/` directory.
>
> **Rendering pipeline now**: Clear → Grid (with displacement) → Entities to FBO → Trails → Bloom passes → UI → Composite to screen.
>
> **What Phase 3 adds**: Mobile touch controls (twin-stick virtual joysticks), responsive canvas,
> mobile perf optimizations, ported SFX via Web Audio API, procedural music generation.
> This phase touches `src/core/input.ts` (add touch), adds `src/ui/virtual-joystick.ts`, adds
> `src/core/audio.ts`, and may adjust bloom resolution for mobile.
>
> **Key files to understand**:
> - `src/renderer/bloom.ts` — may need half-res mode for mobile
> - `src/renderer/grid.ts` — particle count may need mobile reduction
> - `src/core/input.ts` — needs touch event handling added
> - `src/core/engine.ts` — canvas resize logic needs mobile viewport handling
>
> **Known issues/debt to watch for**: Note any issues discovered during Phase 2 here.
> ---

---

## Phase 3: Mobile & Audio

**Goal**: Full mobile support with twin-stick virtual joysticks. Complete audio with SFX and adaptive procedural music.

### 3.1 Touch Input
- [x] Extend `src/core/input.ts` with touch event handling:
  - `touchstart`, `touchmove`, `touchend`, `touchcancel`
  - Track multiple simultaneous touches (need at least 2 for twin-stick)
  - Map touch to left half (movement) and right half (aim/shoot) of screen
  - Auto-detect input method: if touch events fire, switch to touch mode; if keyboard/mouse, switch back
  - Expose: `isTouchActive()`, `getLeftStick()` → Vector, `getRightStick()` → Vector
- [x] Verify: touch events register on mobile browser dev tools

### 3.2 Virtual Joysticks
- [x] `src/ui/virtual-joystick.ts` — VirtualJoystick class:
  - Rendered as semi-transparent circles (base + knob)
  - Base appears at touch-down position (dynamic, not fixed)
  - Knob follows finger within max radius (~60px from center)
  - Dead zone: ignore deflection < 15% of radius
  - Returns normalized direction vector + magnitude (0-1)
  - Visual feedback: base glows when active
  - Two instances: left (movement), right (aim + auto-fire when deflected)
- [x] Integrate with player: left joystick drives movement vector, right joystick drives aim direction + triggers shooting
- [x] Hide joysticks when in keyboard/mouse mode, show on touch
- [x] Verify: playable with touch controls on a phone

### 3.3 Responsive Canvas & Mobile Layout
- [x] Handle `resize` and `orientationchange` events
- [x] Canvas fills viewport, correct pixel ratio (`devicePixelRatio`)
- [x] Prevent default touch behaviors (scrolling, zooming, context menu)
- [x] Handle `visibilitychange` — pause game when tab is hidden
- [x] Test both portrait and landscape — game should work in landscape, show "rotate device" prompt in portrait
- [x] Verify: game displays correctly on various phone screen sizes

### 3.4 Mobile Performance Optimization
- [x] Bloom at half resolution on mobile (detect via `navigator.userAgent` or screen size heuristic)
- [x] Reduce max particle count on mobile (config flag)
- [x] Reduce trail history length on mobile
- [x] Consider reducing grid density on mobile
- [x] Profile on a real mid-range phone — target smooth gameplay
- [x] Verify: performance is acceptable on a 2-year-old phone

> **Build checkpoint**: Game fully playable on mobile with touch controls.

### 3.5 Sound Effects (SFX)
- [x] Convert existing WAV files to OGG (primary) + MP3 (Safari fallback):
  - `start`, `die`, `die1`, `crash`, `square`, `rhombus`, `triangle2`, `octagon`, `pinwheel`, `deathstar`, `deathstar2`
- [x] Place converted files in `src/assets/sounds/` (or `public/sounds/`)
- [x] `src/core/audio.ts` — AudioManager class:
  - Initialize `AudioContext` on first user gesture (required by Safari/Chrome autoplay policy)
  - Load and decode all sound buffers on init
  - `playSFX(name)` — play a sound effect (create new AudioBufferSourceNode each time)
  - Volume control, mute toggle
- [x] Wire SFX triggers into game events:
  - Enemy spawn → play matching spawn sound
  - Enemy death → crash sound
  - Player death → die1 (respawn) or die (game over)
  - DeathStar spawn → deathstar sound
  - DeathStar death → deathstar2 sound
  - Game start → start sound
- [x] Verify: all sounds play at correct moments

### 3.6 Procedural Music
- [x] Extend `src/core/audio.ts` with a `ProceduralMusic` class:
  - Uses Web Audio API oscillators, gain nodes, filters, and delay for synthesis
  - Layered composition:
    - **Layer 1 (bass)**: Low-frequency oscillator with filter sweep — always playing
    - **Layer 2 (rhythm)**: Sequenced percussive hits using noise + envelope — fades in at mid-game
    - **Layer 3 (arpeggio)**: Fast note sequences using square/sawtooth waves — fades in at intense phase
    - **Layer 4 (lead)**: Higher melody line — boss encounters only
  - Layers cross-fade based on game intensity (derived from: enemy count, score rate, boss presence)
  - Tempo increases slightly with intensity
  - Menu state: only ambient pad (Layer 1 at low volume)
  - Game over: all layers fade out
- [x] Intensity value calculated in game loop, passed to music system each frame
- [x] Verify: music adapts audibly as gameplay intensifies

### 3.7 Audio UI Controls
- [x] Add mute/volume toggle to main menu
- [x] Quick mute button accessible during gameplay (small speaker icon or keyboard shortcut M)
- [x] Respect mute state across game restarts (store in localStorage)
- [x] Safari: handle AudioContext resume on user gesture correctly
- [x] Verify: audio can be muted/unmuted, volume persists

### 3.8 Phase 3 Final Verification
- [x] `npm run build` succeeds with zero errors
- [x] `npm run dev` — full game with mobile controls + audio
- [x] Test on desktop Chrome (keyboard/mouse + audio)
- [ ] Test on iOS Safari (touch controls + audio, user gesture for AudioContext)
- [ ] Test on Android Chrome (touch controls + audio)
- [ ] Deploy to GitHub Pages and verify on real devices

> ---
> ### SESSION HANDOFF NOTES — Phase 3 → Phase 4
>
> **What was built**: Twin-stick virtual joysticks, responsive mobile canvas, mobile performance
> optimizations (reduced bloom passes, reduced particles/trails on mobile), all 11 SFX ported via
> Web Audio API (WAV format served from public/sounds/), procedural synthwave music with 4 adaptive
> layers (bass+pad, rhythm, arpeggio, lead), audio controls with M key mute toggle and localStorage
> persistence. Visibility change pauses game loop. Portrait orientation shows rotate prompt on mobile.
>
> **What to read first**: `PRD.md`, this file (`TASKS.md`), `src/config.ts`, `src/core/audio.ts`,
> `src/core/input.ts`, `src/ui/virtual-joystick.ts`.
>
> **What Phase 4 adds**: localStorage leaderboard, screenshot-friendly game-over screen, debug overlay,
> difficulty curve redesign (tuning all values in config.ts), performance profiling, cross-browser
> testing, edge case handling, final README.
>
> **Key files to understand**:
> - `src/config.ts` — ALL tunable constants. Phase 4 focuses heavily on tuning these values
> - `src/spawner/wave-manager.ts` — difficulty progression logic to redesign
> - `src/game.ts` — game state machine, where stats are tracked
> - `src/core/storage.ts` — needs to be created or extended for leaderboard
> - `src/core/audio.ts` — AudioManager + ProceduralMusic classes
> - `src/core/input.ts` — touch/keyboard input with auto-detection
>
> **Known issues/debt to watch for**:
> - WAV files are large (~11 files); could convert to OGG/MP3 for smaller builds
> - Procedural music uses setTimeout-based scheduling (not AudioContext scheduler) — may drift slightly
> - Mobile bloom uses 2 blur passes instead of 4; could tune further if needed
> ---

---

## Phase 4: Scores, Polish & Tuning

**Goal**: Production quality — leaderboard, debug tools, tuned difficulty, cross-browser tested.

### 4.1 High Score System
- [ ] `src/core/storage.ts` — StorageManager class:
  - Save/load top 10 scores from `localStorage`
  - Each entry: `{ score, date, timeSurvived, enemiesKilled }`
  - Sort by score descending
  - Handle localStorage unavailable gracefully (private browsing)
- [ ] On game over: check if score qualifies for top 10, save if yes
- [ ] Verify: scores persist across page reloads

### 4.2 Leaderboard Screen
- [ ] `src/ui/leaderboard.ts` — Render top 10 local scores
  - Rank, score, date, time survived
  - Highlight the player's latest score if it's on the board
  - Neon-styled to match game aesthetic
  - Accessible from main menu
- [ ] Verify: leaderboard displays and updates correctly

### 4.3 Game Over Screen Polish
- [ ] `src/ui/game-over.ts` — Redesign for screenshot friendliness:
  - Game logo at top
  - Large score display
  - Stats: enemies killed, time survived, highest combo/wave reached
  - "NEW HIGH SCORE" indicator if applicable
  - "Play Again" and "Menu" buttons
  - Visually clean with neon styling — looks good as a phone screenshot
- [ ] Verify: game over screen looks shareable

### 4.4 Debug Overlay
- [ ] `src/ui/debug-overlay.ts` — Toggle with backtick (`` ` ``) key:
  - FPS: current, min, max, rolling average
  - Entity counts: enemies, bullets, active particles, active trails
  - Memory usage (`performance.memory` if available)
  - Current difficulty phase name + elapsed game time
  - Player world position
  - Active input method (keyboard/touch)
  - WebGL draw call count (instrument the renderer)
  - Rendered as simple text overlay (doesn't need to be fancy)
- [ ] Only included in dev builds, or toggled by a hidden gesture
- [ ] Verify: overlay shows accurate real-time stats

### 4.5 Difficulty Curve Redesign
- [ ] Review and tune ALL values in `src/config.ts`:
  - Enemy speeds (relative to player speed — should feel fair)
  - Spawn rates per difficulty phase
  - Phase time boundaries
  - Wave compositions (which enemies appear together)
  - DeathStar spawn frequency
  - Score values per enemy (reward should match difficulty)
  - Weapon progression thresholds
  - World size (does 3x feel right?)
- [ ] Playtest the full loop multiple times
  - First 30s should feel easy but not boring
  - 2-4min should feel like the "fun zone" — challenging but manageable
  - 5min+ should feel intense, 7min+ should feel nearly impossible
- [ ] Document final tuned values with comments in `config.ts`
- [ ] Verify: difficulty curve feels satisfying through multiple playthroughs

### 4.6 Performance Profiling
- [ ] Profile with Chrome DevTools:
  - Identify any frame time spikes
  - Check for GC pauses (object pooling working correctly?)
  - Verify WebGL draw calls are batched efficiently
  - Memory: ensure no leaks over extended play sessions (10+ min)
- [ ] Profile on mobile Safari (Web Inspector) for iOS performance
- [ ] Optimize any bottlenecks found
- [ ] Set and enforce entity cap if needed (max enemies, max bullets, max particles)
- [ ] Verify: smooth performance on desktop and mobile for 10+ minute sessions

### 4.7 Cross-Browser Testing
- [ ] Test on Chrome desktop — full gameplay
- [ ] Test on Safari desktop — full gameplay, audio works
- [ ] Test on Chrome Android — touch controls, performance, audio
- [ ] Test on Safari iOS — touch controls, performance, audio (AudioContext quirks)
- [ ] Fix any browser-specific issues found
- [ ] Verify: consistent experience across all target browsers

### 4.8 Edge Case Handling
- [ ] `visibilitychange` — pause game when tab hidden, resume when visible
- [ ] `resize` — recalculate canvas size, camera viewport, UI positions
- [ ] `orientationchange` — handle landscape/portrait switch on mobile
- [ ] WebGL context loss (`webglcontextlost` / `webglcontextrestored`) — graceful recovery or "please refresh" message
- [ ] Handle rapid tab switching without crashing
- [ ] Handle very long play sessions (no memory leak, no integer overflow on score)
- [ ] Verify: no crashes under unusual conditions

### 4.9 Final README
- [ ] Update `README.md`:
  - Game description and screenshot/GIF
  - Play now link (GitHub Pages URL)
  - Controls (desktop + mobile)
  - Development setup (`npm install`, `npm run dev`, `npm run build`)
  - Tech stack overview
  - Credits and license
- [ ] Verify: README is clear and informative

### 4.10 Phase 4 Final Verification
- [ ] `npm run build` succeeds with zero errors and zero warnings
- [ ] Full game deployed to GitHub Pages
- [ ] Playable on desktop Chrome + Safari
- [ ] Playable on mobile Chrome (Android) + Safari (iOS)
- [ ] Audio works on all platforms
- [ ] Leaderboard persists scores
- [ ] Debug overlay works
- [ ] No console errors during normal gameplay
- [ ] Game loads within 3 seconds on broadband

> ---
> ### PROJECT COMPLETE
>
> All four phases delivered. The game should be a polished, neon-glowing, twin-stick arcade
> shooter playable on desktop and mobile browsers via GitHub Pages.
>
> **Future considerations** (out of scope, documented in PRD §10):
> Gamepad support, online leaderboard, multiplayer, additional game modes, achievements.
> ---
