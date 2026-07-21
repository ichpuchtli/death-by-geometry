// Headless smoke test for the BlackHole FX Lab (?blackhole=1):
// loads the lab off a running preview server, fires hits + destroy via the
// window hook, verifies the three-element emission (matter lances + embers +
// dust motes all live after hits), and fails on any console error.
// Not part of the YAML flows.
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
    // Fire a volley (tracer → real onBulletHit path) and let it land
    for (let i = 0; i < 6; i++) lab.fire(i * 1.05);
    lab.applyPreset(2); // Violent
    lab.fire(0.5);
    lab.applyPreset(1); // back to Current+
    return {
      ok: true,
      mode: lab.bh && lab.bh.visualMode,
      presets: lab.presets.map((p) => p.name),
      matterKnob: lab.matterCount,
      particleKnob: lab.particleCount,
      dustKnob: lab.dustCount,
    };
  });
  await page.waitForTimeout(700); // let tracers land + bursts spawn

  const mid = await page.evaluate(() => {
    const lab = window.blackHoleLab;
    return {
      hits: lab.hitCount,
      lances: lab.matter.count,   // MATTER — massless escaping projectiles
      motes: lab.field.count,     // DUST + PARTICLES (massy field)
    };
  });
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const lab = window.blackHoleLab;
    lab.destroy();
    return { destroyLances: lab.matter.count, bhActive: lab.bh && lab.bh.active };
  });
  await page.waitForTimeout(800);

  await page.screenshot({ path: 'test-results/blackhole-lab-smoke.png' });
  await browser.close();

  console.log(JSON.stringify({ info, mid, after, errors }, null, 2));
  const pass =
    info.ok &&
    errors.length === 0 &&
    mid.hits >= 5 &&
    mid.lances > 0 &&        // matter emission on hits
    mid.motes > 200 &&       // ambient dust sea + embers alive
    after.destroyLances > 0; // matter blows out on destroy
  if (!pass) {
    console.error('SMOKE FAIL');
    process.exit(1);
  }
  console.log('SMOKE PASS');
})();
