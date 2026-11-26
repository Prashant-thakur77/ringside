const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const base = 'http://localhost:3000';
  const r = await fetch('http://127.0.0.1:8787/matches?limit=5').then(r => r.json());
  const live = r.find(m => m.status === 1 || m.status === 2) || r[0];
  const done = r.find(m => m.status >= 4) || r[0];
  const pages = [['lobby', '/'], ['match', `/m/${live.match_id}?judge=1`], ['replay', `/replay/${done.match_id}`], ['proof', '/proof'], ['docs', '/docs']];
  for (const [n, path] of pages) {
    for (const [v, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }]]) {
      const p = await b.newPage({ viewport: vp });
      const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
      await p.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(4000);
      if (n === 'replay' && v === 'd') { await p.click('text=Verify the hash chain').catch(() => {}); await p.waitForTimeout(2500); }
      await p.screenshot({ path: `../.design/shots/${n}-${v}.png`, fullPage: v === 'd' && n !== 'match' });
      if (errs.length) console.log(n, v, 'errors:', errs.slice(0, 3).join(' | ').slice(0, 400));
      await p.close();
    }
  }
  await b.close();
})();
