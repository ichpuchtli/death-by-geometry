import { Game } from './game';
import type { Gallery as GalleryType } from './gallery';
import type { ThreatLab as ThreatLabType } from './threat-lab';
import type { ParticleLab as ParticleLabType } from './particle-lab';
import type { CircleLab as CircleLabType } from './circle-lab';
import type { TaxonomyLab as TaxonomyLabType } from './taxonomy-lab';
import type { GlassLab as GlassLabType } from './glass-lab';
import type { LiquidGlassLab as LiquidGlassLabType } from './liquid-glass-lab';
import type { PlayerDesignLab as PlayerDesignLabType } from './player-design-lab';
import type { HudLab as HudLabType } from './hud-lab';
import { loadSettings } from './settings';
import { initSettingsPanel } from './ui/settings-panel';

loadSettings();

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;

// Design Lab — Specimen Gallery: a standalone visual catalog of every ship/enemy/effect,
// for screenshot-based visual review. Boots instead of the game when `?gallery=1` is set.
const bootParams = new URLSearchParams(location.search);
if (bootParams.has('gallery')) {
  gameCanvas.style.cursor = 'default';
  import('./gallery').then(({ Gallery }) => {
    const gallery = new Gallery(gameCanvas);
    (window as unknown as { gallery: GalleryType }).gallery = gallery;
    let last = performance.now();
    function galleryLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      gallery.update(dt);
      gallery.render();
      requestAnimationFrame(galleryLoop);
    }
    requestAnimationFrame(galleryLoop);
  });
} else if (bootParams.has('threat')) {
  // Threat Lab — playable BlackHole threat-preset A/B arena (`?threat=1`)
  import('./threat-lab').then(({ ThreatLab }) => {
    const lab = new ThreatLab(gameCanvas);
    (window as unknown as { threatLab: ThreatLabType }).threatLab = lab;
    let last = performance.now();
    function labLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(labLoop);
    }
    requestAnimationFrame(labLoop);
  });
} else if (bootParams.has('particles')) {
  // Particle Lab — cosmic-dust aesthetic + companion particle effects (`?particles=1`)
  import('./particle-lab').then(({ ParticleLab }) => {
    const lab = new ParticleLab(gameCanvas);
    (window as unknown as { particleLab: ParticleLabType }).particleLab = lab;
    let last = performance.now();
    function particleLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(particleLoop);
    }
    requestAnimationFrame(particleLoop);
  });
} else if (bootParams.has('circles')) {
  // Circle Lab — tracking-behaviour + visual-DNA sandbox for the Circle enemy (`?circles=1`)
  import('./circle-lab').then(({ CircleLab }) => {
    const lab = new CircleLab(gameCanvas);
    (window as unknown as { circleLab: CircleLabType }).circleLab = lab;
    let last = performance.now();
    function circleLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(circleLoop);
    }
    requestAnimationFrame(circleLoop);
  });
} else if (bootParams.has('taxonomy')) {
  // Taxonomy Lab — labeled anatomy chart of every BlackHole visual effect (`?taxonomy=1`)
  import('./taxonomy-lab').then(({ TaxonomyLab }) => {
    const lab = new TaxonomyLab(gameCanvas);
    (window as unknown as { taxonomyLab: TaxonomyLabType }).taxonomyLab = lab;
    let last = performance.now();
    function taxonomyLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(taxonomyLoop);
    }
    requestAnimationFrame(taxonomyLoop);
  });
} else if (bootParams.has('glass')) {
  // Glass Lab — A/B chooser for the BlackHole chromatic photon-ring variants (`?glass=1`)
  import('./glass-lab').then(({ GlassLab }) => {
    const lab = new GlassLab(gameCanvas);
    (window as unknown as { glassLab: GlassLabType }).glassLab = lab;
    let last = performance.now();
    function glassLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(glassLoop);
    }
    requestAnimationFrame(glassLoop);
  });
} else if (bootParams.has('liquid')) {
  // Liquid Glass Lab — GLSL refractive-material variant prototypes (`?liquid=1`)
  import('./liquid-glass-lab').then(({ LiquidGlassLab }) => {
    const lab = new LiquidGlassLab(gameCanvas);
    (window as unknown as { liquidGlassLab: LiquidGlassLabType }).liquidGlassLab = lab;
    let last = performance.now();
    function liquidLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(liquidLoop);
    }
    requestAnimationFrame(liquidLoop);
  });
} else if (bootParams.has('player')) {
  // Player Design Lab — 8 candidate ship silhouettes + firing sound/effect variants (`?player=1`)
  import('./player-design-lab').then(({ PlayerDesignLab }) => {
    const lab = new PlayerDesignLab(gameCanvas);
    (window as unknown as { playerDesignLab: PlayerDesignLabType }).playerDesignLab = lab;
    let last = performance.now();
    function playerLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(playerLoop);
    }
    requestAnimationFrame(playerLoop);
  });
} else if (bootParams.has('hud')) {
  // HUD Lab — full-screen chooser for a coherent in-game HUD (`?hud=1`).
  // Draws on the HUD canvas (2D) — its own faux background, so no WebGL is involved.
  import('./hud-lab').then(({ HudLab }) => {
    const lab = new HudLab(hudCanvas);
    (window as unknown as { hudLab: HudLabType }).hudLab = lab;
    let last = performance.now();
    function hudLoop(time: number): void {
      const dt = Math.min(time - last, 50);
      last = time;
      lab.update(dt);
      lab.render();
      requestAnimationFrame(hudLoop);
    }
    requestAnimationFrame(hudLoop);
  });
} else {
  bootGame();
}

function bootGame(): void {
const desktopSettingsMount = document.getElementById('desktop-settings');
initSettingsPanel(desktopSettingsMount);

const game = new Game(gameCanvas, hudCanvas);
// Debug/test hook: lets Playwright flows inspect live game state (score, lives, state).
(window as unknown as { game: Game }).game = game;

let lastTime = performance.now();
let paused = false;
let orientationPaused = false;

function checkOrientation(): void {
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isMobile) return;

  const isPortrait = window.innerHeight > window.innerWidth;
  const rotatePrompt = document.getElementById('rotate-prompt');

  if (isPortrait) {
    if (!orientationPaused) {
      orientationPaused = true;
      game.onOrientationPause();
    }
    if (rotatePrompt) rotatePrompt.style.display = 'flex';
  } else {
    if (orientationPaused) {
      orientationPaused = false;
      game.onOrientationResume();
    }
    if (rotatePrompt) rotatePrompt.style.display = 'none';
  }
}

function loop(time: number): void {
  if (!paused && !orientationPaused) {
    const dt = Math.min(time - lastTime, 50);
    lastTime = time;
    game.update(dt);
    game.render();
  } else {
    lastTime = time;
    // Still render the frozen scene when orientation-paused
    if (orientationPaused) {
      game.render();
    }
  }
  requestAnimationFrame(loop);
}

// Pause when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    paused = true;
    game.onPause();
  } else {
    paused = false;
    lastTime = performance.now();
    game.onResume();
  }
});

// Orientation change detection
window.addEventListener('resize', () => checkOrientation());
window.addEventListener('orientationchange', () => {
  setTimeout(() => checkOrientation(), 100);
});
checkOrientation();

requestAnimationFrame(loop);
}
