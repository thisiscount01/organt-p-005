const { chromium } = require('/tmp/pwapp/node_modules/playwright-core');
const { spawn } = require('child_process');
(async () => {
  const env = { ...process.env, PORT: '3111' }; delete env.PYTHONPATH;
  const srv = spawn('node', ['server.js'], { cwd: '/tmp/ddp_v1', env });
  await new Promise(r => setTimeout(r, 1200));
  const errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR:' + e.message));
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const wiring = await page.evaluate(() => {
    const hrefs = [...document.styleSheets].map(s => s.href || '');
    const ai = hrefs.findIndex(h => h.includes('app.css'));
    const mi = hrefs.findIndex(h => h.includes('motion.css'));
    return { motionLoaded: mi >= 0, orderOK: ai >= 0 && mi > ai };
  });
  const depths = await page.evaluate(() =>
    [...document.querySelectorAll('[data-depth]')].map(e => e.getAttribute('data-depth')));
  const heroAnim = await page.evaluate(() => {
    const el = document.querySelector('.a-code-line');
    return el ? getComputedStyle(el).animationName : null;
  });
  const anim0 = await page.evaluate(() => document.getAnimations().length);

  // scroll through depths to fire IO reveals + signatures
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);
  const anim1 = await page.evaluate(() => document.getAnimations().length);
  const revealsIn = await page.evaluate(() => document.querySelectorAll('.reveal.is-in').length);
  const sig = await page.evaluate(() => {
    const names = new Set();
    for (const a of document.getAnimations()) {
      const n = a.animationName || (a.effect && a.effect.getKeyframes && '(css)');
      const tgt = a.effect && a.effect.target;
      if (tgt) names.add((tgt.className || tgt.id || tgt.tagName));
    }
    return [...names].slice(0, 12);
  });

  // mobile no-overflow
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(300);
  const mobileOK = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1);

  // reduced-motion equivalence: depths/content still present, animations gone
  const ctx2 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(500);
  await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p2.waitForTimeout(500);
  const rm = await p2.evaluate(() => ({
    depths: document.querySelectorAll('[data-depth]').length,
    anims: document.getAnimations().length,
  }));

  console.log('WIRING', JSON.stringify(wiring));
  console.log('DEPTHS', JSON.stringify(depths));
  console.log('HERO_ANIM', heroAnim);
  console.log('GETANIM initial=' + anim0 + ' afterScroll=' + anim1 + ' revealsIn=' + revealsIn);
  console.log('ANIM_TARGETS', JSON.stringify(sig));
  console.log('MOBILE_NO_OVERFLOW', mobileOK);
  console.log('REDUCED_MOTION', JSON.stringify(rm));
  console.log('CONSOLE_ERRORS', JSON.stringify(errs));
  await browser.close();
  srv.kill();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
