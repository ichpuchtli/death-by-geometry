// Headless smoke test for the shipped black-hole samples:
// loads the real game off a running preview server, triggers audio init with a
// pointer gesture, then verifies the four promoted ElevenLabs mp3s
// (blackhole-hit / blackhole-absorb / blackhole-death / blackhole-spawn,
// see GENERATED_SFX) are fetched with HTTP 200 and the page produces zero console errors.
// Audibility cannot be verified headlessly — this only proves the load path.
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

  const wanted = ['blackhole-hit', 'blackhole-absorb', 'blackhole-death', 'blackhole-spawn'];
  const seen = {}; // name -> HTTP status
  page.on('response', (resp) => {
    for (const name of wanted) {
      if (resp.url().endsWith(`/sounds/generated/${name}.mp3`)) seen[name] = resp.status();
    }
  });

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  // AudioContext requires a user gesture — click to init audio (starts loadGeneratedSFX)
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'test-results/game-audio-smoke.png' });
  await browser.close();

  console.log(JSON.stringify({ seen, errors }, null, 2));
  const pass = wanted.every((name) => seen[name] === 200) && errors.length === 0;
  if (!pass) {
    console.error('SMOKE FAIL');
    process.exit(1);
  }
  console.log('SMOKE PASS');
})();
