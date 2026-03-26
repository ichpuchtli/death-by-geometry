# Product Requirements Document: Death by Geometry Web

## 1. Overview

### 1.1 Product Summary
Death by Geometry Web is a browser-based port of the original Python/Pygame twin-stick arcade shooter, rebuilt from scratch in TypeScript with raw WebGL rendering. The game targets retro/arcade fans and will be hosted on GitHub Pages as a free-to-play experience with full mobile support.

### 1.2 Vision
Preserve the fast-paced, Geometry Wars-inspired gameplay of the original while elevating the visual experience with WebGL-powered neon glow effects, a reactive grid background, particle trails, and a scrolling world — all playable on desktop and mobile browsers.

### 1.3 Key Decisions Summary

| Decision | Choice |
|---|---|
| Target Audience | Retro/arcade fans |
| Scope | Port with visual polish |
| Rendering | Raw WebGL |
| Mobile Support | Full (twin-stick virtual joysticks) |
| Stack | TypeScript + Vite |
| Deploy | CI/CD via GitHub Actions |
| Delivery | Incremental phases |
| Browsers | Chrome/Chromium + Safari (desktop & iOS) |

---

## 2. Game Design

### 2.1 Core Gameplay Loop
The player controls a spaceship in a top-down 2D arena. Enemies spawn in escalating waves of geometric shapes. The player moves with WASD (or left virtual joystick on mobile) and aims/shoots toward the mouse cursor (or right virtual joystick on mobile). The goal is to survive as long as possible and achieve the highest score.

### 2.2 Scrolling World
Unlike the original fixed-viewport design, the web version introduces a **scrolling world**:
- The play area is larger than the visible viewport (exact dimensions TBD during playtesting, suggested starting point: **3x viewport width, 3x viewport height**)
- The camera follows the player, keeping them roughly centered
- The reactive background grid extends across the full world, providing spatial orientation
- Enemies can exist off-screen; a subtle edge indicator should warn the player of nearby off-screen threats
- World boundaries are defined by the grid edges — the player cannot leave the arena

### 2.3 Player (SpaceShip)

| Property | Value |
|---|---|
| Movement Speed | Tunable (original: 0.35 px/ms) |
| Starting Lives | 3 |
| Collision Radius | 32 px (scaled for world size) |
| Control (Desktop) | WASD movement, mouse aim + click to shoot |
| Control (Mobile) | Left joystick movement, right joystick aim/shoot |
| Respawn | Brief invulnerability period after death |

### 2.4 Weapon Progression
Weapon upgrades are tied to score milestones. Values will be redesigned during playtesting, but the structure is preserved from the original:

| Score Threshold | Upgrade |
|---|---|
| Base | Single shot, standard fire rate |
| Milestone 1 | Reduced shot delay |
| Milestone 2 | Twin shot (slight angle offset) |
| Milestone 3 | Further reduced shot delay |
| Milestone 4 | Triple shot |

All threshold values and fire rates will be exposed as tunable constants in a dedicated configuration module.

### 2.5 Enemy Types
All enemies are rendered as vector geometry with neon glow effects. Each enemy type has distinct visual identity, movement behavior, and score value.

