const { chromium } = require('/tmp/pw001/node_modules/playwright');
const { spawn } = require('child_process');
const net = require('net');

function waitPort(port) {
  return new Promise((res) => {
    const t = setInterval(() => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { clearInterval(t); s.destroy(); res(); });
      s.on('error', () => s.destroy());
    }, 100);
  });
}

(async () => {
  const srv = spawn('bash', ['-c', 'node - < server.js'], { stdio: 'ignore' });
  await waitPort(3000);
  const b = await chromium.launch();
  const pg = await b.newPage();
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });

  // REQ1: empty field focused -> j/k/1-4 type as chars
  await pg.click('#intake-answer');
  await pg.fill('#intake-answer', '');
  for (const ch of ['j', 'k', '1', '2', '3', '4']) await pg.keyboard.press(ch);
  const typed = await pg.$eval('#intake-answer', (el) => el.value);
  console.log('REQ1 typed =', JSON.stringify(typed));
  if (typed !== 'jk1234') throw new Error('REQ1 FAIL: got ' + JSON.stringify(typed));

  // REQ2: no field focus -> depth-jump navigation. Fresh reload, start at top.
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.waitForTimeout(300);
  // confirm no field is focused
  const active = await pg.evaluate(() => document.activeElement && document.activeElement.tagName);
  console.log('REQ2 activeElement tag =', active);
  const y0 = await pg.evaluate(() => window.scrollY);
  await pg.keyboard.press('j');
  await pg.waitForTimeout(700);
  const y1 = await pg.evaluate(() => window.scrollY);
  console.log('REQ2 scrollY', y0, '->', y1);
  if (!(y1 > y0)) throw new Error('REQ2 FAIL: j did not navigate down ' + y0 + '->' + y1);

  // REQ2b: numeric jump '1' back to depth 1 (top), '4' to a deeper depth
  await pg.keyboard.press('1'); await pg.waitForTimeout(700);
  const yA = await pg.evaluate(() => window.scrollY);
  await pg.keyboard.press('4'); await pg.waitForTimeout(700);
  const yB = await pg.evaluate(() => window.scrollY);
  console.log('REQ2b 1->', yA, ' 4->', yB);
  if (yB <= yA) throw new Error('REQ2b FAIL: numeric jump not advancing 1->' + yA + ' 4->' + yB);

  console.log('console errors:', errs);
  console.log('ALL PASS');
  await b.close();
  srv.kill();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
