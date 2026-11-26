import { chromium } from 'playwright';
const b = await chromium.launch();
for (const f of ['a-slate', 'b-card', 'c-tote']) {
  for (const [n, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    await p.goto(`file://${process.cwd()}/${f}.html`); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${f}-${n}.png` });
  }
}
await b.close();
