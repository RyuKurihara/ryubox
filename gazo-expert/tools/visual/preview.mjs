// content/visual/<cat>.json の図を全部描画してスクリーンショット（目視確認用）
// node tools/visual/preview.mjs <cat> <outdir> [perShot]
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const [cat, outdir, per = '8'] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(path.join(root, 'content/visual', cat + '.json'), 'utf8'));
const css = fs.readFileSync(path.join(root, 'www/css/style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'www/js/app.js'), 'utf8');
// app.js から figHTML 関数を抜き出す
const s = app.indexOf('function figHTML'); const e = app.indexOf('let pendingCanvas');
const figFn = app.slice(s, e);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
const P = Number(per);
for (let k = 0; k * P < items.length; k++) {
  const chunk = items.slice(k * P, (k + 1) * P);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  body{background:#f3f3f3;padding:8px} .wrap{display:grid;grid-template-columns:repeat(4,290px);gap:8px} .card{background:#fff;padding:6px;border:1px solid #ccc} .id{font:bold 11px monospace;color:#a00}
  .fig svg{width:280px}
  </style></head><body><div class="wrap" id="w"></div><script>
  const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let pendingCanvas=[]; ${figFn}
  const items=${JSON.stringify(chunk)};
  document.getElementById('w').innerHTML=items.map((it)=>'<div class="card"><div class="id">'+it.id+'</div><div class="figs">'+it.figures.map((f)=>figHTML(f)).join('')+'</div></div>').join('');
  </script></body></html>`;
  await page.setContent(html);
  const file = path.join(outdir, `${cat}-${String(k).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}
await browser.close();
