const c = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const lum = h => { const [r, g, b] = h.match(/[0-9a-f]{2}/gi).map(x => { const v = parseInt(x, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const surfaces = Object.keys(c).filter(k => /ground|surface|inset/.test(k)), texts = Object.keys(c).filter(k => /text|quiet|ink/.test(k));
let bad = 0;
for (const t of texts) for (const s of surfaces) { const r = ratio(c[t], c[s]); if (r < 4.5) bad++; console.log(r < 4.5 ? 'FAIL' : 'ok  ', t, 'on', s, r.toFixed(2)); }
process.exit(bad ? 1 : 0);
