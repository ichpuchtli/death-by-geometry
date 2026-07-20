// Headless smoke test for the BlackHole FX Lab (?blackhole=1):
// loads the lab off a running preview server, fires hits + destroy via the
// window hook, and fails on any console error. Not part of the YAML flows.
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

  await page.goto(`${base}/?blackhole=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const lab = window.blackHoleLab;
    if (!lab) return { ok: false, reason: 'window.blackHoleLab missing' };
    // Fire a few shots (tracer → real onBulletHit path) and let them land
    for (let i = 0; i < 5; i++) lab.fire(i * 1.25);
    lab.applyPreset(2); // Violent
    lab.fire(0.5);
    lab.applyPreset(1); // back to Current+
    return {
      ok: true,
      mode: lab.bh && lab.bh.visualMode,
      presets: lab.presets.map((p) => p.name),
      ejecta: lab.ejectaCount,
    };
  });
  await page.waitForTimeout(1200); // let tracers land + ejecta spawn

  const after = await page.evaluate(() => {
    const lab = window.blackHoleLab;
    const hits = lab.hitCount;
    lab.destroy();
    return { hits, bhActive: lab.bh && lab.bh.active };
  });
  await page.waitForTimeout(800);

  await page.screenshot({ path: 'test-results/blackhole-lab-smoke.png' });
  await browser.close();

  console.log(JSON.stringify({ info, after, errors }, null, 2));
  if (!info.ok || errors.length > 0 || after.hits < 4) {
    console.error('SMOKE FAIL');
    process.exit(1);
  }
  console.log('SMOKE PASS');
})();
