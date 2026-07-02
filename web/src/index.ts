import { Game } from './game';
import type { Gallery as GalleryType } from './gallery';
import { loadSettings } from './settings';
import { initSettingsPanel } from './ui/settings-panel';

loadSettings();

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;

// Design Lab — Specimen Gallery: a standalone visual catalog of every ship/enemy/effect,
// for screenshot-based visual review. Boots instead of the game when `?gallery=1` is set.
if (new URLSearchParams(location.search).has('gallery')) {
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