| Enemy | Shape | Color | Behavior | Score | On Death |
|---|---|---|---|---|---|
| **Rhombus** | Diamond | Cyan (#00C8FF) | Follows player directly | 100 | Explosion |
| **Pinwheel** | Pinwheel | Purple (#C840FF) | Slow, rotates while moving, bounces off edges | 50 | Explosion |
| **Square** | Square | Magenta (#FF20FF) | Follows player | 450 | Spawns 2 Square2 |
| **Square2** | Small Square | Magenta (#FF20FF) | Fast, bounces off edges | 150 | Explosion |
| **Circle** | Circle | Blue (#2040FF) | Fast, follows player with dispersion | 300 | Explosion |
| **Triangle2** | Triangle | Lime (#AEC300) | Bounces off edges | 550 | Spawns Circles |
| **Octagon** | Octagon | Orange (#FF8020) | Predictive — aims ahead of player | 1,650 | Spawns Circles |
| **DeathStar** (Boss) | Large sphere | Custom sprite/procedural | Spawns periodically, 20 HP, attracts nearby enemies | Bonus | Spawns 5+ Circles |

### 2.6 Projectiles (Bullets)
- Small diamond shape, red (#FF0000) with glow
- Speed: 1 px/ms (tunable)
- Direction: from player toward aim point
- Collision radius: 38 px (enemies), 64 px (DeathStar)
- Destroyed on hit or leaving world bounds

### 2.7 Difficulty & Progression (Redesigned)
The original difficulty curve will be **redesigned** for the web version. Key principles:
- Gradual ramp-up in the first 2-3 minutes to let new players learn
- Clear escalation phases that feel rewarding, not sudden
- Boss (DeathStar) spawns at regular intervals with increasing frequency
- All timing values, spawn rates, enemy speeds, and cluster sizes exposed as **tunable constants** in a configuration file
- Playtesting should drive final values

**Suggested difficulty phases** (starting point for tuning):

| Phase | Time Range | Description |
|---|---|---|
| Tutorial | 0-30s | Simple enemies (Rhombus, Pinwheel) only, low spawn rate |
| Ramp-up | 30s-2min | Introduce Squares, increase spawn rate |
| Mid-game | 2-4min | Full enemy roster, moderate density, first DeathStar |
| Intense | 4-7min | High spawn rates, mixed enemy waves, frequent bosses |
| Chaos | 7min+ | Maximum difficulty, survival-focused |

### 2.8 Scoring & Persistence

#### Local Scores
- High scores stored in `localStorage`
- Display top 10 scores on a local leaderboard screen
- Each entry: score, date, time survived, enemies killed

#### Shareable Scores
- Players can manually screenshot the game-over screen
- Game-over screen should be visually designed to look good as a shared screenshot (stylized, includes score/stats, game logo)

### 2.9 Game States

| State | Description |
|---|---|
| **Loading** | Asset loading with progress indicator |
| **Main Menu** | Logo, Play button, Settings (audio toggle), Leaderboard |
| **Playing** | Active gameplay |
| **Game Over** | Score summary, stats, "Play Again" / "Main Menu" options |

---

## 3. Visual Design

### 3.1 Art Direction
The visual style is **neon geometry on black** — inspired by Geometry Wars. All game entities are rendered as glowing vector shapes against a dark background with a reactive grid.

### 3.2 Rendering Pipeline (WebGL)
Custom WebGL rendering pipeline with the following stages:

1. **Clear** — Black background
2. **Background Grid** — Reactive grid with warp distortion near explosions/enemies
3. **Game Entities** — Render all entities to a framebuffer:
   - Enemies (vector shapes)
   - Bullets (diamond shapes with trails)
   - Player ship (vector or sprite — whichever fits the neon aesthetic best)
   - DeathStar boss
   - Particle effects / explosions
4. **Post-Processing** — Apply bloom/glow shader pass to the entity framebuffer
5. **UI Overlay** — Score, lives, virtual joysticks (mobile), debug overlay
6. **Composite** — Final output to screen

### 3.3 Neon Glow / Bloom Effect
- Multi-pass Gaussian blur on a brightness-extracted render target
- Additive blending of the blurred result onto the original scene
- Intensity tunable per entity type (enemies glow more, UI glows less)
- Should maintain performance on mobile (consider half-resolution bloom pass)

### 3.4 Reactive Background Grid
- Wireframe grid covering the entire scrolling world
- Grid lines subtly colored (dark blue or dark green)
- Grid vertices displaced by nearby:
  - Explosions (radial push outward)
  - Enemies (gentle gravitational pull)
  - Bullets (minor ripple)
- Displacement smoothly decays back to rest position over time
- Provides spatial awareness in the scrolling world

### 3.5 Particle Trails
- Enemies and bullets leave fading trails as they move
- Trails rendered as short line segments or small quads
- Color matches the entity
- Trail length/opacity tunable per entity type
- Trails also receive the bloom/glow post-processing

### 3.6 Explosion Particles
- Radiating line particles from destruction point (preserved from original)
- Color matches destroyed entity
- Duration: 1-5 seconds depending on entity importance
- Particles interact with background grid (cause displacement)

### 3.7 Entity Rendering
- **Enemies**: Rendered procedurally as vector shapes using WebGL line/triangle primitives with glow
- **Player Ship**: Evaluate during implementation — if a procedural vector ship looks good with bloom, use that; otherwise use a sprite with glow shader
- **DeathStar Boss**: Procedural concentric circle rendering with glow, or sprite if procedural doesn't look menacing enough
- **Bullets**: Small glowing diamonds with motion trails
- **Crosshair**: Subtle glowing reticle (desktop only; hidden on mobile)
- **Menu UI**: Stylized with the same neon glow aesthetic

### 3.8 Off-Screen Enemy Indicators
Since the world scrolls and enemies can be off-screen:
- Small arrow or dot indicators on viewport edges pointing toward nearby off-screen enemies
- Color matches the enemy type
- Opacity/size based on distance

---

## 4. Audio Design

### 4.1 Sound Effects
Port the existing 11 WAV sound effects to web-compatible format (OGG + MP3 fallback for Safari):

| Sound | Trigger |
|---|---|
| start.wav | Game initialization |
| die.wav | Player final death (game over) |
| die1.wav | Player loses a life (respawn) |
| crash.wav | Collision/impact |
| square.wav | Square enemy spawn |
| rhombus.wav | Rhombus enemy spawn |
| triangle2.wav | Triangle enemy spawn |
| octagon.wav | Octagon enemy spawn |
| pinwheel.wav | Pinwheel enemy spawn |
| deathstar.wav | DeathStar boss spawn |
| deathstar2.wav | DeathStar destruction |

Implementation via the **Web Audio API** for low-latency playback and spatial positioning.

### 4.2 Background Music (Procedural/Generative)
- Procedurally generated synthwave/chiptune music using the **Web Audio API** (oscillators, filters, gain nodes)
- Music intensity adapts to gameplay:
  - **Menu**: Ambient, low-energy synth pad
  - **Early game**: Simple rhythmic baseline
  - **Mid game**: Additional layers, faster tempo
  - **Intense/Boss**: Full synthwave with driving bass and arpeggiated leads
  - **Game Over**: Wind-down, melancholic tone
- No external audio files needed for music — fully generated at runtime
- Master volume control + mute toggle accessible from menu and in-game

---

## 5. Controls

### 5.1 Desktop Controls

| Input | Action |
|---|---|
| W / Up Arrow | Move up |
| A / Left Arrow | Move left |
| S / Down Arrow | Move down |
| D / Right Arrow | Move right |
| Mouse Move | Aim direction |
| Mouse Click (hold) | Shoot |
| ESC | Return to main menu |

### 5.2 Mobile Controls (Twin-Stick Virtual Joysticks)

| Input | Action |
|---|---|
| Left joystick (left half of screen) | Movement — direction and speed based on joystick deflection |
| Right joystick (right half of screen) | Aim + shoot — direction sets aim, any deflection auto-fires |

#### Virtual Joystick Design
- Semi-transparent circular joystick bases
- Appear dynamically where the player first touches (not fixed position)
- Joystick knob follows finger within radius
- Dead zone in center to prevent drift
- Visual feedback: joystick base subtly glows when active
- Sized appropriately for thumb control (~120px diameter base)

### 5.3 Input Detection
- Auto-detect input method on first interaction
- Seamlessly switch between touch and keyboard/mouse if both are available
- Hide virtual joysticks when keyboard/mouse is active, show when touch is detected

---

## 6. Technical Architecture

### 6.1 Stack

| Component | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build Tool | Vite |
| Rendering | Raw WebGL 2 (fallback to WebGL 1) |
| Audio | Web Audio API |
| Deployment | GitHub Pages via GitHub Actions |
| Package Manager | npm |

### 6.2 Code Architecture
**Component-based architecture with service layer** — a pragmatic middle ground between flat files and full ECS:

```
src/
├── index.ts                  # Entry point
├── game.ts                   # Game loop, state management
├── config.ts                 # All tunable constants (speeds, colors, spawn rates, etc.)
├── core/
│   ├── engine.ts             # WebGL context, render loop, delta time
│   ├── input.ts              # Keyboard, mouse, and touch input manager
│   ├── audio.ts              # Web Audio API manager (SFX + procedural music)
│   ├── camera.ts             # Camera following player, viewport management
│   ├── collision.ts          # Collision detection system
│   ├── vector.ts             # 2D vector math utilities
│   └── storage.ts            # localStorage wrapper for scores
├── renderer/
│   ├── webgl-context.ts      # WebGL setup, shader compilation
│   ├── sprite-batch.ts       # Batched rendering for entities
│   ├── grid.ts               # Reactive background grid renderer
│   ├── bloom.ts              # Multi-pass bloom post-processing
│   ├── particles.ts          # Particle system renderer
│   ├── trails.ts             # Entity trail renderer
│   └── shaders/              # GLSL shader files
│       ├── entity.vert/frag
│       ├── grid.vert/frag
│       ├── bloom.vert/frag
│       ├── particle.vert/frag
│       └── composite.vert/frag
├── entities/
│   ├── entity.ts             # Base entity class
│   ├── player.ts             # Player ship
│   ├── bullet.ts             # Projectile
│   ├── enemies/
│   │   ├── enemy.ts          # Base enemy class
│   │   ├── rhombus.ts
│   │   ├── pinwheel.ts
│   │   ├── square.ts
│   │   ├── circle.ts
│   │   ├── triangle.ts
│   │   ├── octagon.ts
│   │   └── deathstar.ts
│   ├── explosion.ts          # Explosion particle effect
│   └── crosshair.ts         # Cursor reticle
├── spawner/
│   ├── wave-manager.ts       # Difficulty progression and wave spawning
│   └── spawn-patterns.ts     # Enemy formation definitions
├── ui/
│   ├── hud.ts                # In-game HUD (score, lives)
│   ├── menu.ts               # Main menu screen
│   ├── game-over.ts          # Game over screen with stats
│   ├── leaderboard.ts        # Local high score display
│   ├── virtual-joystick.ts   # Mobile touch joystick component
│   └── debug-overlay.ts      # FPS, entity count, debug stats
└── assets/
    ├── sounds/               # Converted audio files (OGG + MP3)
    └── sprites/              # Any sprite assets (if needed)
```

### 6.3 Game Loop
```
requestAnimationFrame loop:
  1. Calculate delta time
  2. Process input (keyboard/mouse/touch)
  3. Update game state:
     a. Player movement & shooting
     b. Enemy AI & movement
     c. Bullet movement
     d. Collision detection
     e. Spawner / wave manager
     f. Particle system update
     g. Camera follow
     h. Grid displacement decay
  4. Render:
     a. Background grid (to framebuffer)
     b. All entities (to framebuffer)
     c. Particle trails
     d. Bloom post-process pass
     e. UI overlay
     f. Composite to screen
  5. Audio update (procedural music intensity)
```

### 6.4 Collision Detection
- Spatial partitioning (grid-based) for broad phase to handle scrolling world efficiently
- Distance-based (circle-circle) for narrow phase — preserving original behavior
- Collision pairs: bullet-enemy, bullet-deathstar, player-enemy, player-deathstar, deathstar-enemy (attraction)

### 6.5 Performance Targets
- Smooth gameplay on mid-range devices
- Bloom rendered at half-resolution on mobile for performance
- Object pooling for bullets, particles, and explosions to minimize GC pressure
- Entity cap to prevent runaway spawning from tanking frame rate
- Delta-time-based movement for frame rate independence

### 6.6 Browser Compatibility
- **Primary**: Chrome/Chromium (desktop + Android)
- **Primary**: Safari (desktop + iOS)
- WebGL 2 preferred, WebGL 1 fallback
- Web Audio API (supported by both targets)
- Touch Events API for mobile

---

## 7. Deployment

### 7.1 GitHub Pages via GitHub Actions
- On push to `main`, a GitHub Actions workflow:
  1. Checks out code
  2. Installs dependencies (`npm ci`)
  3. Builds production bundle (`npm run build`)
  4. Deploys `dist/` to GitHub Pages
- Custom domain support optional (via CNAME file)

### 7.2 Build Output
- Static files: `index.html`, bundled JS, GLSL shaders (inlined or imported), audio assets
- No server-side requirements — fully client-side

---

## 8. Debug Overlay
- Toggle with a keyboard shortcut (backtick `` ` `` key)
- Displays:
  - FPS (current, min, max, average)
  - Entity count (enemies, bullets, particles)
  - Memory usage (if available via `performance.memory`)
  - Current game phase / difficulty level
  - Player position and world coordinates
  - Active input method (keyboard/touch)
  - WebGL draw call count

---

## 9. Delivery Phases

### Phase 1: Core Game (MVP)
**Goal**: Playable game in the browser with basic visuals.

- [ ] Project scaffolding (TypeScript + Vite + WebGL boilerplate)
- [ ] Basic WebGL renderer (flat colors, no post-processing)
- [ ] Player movement and shooting (desktop controls only)
- [ ] All 7 enemy types with basic AI behaviors
- [ ] DeathStar boss
- [ ] Bullet system
- [ ] Collision detection
- [ ] Basic scoring and lives
- [ ] Simple game states (menu, playing, game over)
- [ ] Scrolling world with camera follow
- [ ] Delta-time game loop
- [ ] GitHub Actions deployment pipeline

**Exit Criteria**: A fully playable game on desktop Chrome with all enemy types, scoring, and game-over flow.

### Phase 2: Visual Polish
**Goal**: The game looks spectacular.

- [ ] Neon glow / bloom post-processing shader
- [ ] Reactive background grid with displacement
- [ ] Particle trails on enemies and bullets
- [ ] Improved explosion particle effects
- [ ] Entity rendering polish (double-line, fusion circles from original)
- [ ] Procedural vector art for all entities (replace PNGs if they look better)
- [ ] Off-screen enemy indicators
- [ ] Stylized menu and game-over screens
- [ ] Loading screen

**Exit Criteria**: The game has the full Geometry Wars-style neon aesthetic with bloom, grid, and trails.

### Phase 3: Mobile & Audio
**Goal**: Playable on phones with full audio.

- [ ] Twin-stick virtual joystick implementation
- [ ] Touch input detection and auto-switching
- [ ] Responsive canvas sizing for mobile screens
- [ ] Mobile performance optimization (half-res bloom, reduced particles)
- [ ] Port existing SFX to OGG/MP3 format
- [ ] Web Audio API integration for SFX
- [ ] Procedural music generation system
- [ ] Adaptive music intensity
- [ ] Audio toggle / volume control in menu
- [ ] Safari-specific audio handling (user gesture requirement)

**Exit Criteria**: Game is fully playable on iOS Safari and Android Chrome with touch controls and adaptive audio.

### Phase 4: Scores, Polish & Tuning
**Goal**: Final release quality.

- [ ] localStorage high score system
- [ ] Local leaderboard screen (top 10)
- [ ] Stylized game-over screen (screenshot-friendly)
- [ ] Debug overlay (toggled with backtick)
- [ ] Difficulty curve redesign and playtesting
- [ ] All tunable constants finalized in config
- [ ] Performance profiling and optimization pass
- [ ] Cross-browser testing (Chrome + Safari desktop/mobile)
- [ ] Edge case handling (tab visibility, resize, orientation change)
- [ ] Final README with gameplay instructions and credits

**Exit Criteria**: Polished, tested, and deployed game at production quality.

---

## 10. Out of Scope (for now)
- Online multiplayer
- Global leaderboard (requires backend)
- Gamepad/controller support
- Multiple game modes (e.g., timed, survival, campaign)
- Achievements system
- Pause menu
- Key rebinding
- Fullscreen toggle
- Player ship customization
- Additional enemy types beyond the original 7 + DeathStar

---

## 11. Open Questions / TBD
1. **Exact world size**: Starting at 3x viewport in each dimension — needs playtesting to feel right
2. **Difficulty values**: All spawn timers, enemy speeds, and score thresholds need playtesting
3. **Player ship art**: Vector procedural vs. sprite — decide during Phase 2 based on what looks best with bloom
4. **DeathStar art**: Same decision as player ship
5. **Procedural music**: Exact musical style and layering approach — prototype during Phase 3
6. **Mobile joystick sizing**: 120px starting point — needs testing on real devices
7. **Entity cap**: Maximum simultaneous enemies/bullets before performance degrades — profile during Phase 4

---

## 12. Success Metrics
- Game loads and is playable within 3 seconds on broadband
- Maintains smooth frame rate on 2-year-old phones
- Players can intuitively play on mobile without instructions
- Visual polish elicits "wow" reaction — the bloom/grid/trails should feel premium
- Score persistence works reliably across sessions
- Zero crash bugs in production
