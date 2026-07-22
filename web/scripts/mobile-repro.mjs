// Repro: mobile no-sound + TIME button not working (iPhone-ish touch emulation)
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://localhost:5173/';

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--no-sandbox',
    '--enable-webgl',
    '--use-gl=angle',
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
  ],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 }, // iPhone landscape CSS px
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas#game');
await page.waitForFunction(() => !!(window).game);

// --- 1. Tap to start (menu -> playing), which should also init audio ---
await page.touchscreen.tap(422, 195);
await page.waitForTimeout(1500);

const afterStart = await page.evaluate(() => {
  const g = window.game;
  const audio = g.audio;
  return {
    state: g.state,
    audioInitialized: audio.initialized,
    ctxState: audio.ctx ? audio.ctx.state : null,
    muted: audio.muted,
    buffers: audio.buffers ? audio.buffers.size : -1,
    mobile: g.mobile,
    inputMode: g.input.mode,
    hudTouchMode: (g.hud).touchMode,
  };
});
console.log('after start tap:', JSON.stringify(afterStart));

// --- 2. Grant dark matter, then press & hold the TIME button ---
await page.evaluate(() => {
  const g = window.game;
  g.debugSetDarkMatterCharge(100);
});

const geom = await page.evaluate(() => {
  const g = window.game;
  const hud = document.getElementById('hud');
  const game = document.getElementById('game');
  return {
    inputCanvas: { w: (g.input).canvasWidth, h: (g.input).canvasHeight },
    hudClient: { w: hud.clientWidth, h: hud.clientHeight },
    gameClient: { w: game.clientWidth, h: game.clientHeight },
    inner: { w: window.innerWidth, h: window.innerHeight },
    timeCenter: (g.input).timeButtonCenter,
    touchMode: (g.hud).touchMode,
    charge: g.timeDilationState.charge,
  };
});
console.log('geometry:', JSON.stringify(geom));

// tap-and-hold the TIME button center
const tc = geom.timeCenter;
await page.touchscreen.tap(tc.x, tc.y); // quick tap first
await page.waitForTimeout(300);
let dil = await page.evaluate(() => window.game.timeDilationState);
console.log('after TIME tap:', JSON.stringify({ active: dil.active, charge: dil.charge, timeScale: dil.timeScale }));

// hold it (touchstart without touchend)
const cdp = await context.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tc.x, y: tc.y, id: 99 }] });
await page.waitForTimeout(400);
dil = await page.evaluate(() => window.game.timeDilationState);
const touchId = await page.evaluate(() => window.game.input);
console.log('during TIME hold:', JSON.stringify({ active: dil.active, charge: Math.round(dil.charge), timeScale: dil.timeScale, timeTouchId: touchId.timeTouchId }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(500);

// --- 3. Realistic scenario: left stick (move) + right stick (fire) held, then TIME as third finger ---
await page.evaluate(() => window.game.debugSetDarkMatterCharge(100));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 250, id: 1 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 250, id: 1 }, { x: 650, y: 280, id: 2 }] });
await page.waitForTimeout(200);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 250, id: 1 }, { x: 650, y: 280, id: 2 }, { x: tc.x, y: tc.y, id: 3 }] });
await page.waitForTimeout(400);
const multi = await page.evaluate(() => {
  const g = window.game;
  return { ...g.timeDilationState, timeTouchId: g.input.timeTouchId, firing: g.input.isMouseDown() };
});
console.log('3-finger TIME hold:', JSON.stringify({ active: multi.active, charge: Math.round(multi.charge), timeTouchId: multi.timeTouchId, firing: multi.firing }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

// --- 4. Audio after screen lock/background cycle (iOS suspends ctx) ---
await page.evaluate(() => {
  const audio = window.game.audio;
  if (audio.ctx) audio.ctx.suspend();
});
await page.touchscreen.tap(422, 195); // gameplay touch end -> onInteract -> resume
await page.waitForTimeout(300);
const resumed = await page.evaluate(() => window.game.audio.ctx.state);
console.log('ctx state after suspend + gameplay tap:', resumed);

// --- 5. Wedged touch id (iOS swallowed touchend) must not kill the TIME button ---
await page.evaluate(() => { window.game.input.timeTouchId = 777; window.game.debugSetDarkMatterCharge(100); });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tc.x, y: tc.y, id: 5 }] });
await page.waitForTimeout(300);
const wedge = await page.evaluate(() => ({ ...window.game.timeDilationState, timeTouchId: window.game.input.timeTouchId }));
console.log('wedged-then-press:', JSON.stringify({ active: wedge.active, timeTouchId: wedge.timeTouchId }));

await browser.close();
