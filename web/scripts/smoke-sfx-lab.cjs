// Headless smoke test for the SFX Audition Lab (?sfx=1):
// loads the lab off a running preview server, verifies index.json was consumed
// (12 candidates, all pending when no mp3s are generated), the procedural and
// death sections rendered, keyboard playback path runs without errors, and the
// page produces zero console errors. Not part of the YAML flows.
const { chromium } = require('playwright');

(async () => {
  const base = process.env.BASE_URL || 'http://localhost:4173';
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(`${base}/?sfx=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const lab = window.sfxLab;
    if (!lab) return { ok: false, reason: 'window.sfxLab missing' };
    // Exercise the playback paths (procedural is a safe no-op pre-audio-init;
    // pending candidates are a safe no-op by design)
    lab.playProceduralHit('thud');
    lab.playDeathVariant('subdrop');
    lab.playCandidate(1);
    const buttons = document.querySelectorAll('#sfx-lab-page button');
    const pendingBadges = [...document.querySelectorAll('#sfx-lab-page span')]
      .filter((el) => el.textContent === 'pending generation').length;
    return {
      ok: true,
      ready: lab.ready,
      loadError: lab.loadError,
      candidates: lab.candidates.length,
      available: lab.candidates.filter((c) => c.available).length,
      entriesRendered: lab.entriesRendered,
      buttons: buttons.length,
      pendingBadges,
    };
  });

  // Keyboard path: pressing "1" should attempt candidate 1 (no-op while pending, no error)
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'test-results/sfx-lab-smoke.png' });
  await browser.close();

  console.log(JSON.stringify({ info, errors }, null, 2));
  const pass =
    info.ok &&
    info.ready &&
    !info.loadError &&
    info.candidates === 12 &&
    info.entriesRendered === 12 &&
    // All 12 either playable (post-generation) or pending (pre-generation)
    info.available + info.pendingBadges === 12 &&
    info.buttons >= 12 + 3 + 4 && // candidates + 3 procedural hits + 4 deaths
    errors.length === 0;
  if (!pass) {
    console.error('SMOKE FAIL');
    process.exit(1);
  }
  console.log('SMOKE PASS');
})();
