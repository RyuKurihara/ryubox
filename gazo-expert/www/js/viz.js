// 図解ラボ：用語ごとの「動く処理イメージ」。すべてブラウザ内で実際に画素計算する。
'use strict';
const VIZ = (() => {
  const V = {}; // termId -> {title, run(el)}
  const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);
  const img = (w, h, f = 0) => ({ w, h, d: new Float32Array(w * h).fill(f) });
  const px = (a, x, y) => a.d[Math.min(a.h - 1, Math.max(0, y)) * a.w + Math.min(a.w - 1, Math.max(0, x))];
  const h = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

  // ---------- 表示部品 ----------
  function toCanvas(a, opt = {}) {
    // a: gray image / {r,g,b} / {rgb:[r,g,b] images}
    const c = h('canvas', { className: 'pix vz' }); const w = (a.w || a.r.w), H = (a.h || a.r.h); c.width = w; c.height = H;
    const ctx = c.getContext('2d'), im = ctx.createImageData(w, H);
    for (let i = 0; i < w * H; i++) {
      let r, g, b;
      if (a.r) { r = a.r.d[i]; g = a.g.d[i]; b = a.b.d[i]; }
      else if (opt.cmap) { [r, g, b] = opt.cmap(a.d[i]); }
      else r = g = b = a.d[i];
      im.data[i * 4] = clamp(r); im.data[i * 4 + 1] = clamp(g); im.data[i * 4 + 2] = clamp(b); im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    c.style.width = (opt.size || 120) + 'px'; c.style.height = Math.round((opt.size || 120) * H / w) + 'px';
    return c;
  }
  const jet = (v) => { const t = clamp(v, 0, 255) / 255; return [clamp(255 * (1.5 - Math.abs(4 * t - 3))), clamp(255 * (1.5 - Math.abs(4 * t - 2))), clamp(255 * (1.5 - Math.abs(4 * t - 1)))]; };
  const LABELC = [[255, 255, 255], [230, 57, 70], [42, 157, 143], [233, 196, 106], [69, 123, 157], [244, 162, 97], [131, 56, 236], [6, 214, 160], [255, 0, 110], [58, 134, 255], [251, 86, 7], [138, 201, 38]];
  function fig(node, cap) { const d = h('div', { className: 'fig' }); d.appendChild(node); if (cap) d.appendChild(h('div', { className: 'cap' }, cap)); return d; }
  function rowOf(items) { const r = h('div', { className: 'figs' }); items.forEach((it) => r.appendChild(it)); return r; }
  function arrow() { return h('div', { className: 'vz-arrow' }, '→'); }
  function control(label, min, max, step, val, fmt, on) {
    const w = h('label', { className: 'vz-ctl' }); const s = h('span'); const inp = h('input', { type: 'range', min, max, step, value: val });
    const upd = () => { s.textContent = `${label}：${fmt ? fmt(+inp.value) : inp.value}`; };
    inp.addEventListener('input', () => { upd(); on(+inp.value); }); upd(); w.appendChild(s); w.appendChild(inp); return w;
  }
  function select(label, opts, val, on) {
    const w = h('label', { className: 'vz-ctl' }); w.appendChild(h('span', {}, label));
    const s = h('select'); opts.forEach(([v, t]) => { const o = h('option', { value: v }, t); if (v === val) o.selected = true; s.appendChild(o); });
    s.addEventListener('change', () => on(s.value)); w.appendChild(s); return w;
  }
  function note(html) { return h('div', { className: 'vz-note' }, html); }
  function gridTable(a, x0, y0, n, opt = {}) {
    let s = '<table class="gt">';
    for (let y = y0; y < y0 + n; y++) { s += '<tr>'; for (let x = x0; x < x0 + n; x++) { const v = Math.round(px(a, x, y)); const g = clamp(opt.mapv ? opt.mapv(v) : v); s += `<td style="background:rgb(${g},${g},${g});color:${g < 128 ? '#fff' : '#000'}${opt.hl && opt.hl(x, y) ? ';outline:3px solid #e33;outline-offset:-3px' : ''}">${v}</td>`; } s += '</tr>'; }
    return h('div', {}, s + '</table>');
  }
  function svgPlot(series, opt = {}) {
    // series: [{pts:[[x,y]...], color}], 軸自動
    const W = opt.w || 280, H = opt.h || 120, P = 22; let xs = [], ys = [];
    series.forEach((s) => s.pts.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
    const x0 = opt.x0 ?? Math.min(...xs), x1 = opt.x1 ?? Math.max(...xs), y0 = opt.y0 ?? Math.min(0, ...ys), y1 = opt.y1 ?? (Math.max(...ys) * 1.05 || 1);
    const X = (x) => P + ((x - x0) / (x1 - x0 || 1)) * (W - P - 6), Y = (y) => H - 16 - ((y - y0) / (y1 - y0 || 1)) * (H - 24);
    let g = `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#fff"/><line x1="${P}" y1="${H - 16}" x2="${W - 4}" y2="${H - 16}" stroke="#999"/><line x1="${P}" y1="6" x2="${P}" y2="${H - 16}" stroke="#999"/>`;
    series.forEach((s) => {
      if (s.bars) s.pts.forEach(([x, y]) => { g += `<rect x="${X(x)}" y="${Y(y)}" width="${Math.max(1, (W - P) / s.pts.length - 0.5)}" height="${H - 16 - Y(y)}" fill="${s.color}"/>`; });
      else g += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" ${s.dash ? 'stroke-dasharray="4 3"' : ''} points="${s.pts.map(([x, y]) => X(x).toFixed(1) + ',' + Y(y).toFixed(1)).join(' ')}"/>`;
    });
    (opt.marks || []).forEach((m) => { g += `<line x1="${X(m.x)}" y1="6" x2="${X(m.x)}" y2="${H - 16}" stroke="${m.color || '#e33'}" stroke-dasharray="3 2"/><text x="${X(m.x) + 3}" y="14" font-size="10" fill="${m.color || '#e33'}">${m.label || ''}</text>`; });
    g += `<text x="${W - 4}" y="${H - 3}" font-size="9" text-anchor="end" fill="#666">${opt.xl || ''}</text><text x="${P + 2}" y="12" font-size="9" fill="#666">${opt.yl || ''}</text></svg>`;
    return h('div', {}, g);
  }
  function code(txt) { const d = h('details', { className: 'vz-code' }); d.appendChild(h('summary', {}, '🧑‍💻 この図解の実装（Python/NumPy）')); d.appendChild(h('pre', {}, txt.replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;')))); return d; }

  // ---------- 基本画像処理 ----------
  function conv(a, k, raw) { const kh = k.length, kw = k[0].length, oy = kh >> 1, ox = kw >> 1, b = img(a.w, a.h); for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { let s = 0; for (let j = 0; j < kh; j++) for (let i = 0; i < kw; i++) s += k[j][i] * px(a, x + i - ox, y + j - oy); b.d[y * a.w + x] = raw ? s : clamp(s); } return b; }
  function gaussK(s) { const r = Math.max(1, Math.ceil(2.5 * s)), k = []; let sum = 0; for (let j = -r; j <= r; j++) { const row = []; for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i + j * j) / (2 * s * s)); row.push(v); sum += v; } k.push(row); } return k.map((r) => r.map((v) => v / sum)); }
  function rankF(a, r, f) { const b = img(a.w, a.h), buf = []; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { buf.length = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) buf.push(px(a, x + i, y + j)); b.d[y * a.w + x] = f(buf); } return b; }
  const med = (v) => { v.sort((p, q) => p - q); return v[v.length >> 1]; };
  function scene(n = 80) { return IP.scene(n); }
  function colorScene(n = 72) {
    const r = img(n, n), g = img(n, n), b = img(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x; let R = 120 + x, G = 160 - y * 0.6, B = 210 - x * 0.5; // 空のグラデーション
      if (y > n * 0.62) { R = 70; G = 140 + (x % 9 < 4 ? 15 : 0); B = 60; } // 芝生
      if ((x - n * 0.3) ** 2 + (y - n * 0.3) ** 2 < (n * 0.13) ** 2) { R = 250; G = 200; B = 40; } // 太陽
      if (x > n * 0.55 && x < n * 0.85 && y > n * 0.35 && y < n * 0.7) { R = 200; G = 40; B = 40; } // 赤い家
      if (x > n * 0.62 && x < n * 0.7 && y > n * 0.45 && y < n * 0.55) { R = 240; G = 240; B = 250; } // 窓
      if (y > n * 0.62 && Math.abs(x - n * 0.2) < 2) { R = G = B = 30; } // 細い棒（偽色が出やすい）
      r.d[i] = R; g.d[i] = G; b.d[i] = B;
    }
    return { r, g, b, w: n, h: n };
  }

  // ======================================================================
  // 3次元計測：空間コード化法・グレイコード
  // ======================================================================
  function heightMap(n) {
    // 平面上に半球と箱が置かれたシーン（高さ 0..1）
    const z = img(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0; const dx = x - n * 0.32, dy = y - n * 0.5, r = n * 0.22;
      if (dx * dx + dy * dy < r * r) v = Math.sqrt(r * r - dx * dx - dy * dy) / r;
      if (x > n * 0.62 && x < n * 0.86 && y > n * 0.25 && y < n * 0.75) v = 0.6;
      z.d[y * n + x] = v;
    }
    return z;
  }
  const gray = (k) => k ^ (k >> 1);
  const gray2bin = (g) => { let b = 0; for (; g; g >>= 1) b ^= g; return b; };
  function structuredLight(el, startBits = 5) {
    const n = 96, z = heightMap(n), K = 14; // K: 高さ1あたりのずれ（画素）
    let bits = startBits, sel = [Math.round(n * 0.32), Math.round(n * 0.5)], showBin = false;
    const ui = h('div'); el.appendChild(ui);
    const ctl = h('div', { className: 'vz-ctls' }); el.prepend(ctl);
    ctl.appendChild(control('パターン枚数（ビット数）', 3, 7, 1, bits, (v) => `${v}枚 → ${2 ** v}本の縞を区別`, (v) => { bits = v; draw(); }));
    ctl.appendChild(select('符号', [['gray', 'グレイコード'], ['bin', '純2進コード']], 'gray', (v) => { showBin = v === 'bin'; draw(); }));
    function projCol(x, y) { return x - K * z.d[y * n + x]; } // カメラ画素(x,y)に光を当てたプロジェクタの列（左にずれる）
    function codeOf(c) { const N = 2 ** bits, k = Math.max(0, Math.min(N - 1, Math.floor((c / n) * N))); return showBin ? k : gray(k); }
    function draw() {
      ui.innerHTML = '';
      const N = 2 ** bits;
      // 投影パターン（平面に投影した場合）と、撮影画像（物体で歪む）
      const flat = [], cap = [];
      for (let b = 0; b < bits; b++) {
        const f = img(n, n), c = img(n, n), sh = bits - 1 - b;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          f.d[y * n + x] = ((codeOf(x) >> sh) & 1) ? 235 : 25;
          const v = ((codeOf(projCol(x, y)) >> sh) & 1) ? 235 : 25;
          const shade = 0.75 + 0.25 * (1 - z.d[y * n + x]);
          c.d[y * n + x] = v * shade;
        }
        flat.push(f); cap.push(c);
      }
      ui.appendChild(note(`<b>① プロジェクタが投影する縞パターン</b>（平らな壁に映した場合）。1枚目が最上位ビット：左半分黒・右半分白。枚数を増やすほど細かくなり、<b>${bits}枚で ${N} 本</b>の縦の帯を区別できる。`));
      ui.appendChild(rowOf(flat.map((f, i) => fig(toCanvas(f, { size: 76 }), `${i + 1}枚目`))));
      ui.appendChild(note('<b>② 物体（左：半球、右：箱）に投影してカメラで撮った画像</b>。物体の高さの分だけ縞が<b>横にずれて曲がって</b>写る。これが形状の手がかり。'));
      const capRow = rowOf(cap.map((f, i) => { const c = toCanvas(f, { size: 76 }); c.dataset.i = i; return fig(c, `撮影${i + 1}`); }));
      ui.appendChild(capRow);
      // 復号
      const col = img(n, n), depth = img(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let g = 0; for (let b = 0; b < bits; b++) g = (g << 1) | (cap[b].d[y * n + x] > 110 ? 1 : 0);
        const k = showBin ? g : gray2bin(g); col.d[y * n + x] = (k / (N - 1)) * 255;
        const pc = ((k + 0.5) / N) * n; depth.d[y * n + x] = clamp(((x - pc) / K) * 255);
      }
      ui.appendChild(note(`<b>③ 各画素で「白=1・黒=0」を${bits}枚分読む</b> → ビット列（${showBin ? '2進' : 'グレイ'}コード）→ 10進の<b>列番号</b>（そのカメラ画素を照らしたプロジェクタの何番目の帯か）。<b>④ カメラ画素の位置と列番号のずれから三角測量</b> → 奥行き（明るいほど高い）。画像をタップすると、その画素の解読過程を表示。`));
      const cc = toCanvas(col, { size: 130, cmap: jet }), dc = toCanvas(depth, { size: 130, cmap: jet });
      ui.appendChild(rowOf([fig(cc, '③ 列番号マップ'), arrow(), fig(dc, '④ 奥行きマップ')]));
      const info = h('div', { className: 'explain' }); ui.appendChild(info);
      const pick = (e) => { const r = e.target.getBoundingClientRect(); sel = [Math.floor(((e.clientX - r.left) / r.width) * n), Math.floor(((e.clientY - r.top) / r.height) * n)]; showSel(); };
      [cc, dc].concat([...capRow.querySelectorAll('canvas')]).forEach((c) => c.addEventListener('click', pick));
      function showSel() {
        const [x, y] = sel; let bs = '', g = 0;
        for (let b = 0; b < bits; b++) { const v = cap[b].d[y * n + x] > 110 ? 1 : 0; bs += v; g = (g << 1) | v; }
        const k = showBin ? g : gray2bin(g); const pc = ((k + 0.5) / N) * n;
        info.innerHTML = `画素 (x=${x}, y=${y})：撮影1〜${bits} の明暗 = <b>${bs.split('').map((c) => (c === '1' ? '白' : '黒')).join('・')}</b><br>→ ${showBin ? '2進' : 'グレイ'}コード <b>${bs}</b>${showBin ? '' : ` → 2進に変換 <b>${k.toString(2).padStart(bits, '0')}</b>`} → 列番号 <b>${k}</b>（全${N}本中）<br>→ この列の光は本来 x≈${pc.toFixed(1)} に当たるはずが x=${x} で観測 → ずれ ${(x - pc).toFixed(1)} 画素 → 高さ ≈ ${((x - pc) / K).toFixed(2)}（真値 ${z.d[y * n + x].toFixed(2)}）`;
      }
      showSel();
      if (!showBin) ui.appendChild(note('💡<b>グレイコードの利点</b>：隣り合う列の符号が<b>1ビットしか違わない</b>（例: 3=010, 4=110）。縞の境目で1枚読み間違えても列番号の誤差は1本で済む。純2進コード（3=011→4=100は3ビット同時に変わる）だと境目で大きな誤りが出る。「符号」を純2進に切り替えて③の境界を比べてみよう。'));
      const tb = []; for (let k = 0; k < Math.min(N, 8); k++) tb.push(`<tr><td>${k}</td><td>${k.toString(2).padStart(3, '0')}</td><td><b>${gray(k).toString(2).padStart(3, '0')}</b></td></tr>`);
      ui.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>列</th><th>2進</th><th>グレイ</th></tr>${tb.join('')}</table>`));
    }
    draw();
    el.appendChild(code(`import numpy as np
# --- パターン生成（プロジェクタ幅 W 画素、n ビット）---
def gray_patterns(W, H, n):
    cols = np.arange(W) * (2**n) // W        # 各列の帯番号 0..2^n-1
    g = cols ^ (cols >> 1)                   # 2進 → グレイコード
    return [np.tile(((g >> (n-1-b)) & 1) * 255, (H, 1)).astype(np.uint8)
            for b in range(n)]               # 上位ビットから n 枚

# --- 復号：撮影した n 枚から各画素の列番号を求める ---
def decode(captured, white, black):
    th = (white.astype(float) + black) / 2   # 全白/全黒投影画像の中間をしきい値に
    g = np.zeros(captured[0].shape, int)
    for img in captured:                     # 上位ビットから順に
        g = (g << 1) | (img > th)
    b = g.copy(); s = g >> 1
    while s.any():                           # グレイ → 2進
        b ^= s; s >>= 1
    return b                                 # = プロジェクタの列番号
# 列番号とカメラ画素位置の対応から三角測量（平行配置なら Z = f*B / (x_cam - x_proj)）`));
  }
  V['d3-structured-light'] = { title: '空間コード化法：縞パターンの見た目と解読', run: (el) => structuredLight(el, 5) };
  V['d3-gray-code'] = { title: 'グレイコード縞の投影と解読', run: (el) => structuredLight(el, 4) };

  // ---------- 位相シフト法 ----------
  V['d3-phase-shift'] = {
    title: '位相シフト法：4枚の正弦縞から位相（＝列位置）を求める',
    run(el) {
      const n = 96, z = heightMap(n), K = 10; let periods = 4;
      const ui = h('div'); el.appendChild(control('縞の本数', 2, 8, 1, periods, (v) => v + '周期', (v) => { periods = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const I = [];
        for (let k = 0; k < 4; k++) { const a = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = x - K * z.d[y * n + x]; a.d[y * n + x] = 128 + 100 * Math.cos((2 * Math.PI * periods * p) / n + (k * Math.PI) / 2); } I.push(a); }
        ui.appendChild(note('<b>①</b> 正弦波の縞を <b>90°（1/4周期）ずつずらして4回</b>投影・撮影する。物体の高さに応じて縞が曲がる。'));
        ui.appendChild(rowOf(I.map((a, k) => fig(toCanvas(a, { size: 76 }), `φ+${k * 90}°`))));
        const ph = img(n, n), un = img(n, n);
        for (let i = 0; i < n * n; i++) { const p = Math.atan2(I[3].d[i] - I[1].d[i], I[0].d[i] - I[2].d[i]); ph.d[i] = ((p + Math.PI) / (2 * Math.PI)) * 255; }
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = x - K * z.d[y * n + x]; un.d[y * n + x] = clamp(((x - p) / K) * 255); }
        ui.appendChild(note('<b>②</b> 各画素で φ = atan2(I₄−I₂, I₁−I₃)。明るさの絶対値や物体の色（反射率）に左右されずに位相が出る。ただし 0〜2π で<b>折り返す</b>（のこぎり波状）ので、<b>③ 位相接続（アンラップ）</b>をして連続な位置にし、三角測量で高さにする。グレイコードで縞の番号を求めて位相接続に使う方法がよく使われる。'));
        ui.appendChild(rowOf([fig(toCanvas(ph, { size: 120 }), '② 折り返した位相'), arrow(), fig(toCanvas(un, { size: 120, cmap: jet }), '③ 接続→高さ')]));
        const prof = []; for (let x = 0; x < n; x++) prof.push([x, ph.d[(n >> 1) * n + x]]);
        ui.appendChild(svgPlot([{ pts: prof, color: '#3563e9' }], { xl: 'x（中央の行）', yl: '位相', y0: 0, y1: 255 }));
      }
      draw();
      el.appendChild(code(`import numpy as np
# I1..I4: 位相を 0, 90, 180, 270° ずらした縞を投影して撮った画像（float）
phi = np.arctan2(I4 - I2, I1 - I3)        # -π..π に折り返した位相
# 縞番号 k（例：グレイコードで別途求める）で位相接続
phi_abs = phi + 2*np.pi*k
x_proj = phi_abs / (2*np.pi) * period      # プロジェクタ上の位置 → 三角測量`));
    },
  };

  // ---------- 光切断法 ----------
  V['d3-light-section'] = {
    title: '光切断法：1本のレーザ線の曲がりから断面形状を測る',
    run(el) {
      const n = 96, z = heightMap(n), K = 16; let row = 48;
      const ui = h('div'); el.appendChild(control('レーザを当てる位置（y）', 8, 88, 1, row, null, (v) => { row = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const a = img(n, n); const prof = [];
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a.d[y * n + x] = 40 + 50 * (1 - z.d[y * n + x]);
        for (let x = 0; x < n; x++) { const hgt = z.d[row * n + x]; const yy = Math.round(row - K * hgt); for (let t = -1; t <= 0; t++) if (yy + t >= 0) a.d[(yy + t) * n + x] = 255; prof.push([x, hgt]); }
        ui.appendChild(note('スリット状のレーザ光を斜めから当て、カメラで撮る。平面の上では真っすぐな線だが、<b>物体の上では高さの分だけ上にずれて写る</b>。ずれ量 → 三角測量で高さ。物体を動かしながら（またはレーザを走査しながら）1ラインずつ測り、断面を積み重ねて3次元形状にする。'));
        ui.appendChild(rowOf([fig(toCanvas(a, { size: 150 }), 'カメラ画像（白線がレーザ）'), fig(svgPlot([{ pts: prof, color: '#e33' }], { w: 180, h: 110, xl: 'x', yl: '高さ', y0: 0, y1: 1.1 }), '得られる断面形状')]));
      }
      draw();
      el.appendChild(code(`import numpy as np
# img: レーザを当てた撮影画像（グレー）。各列で最も明るい行＝線の位置
line_y = img.argmax(axis=0)                 # サブピクセル化するなら重心を取る
height = (y_base - line_y) / K              # 基準（平面）からのずれ → 高さ（K は幾何で決まる係数）`));
    },
  };

  // ---------- 平行ステレオ・視差・ブロックマッチング ----------
  function stereoDemo(el) {
    const n = 72; let win = 2, maxD = 12;
    // ランダムドットステレオ：背景視差2、四角視差9、円視差6
    const dispTrue = img(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let d = 2; if (x > 10 && x < 34 && y > 14 && y < 50) d = 9; if ((x - 52) ** 2 + (y - 40) ** 2 < 140) d = 6; dispTrue.d[y * n + x] = d; }
    const R = img(n, n); for (let i = 0; i < n * n; i++) R.d[i] = Math.random() < 0.5 ? 30 : 220;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 23 === 0) R.d[y * n + x] = 128;
    const L = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = dispTrue.d[y * n + x]; L.d[y * n + x] = px(R, x - d, y); }
    const ui = h('div');
    el.appendChild(control('ブロックの大きさ', 0, 4, 1, win, (v) => `${2 * v + 1}×${2 * v + 1}`, (v) => { win = v; draw(); }));
    el.appendChild(ui);
    function draw() {
      ui.innerHTML = '';
      ui.appendChild(note('左右に平行に並べた2台のカメラの画像（ランダムな点模様。片目では何も見えないが、中央に四角と円が浮いている）。<b>近い物ほど左右画像でのずれ（視差 d）が大きい</b>。左画像の各ブロックについて、右画像の<b>同じ行（エピポーラ線）上</b>を左右に探し、SAD が最小になるずれを視差とする。'));
      ui.appendChild(rowOf([fig(toCanvas(L, { size: 110 }), '左カメラ'), fig(toCanvas(R, { size: 110 }), '右カメラ')]));
      const D = img(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let best = 1e9, bd = 0;
        for (let d = 0; d <= maxD; d++) { let s = 0; for (let j = -win; j <= win; j++) for (let i = -win; i <= win; i++) s += Math.abs(px(L, x + i, y + j) - px(R, x + i - d, y + j)); if (s < best) { best = s; bd = d; } }
        D.d[y * n + x] = (bd / maxD) * 255;
      }
      const T = img(n, n); for (let i = 0; i < n * n; i++) T.d[i] = (dispTrue.d[i] / maxD) * 255;
      ui.appendChild(rowOf([fig(toCanvas(D, { size: 130, cmap: jet }), `推定した視差（${2 * win + 1}×${2 * win + 1}）`), fig(toCanvas(T, { size: 90, cmap: jet }), '正解')]));
      ui.appendChild(note(`赤いほど視差が大きい＝<b>近い</b>。奥行きは <b>Z = f·B / d</b>（f: 焦点距離, B: 基線長）。ブロックが小さいと模様の手がかりが少なくノイズだらけ、大きいと境界がぼやける（<b>トレードオフ</b>）。スライダーで確認しよう。`));
    }
    draw();
    el.appendChild(code(`import numpy as np
def block_matching(L, R, max_d=16, w=2):
    H, W = L.shape; D = np.zeros((H, W), int)
    for y in range(w, H-w):
        for x in range(w+max_d, W-w):
            blk = L[y-w:y+w+1, x-w:x+w+1].astype(int)
            sad = [np.abs(blk - R[y-w:y+w+1, x-d-w:x-d+w+1]).sum()  # 同じ行を左へ d ずらして比較
                   for d in range(max_d+1)]
            D[y, x] = int(np.argmin(sad))                         # SAD最小のずれ＝視差
    return D
# OpenCV: cv2.StereoBM_create(numDisparities=16, blockSize=5).compute(L, R)
# 奥行き Z = f * B / D`));
  }
  ['d3-parallel-stereo', 'd3-disparity', 'd3-block-matching'].forEach((id) => (V[id] = { title: '平行ステレオ：左右画像から視差マップを作る', run: stereoDemo }));

  // ---------- 照度差ステレオ ----------
  V['d3-photometric-stereo'] = {
    title: '照度差ステレオ：光源を変えた3枚から法線を求める',
    run(el) {
      const n = 72, Ls = [[-0.5, -0.3, 0.81], [0.55, -0.3, 0.78], [0, 0.6, 0.8]];
      const N = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - n / 2) / (n * 0.42), v = (y - n / 2) / (n * 0.42); const r2 = u * u + v * v; N.push(r2 < 1 ? [u, v, Math.sqrt(1 - r2)] : null); }
      const alb = (x, y) => ((Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 0.95 : 0.6); // 市松の反射率
      const I = Ls.map((l) => { const a = img(n, n); N.forEach((nv, i) => { if (nv) a.d[i] = 255 * alb(i % n, (i / n) | 0) * Math.max(0, nv[0] * l[0] + nv[1] * l[1] + nv[2] * l[2]); }); return a; });
      el.appendChild(note('ランバート面の明るさは <b>I = ρ (n·l)</b>（ρ: 反射率, n: 法線, l: 光源方向）。カメラを固定し、<b>光源の方向だけ変えて3枚</b>撮ると、各画素で未知数3つ（ρn）の連立方程式が解ける。'));
      el.appendChild(rowOf(I.map((a, k) => fig(toCanvas(a, { size: 80 }), ['左上から照明', '右上から照明', '下から照明'][k]))));
      const inv = invert3(Ls);
      const nr = img(n, n), ng = img(n, n), nb = img(n, n), al = img(n, n);
      for (let i = 0; i < n * n; i++) { const b = [I[0].d[i], I[1].d[i], I[2].d[i]].map((v) => v / 255); const g = [0, 1, 2].map((r) => inv[r][0] * b[0] + inv[r][1] * b[1] + inv[r][2] * b[2]); const rho = Math.hypot(...g); if (rho > 0.02) { nr.d[i] = (g[0] / rho + 1) * 127; ng.d[i] = (g[1] / rho + 1) * 127; nb.d[i] = (g[2] / rho + 1) * 127; al.d[i] = rho * 255; } }
      el.appendChild(rowOf([fig(toCanvas({ r: nr, g: ng, b: nb }, { size: 110 }), '法線マップ（x→R, y→G, z→B）'), fig(toCanvas(al, { size: 110 }), '反射率ρ（模様だけ残る）')]));
      el.appendChild(note('法線（面の向き）と反射率が<b>分離</b>される：明るさの違いが「形のせい」か「色のせい」かを区別できる。法線を積分すると形状（高さ）が得られる。影や鏡面反射がある画素では成り立たない。'));
      el.appendChild(code(`import numpy as np
# I: (3, H, W) 3光源での画像, Lmat: (3,3) 各行が光源方向ベクトル
b = I.reshape(3, -1)                    # 各画素の明るさ3つ
g = np.linalg.solve(Lmat, b)            # g = ρ n  （3元連立方程式）
rho = np.linalg.norm(g, axis=0)         # 反射率
n = g / (rho + 1e-9)                    # 単位法線
# 4枚以上なら最小二乗: g = np.linalg.lstsq(Lmat, b, rcond=None)[0]`));
    },
  };
  function invert3(m) { const [a, b, c] = m[0], [d, e, f] = m[1], [g, hh, i] = m[2]; const A = e * i - f * hh, B = -(d * i - f * g), C = d * hh - e * g, det = a * A + b * B + c * C; return [[A / det, -(b * i - c * hh) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * hh - b * g) / det, (a * e - b * d) / det]]; }

  // ---------- 透視投影 ----------
  function perspectiveDemo(el) {
    let f = 2, dist = 6, ang = 30;
    const svgBox = h('div'); el.appendChild(control('焦点距離 f', 1, 5, 0.1, f, (v) => v.toFixed(1), (v) => { f = v; draw(); }));
    el.appendChild(control('立方体までの距離 Z', 3, 14, 0.5, dist, null, (v) => { dist = v; draw(); }));
    el.appendChild(control('立方体の回転', 0, 90, 1, ang, (v) => v + '°', (v) => { ang = v; draw(); }));
    el.appendChild(svgBox);
    function draw() {
      const c = Math.cos((ang * Math.PI) / 180), s = Math.sin((ang * Math.PI) / 180);
      const V3 = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V3.push([x * c + z * s, y, -x * s + z * c + dist]);
      const P = V3.map(([X, Y, Z]) => [(f * X) / Z, (f * Y) / Z]); const O = V3.map(([X, Y]) => [X * f / dist, Y * f / dist]);
      const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      const sc = 60, mk = (pts, col, dash) => E.map(([a, b]) => `<line x1="${150 + pts[a][0] * sc}" y1="${90 - pts[a][1] * sc}" x2="${150 + pts[b][0] * sc}" y2="${90 - pts[b][1] * sc}" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="4 3"' : ''}/>`).join('');
      svgBox.innerHTML = `<svg viewBox="0 0 300 180" width="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="180" fill="#fff"/>${mk(O, '#aaa', true)}${mk(P, '#3563e9')}<text x="6" y="14" font-size="11" fill="#3563e9">透視投影 x=fX/Z</text><text x="6" y="28" font-size="11" fill="#999">破線：正射影（弱透視）</text></svg>`;
    }
    draw();
    el.appendChild(note('透視投影では <b>x = fX/Z, y = fY/Z</b>：遠い辺ほど小さく写り、平行な辺が画像上では<b>消失点</b>に向かって収束する。Z を大きくすると（遠くから望遠で撮ると）奥行きの差が相対的に小さくなり、正射影（弱透視投影）に近づく。'));
    el.appendChild(code(`import numpy as np
K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]])   # 内部パラメータ
X = np.array([X, Y, Z])                              # カメラ座標の点
u, v, w = K @ X
x, y = u / w, v / w                                  # = (f X/Z + cx, f Y/Z + cy)`));
  }
  ['cam-perspective', 'd3-pinhole', 'd3-projection-matrix'].forEach((id) => (V[id] = { title: 'ピンホールカメラ：透視投影で立方体がどう写るか', run: perspectiveDemo }));

  // ======================================================================
  // 空間フィルタ
  // ======================================================================
  const FILT = {
    average: ['平均化(移動平均)', (a, p) => conv(a, Array.from({ length: 2 * p + 1 }, () => Array(2 * p + 1).fill(1 / (2 * p + 1) ** 2))), '窓の半径', 1, 4],
    gaussian: ['ガウシアン', (a, p) => conv(a, gaussK(p)), 'σ', 0.6, 3, 1.4],
    median: ['メディアン', (a, p) => rankF(a, p, med), '窓の半径', 1, 3],
    bilateral: ['バイラテラル', (a, p) => bilateral(a, 2, p), 'σ_濃度', 10, 80, 40],
    sobel: ['ソーベル(勾配強度)', (a) => { const gx = conv(a, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 1), gy = conv(a, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 1), b = img(a.w, a.h); for (let i = 0; i < b.d.length; i++) b.d[i] = clamp(Math.hypot(gx.d[i], gy.d[i]) / 3); return b; }],
    laplacian: ['ラプラシアン(絶対値)', (a) => { const b = conv(a, [[1, 1, 1], [1, -8, 1], [1, 1, 1]], 1); for (let i = 0; i < b.d.length; i++) b.d[i] = clamp(Math.abs(b.d[i])); return b; }],
    log: ['LoG(ゼロ交差を白)', (a, p) => zeroCross(conv(conv(a, gaussK(p)), [[0, 1, 0], [1, -4, 1], [0, 1, 0]], 1)), 'σ', 0.8, 3, 1.4],
    sharpen: ['ラプラシアン鮮鋭化', (a, p) => { const l = conv(a, [[0, 1, 0], [1, -4, 1], [0, 1, 0]], 1), b = img(a.w, a.h); for (let i = 0; i < b.d.length; i++) b.d[i] = clamp(a.d[i] - p * l.d[i]); return b; }, '強さ k', 0.2, 2, 1],
    unsharp: ['アンシャープマスキング', (a, p) => { const bl = conv(a, gaussK(1.5)), b = img(a.w, a.h); for (let i = 0; i < b.d.length; i++) b.d[i] = clamp(a.d[i] + p * (a.d[i] - bl.d[i])); return b; }, '強さ k', 0.2, 3, 1.5],
    canny: ['キャニー法', (a, p) => canny(a, p).out, '高しきい値', 20, 120, 60],
  };
  function bilateral(a, r, sr) { const b = img(a.w, a.h), ss = 1.5; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const c = px(a, x, y); let s = 0, ws = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const v = px(a, x + i, y + j), w = Math.exp(-(i * i + j * j) / (2 * ss * ss) - ((v - c) ** 2) / (2 * sr * sr)); s += w * v; ws += w; } b.d[y * a.w + x] = s / ws; } return b; }
  function zeroCross(l) { const b = img(l.w, l.h); for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) { const v = px(l, x, y); const z = (v * px(l, x + 1, y) < 0 && Math.abs(v - px(l, x + 1, y)) > 8) || (v * px(l, x, y + 1) < 0 && Math.abs(v - px(l, x, y + 1)) > 8); b.d[y * l.w + x] = z ? 255 : 0; } return b; }
  function canny(a, hi) {
    const g = conv(a, gaussK(1)), gx = conv(g, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 1), gy = conv(g, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 1);
    const W = a.w, H = a.h, mag = img(W, H), nms = img(W, H), out = img(W, H), lo = hi * 0.4;
    for (let i = 0; i < W * H; i++) mag.d[i] = Math.hypot(gx.d[i], gy.d[i]) / 4;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, an = ((Math.atan2(gy.d[i], gx.d[i]) * 180) / Math.PI + 180) % 180; let a1, a2;
      if (an < 22.5 || an >= 157.5) { a1 = mag.d[i - 1]; a2 = mag.d[i + 1]; } else if (an < 67.5) { a1 = mag.d[i - W + 1]; a2 = mag.d[i + W - 1]; } else if (an < 112.5) { a1 = mag.d[i - W]; a2 = mag.d[i + W]; } else { a1 = mag.d[i - W - 1]; a2 = mag.d[i + W + 1]; }
      nms.d[i] = mag.d[i] >= a1 && mag.d[i] >= a2 ? mag.d[i] : 0;
    }
    const st = []; for (let i = 0; i < W * H; i++) if (nms.d[i] >= hi) { out.d[i] = 255; st.push(i); }
    while (st.length) { const i = st.pop(); for (const o of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const j = i + o; if (j >= 0 && j < W * H && !out.d[j] && nms.d[j] >= lo) { out.d[j] = 255; st.push(j); } } }
    const cl = (m) => { const b = img(W, H); for (let i = 0; i < W * H; i++) b.d[i] = clamp(m.d[i] * 2); return b; };
    return { g, mag: cl(mag), nms: cl(nms), out };
  }
  function filterDemo(el, key) {
    let noise = key === 'median' ? 'salt' : key === 'bilateral' || key === 'gaussian' || key === 'average' ? 'gauss' : 'none';
    let fk = key, p = FILT[key][5] ?? FILT[key][3] ?? 0; let sel = [30, 22];
    const base = scene(80); let src;
    const ctls = h('div', { className: 'vz-ctls' }), ui = h('div'); el.appendChild(ctls); el.appendChild(ui);
    const mkSrc = () => { src = noise === 'salt' ? IP.addSaltPepper(base, 0.08) : noise === 'gauss' ? IP.addGauss(base, 20) : base; };
    function build() {
      ctls.innerHTML = '';
      ctls.appendChild(select('フィルタ', Object.entries(FILT).map(([k, v]) => [k, v[0]]), fk, (v) => { fk = v; p = FILT[v][5] ?? FILT[v][3] ?? 0; build(); draw(); }));
      ctls.appendChild(select('入力ノイズ', [['none', 'なし'], ['salt', 'ごま塩ノイズ'], ['gauss', 'ガウスノイズ']], noise, (v) => { noise = v; mkSrc(); draw(); }));
      const F = FILT[fk]; if (F[2]) ctls.appendChild(control(F[2], F[3], F[4], (F[4] - F[3]) / 20 < 1 && F[4] < 10 ? 0.1 : 1, p, (v) => (+v).toFixed(F[4] < 10 ? 1 : 0), (v) => { p = v; draw(); }));
    }
    function draw() {
      ui.innerHTML = ''; const F = FILT[fk]; const out = F[1](src, p);
      const ci = toCanvas(src, { size: 130 }), co = toCanvas(out, { size: 130 });
      ui.appendChild(rowOf([fig(ci, '入力'), arrow(), fig(co, F[0])]));
      if (fk === 'canny') { const c = canny(src, p); ui.appendChild(note('キャニー法の各段階：<b>①ガウシアンで平滑化 → ②ソーベルで勾配強度・方向 → ③非極大値抑制（勾配方向に見て最大の画素だけ残す＝線を1画素幅に細く） → ④ヒステリシスしきい値（高しきい値以上を確定エッジとし、低しきい値以上でつながっている画素だけ追加）</b>')); ui.appendChild(rowOf([fig(toCanvas(c.mag, { size: 90 }), '②勾配強度'), fig(toCanvas(c.nms, { size: 90 }), '③非極大値抑制'), fig(toCanvas(c.out, { size: 90 }), '④ヒステリシス')])); }
      const grid = h('div', { className: 'row', style: 'justify-content:center;gap:12px;flex-wrap:wrap' });
      const [x, y] = sel; grid.appendChild(fig(gridTable(src, x - 2, y - 2, 5, { hl: (a, b) => a === x && b === y }), `入力の画素値（中心 ${x},${y}）`));
      grid.appendChild(fig(gridTable(out, x - 2, y - 2, 5, { hl: (a, b) => a === x && b === y }), '出力の画素値'));
      ui.appendChild(note('画像をタップすると、その周りの 5×5 画素の値が出る（赤枠が注目画素）。数値で「何が起きているか」を確認しよう。'));
      ui.appendChild(grid);
      const pick = (e) => { const r = e.target.getBoundingClientRect(); sel = [Math.floor(((e.clientX - r.left) / r.width) * 80), Math.floor(((e.clientY - r.top) / r.height) * 80)]; draw(); };
      ci.addEventListener('click', pick); co.addEventListener('click', pick);
    }
    mkSrc(); build(); draw();
    el.appendChild(code(`import numpy as np, cv2
def correlate(img, k):                      # フィルタ処理の中身（相関）
    r = k.shape[0] // 2
    p = np.pad(img.astype(float), r, mode='edge')   # 端は画素を複製
    out = np.zeros_like(img, float)
    for j in range(k.shape[0]):
        for i in range(k.shape[1]):
            out += k[j, i] * p[j:j+img.shape[0], i:i+img.shape[1]]
    return out
mean   = correlate(img, np.ones((3,3))/9)               # cv2.blur(img,(3,3))
sobelx = correlate(img, np.array([[-1,0,1],[-2,0,2],[-1,0,1]]))  # cv2.Sobel(img,cv2.CV_64F,1,0)
lap    = correlate(img, np.array([[0,1,0],[1,-4,1],[0,1,0]]))    # cv2.Laplacian(img,cv2.CV_64F)
median = cv2.medianBlur(img, 3)     # 非線形：窓内を並べ替えて中央値
gauss  = cv2.GaussianBlur(img, (5,5), 1.0)
bilat  = cv2.bilateralFilter(img, 5, 50, 1.5)   # 距離と濃度差の両方で重み
edges  = cv2.Canny(img, 40, 100)                 # 低・高しきい値`));
  }
  const FMAP = { 'filter-average': 'average', 'filter-gaussian': 'gaussian', 'filter-median': 'median', 'filter-bilateral': 'bilateral', 'filter-sobel': 'sobel', 'filter-laplacian': 'laplacian', 'filter-log': 'log', 'filter-dog': 'log', 'filter-laplacian-sharpen': 'sharpen', 'filter-unsharp': 'unsharp', 'filter-canny': 'canny', 'filter-selective-local-average': 'bilateral', 'filter-knn-average': 'bilateral' };
  Object.entries(FMAP).forEach(([id, k]) => (V[id] = { title: 'フィルタ実験室：入力→出力と画素値', run: (el) => filterDemo(el, k) }));

  // ======================================================================
  // 濃淡変換
  // ======================================================================
  const CURVES = {
    linear: ['線形（コントラスト伸張）', (v, p) => (v - 128) * p + 128, '傾き', 0.3, 3, 1.8],
    gamma: ['ガンマ変換', (v, p) => 255 * Math.pow(v / 255, p), 'γ', 0.2, 3, 0.5],
    scurve: ['S字カーブ', (v, p) => 255 / (1 + Math.exp(-(v - 128) / p)), 'なだらかさ', 8, 60, 22],
    negative: ['ネガポジ反転', (v) => 255 - v],
    solarize: ['ソラリゼーション', (v) => (v < 128 ? v * 2 : (255 - v) * 2)],
    posterize: ['ポスタリゼーション', (v, p) => Math.min(p - 1, Math.floor((v / 256) * p)) * (255 / (p - 1)), '階調数', 2, 16, 4],
    eq: ['ヒストグラム平坦化', null],
  };
  function toneDemo(el, key) {
    let ck = key, p = CURVES[key][5] ?? 0; const src = IP.map(scene(80), (v) => 70 + v * 0.45); // 低コントラストの入力
    const ctls = h('div', { className: 'vz-ctls' }), ui = h('div'); el.appendChild(ctls); el.appendChild(ui);
    function build() {
      ctls.innerHTML = '';
      ctls.appendChild(select('変換', Object.entries(CURVES).map(([k, v]) => [k, v[0]]), ck, (v) => { ck = v; p = CURVES[v][5] ?? 0; build(); draw(); }));
      const C = CURVES[ck]; if (C[2]) ctls.appendChild(control(C[2], C[3], C[4], C[4] <= 3 ? 0.05 : 1, p, (v) => (+v).toFixed(C[4] <= 3 ? 2 : 0), (v) => { p = v; draw(); }));
    }
    function draw() {
      ui.innerHTML = ''; const C = CURVES[ck]; let f;
      if (ck === 'eq') { const hst = IP.hist(src), N = src.d.length, lut = []; let c = 0; for (let i = 0; i < 256; i++) { c += hst[i]; lut[i] = (c / N) * 255; } f = (v) => lut[Math.round(clamp(v))]; }
      else f = (v) => clamp(C[1](v, p));
      const out = IP.map(src, f);
      const curve = []; for (let v = 0; v <= 255; v += 3) curve.push([v, f(v)]);
      ui.appendChild(rowOf([fig(toCanvas(src, { size: 110 }), '入力（低コントラスト）'), arrow(), fig(toCanvas(out, { size: 110 }), C[0])]));
      ui.appendChild(rowOf([fig(svgPlot([{ pts: [[0, 0], [255, 255]], color: '#bbb', dash: 1, w: 1 }, { pts: curve, color: '#3563e9' }], { w: 140, h: 140, x0: 0, x1: 255, y0: 0, y1: 255, xl: '入力', yl: '出力' }), 'トーンカーブ'),
        fig(histPlot(src), '入力ヒストグラム'), fig(histPlot(out), '出力ヒストグラム')]));
      ui.appendChild(note({ linear: '傾きを1より大きくすると濃度の範囲が広がりコントラストが上がる（両端は 0/255 に<b>飽和</b>）。', gamma: 'γ<1 で暗部を持ち上げ（明るく）、γ>1 で暗部を沈める。ディスプレイの非線形を打ち消すガンマ補正にも使う。', scurve: '中間調の傾きを急にしてコントラストを上げ、両端はなだらか（飽和しにくい）。', negative: 'g = 255 − f。ヒストグラムは左右反転する。', solarize: 'ある濃度を境に折り返す。写真の露光過多で起きる現象に由来。', posterize: '階調数を減らすと、なめらかなグラデーションに<b>疑似輪郭</b>（段差）が出る。', eq: '累積ヒストグラムをトーンカーブとして使う。頻度の多い濃度範囲を広げ、分布を全域に広げる（出力ヒストグラムはすき間のある櫛状になる）。' }[ck]));
    }
    build(); draw();
    el.appendChild(code(`import numpy as np
lut = np.arange(256, dtype=float)
lut_gamma = 255 * (lut/255) ** gamma                 # ガンマ変換
lut_neg   = 255 - lut                                # ネガポジ反転
hist = np.bincount(img.ravel(), minlength=256)       # ヒストグラム
lut_eq = 255 * np.cumsum(hist) / img.size            # 平坦化：累積分布をトーンカーブに
out = lut_eq.astype(np.uint8)[img]                   # LUT で画素ごとに変換
# OpenCV: cv2.equalizeHist(img), cv2.LUT(img, lut)`));
  }
  function histPlot(a) { const hs = IP.hist(a, 64); return svgPlot([{ pts: hs.map((v, i) => [i, v]), color: '#334', bars: 1 }], { w: 130, h: 80, x0: 0, x1: 64 }); }
  const TMAP = { 'tone-tone-curve': 'linear', 'tone-piecewise': 'linear', 'tone-gamma': 'gamma', 'tone-s-curve': 'scurve', 'tone-solarization': 'solarize', 'tone-posterization': 'posterize', 'tone-hist-eq': 'eq', 'tone-ahe': 'eq', 'tone-clahe': 'eq', 'tone-false-contour': 'posterize', 'tone-gray-level-reduction': 'posterize', 'cam-false-contour': 'posterize', 'cam-quantization': 'posterize' };
  Object.entries(TMAP).forEach(([id, k]) => (V[id] = { title: 'トーンカーブ実験室：カーブ・画像・ヒストグラム', run: (el) => toneDemo(el, k) }));

  // ---------- ディザ ----------
  V['tone-ordered-dither'] = V['tone-bayer'] = V['tone-error-diffusion'] = V['tone-floyd-steinberg'] = {
    title: '2値化 vs 組織的ディザ vs 誤差拡散',
    run(el) {
      const n = 96, src = img(n, n); const s = scene(n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) src.d[y * n + x] = y < 24 ? (x / n) * 255 : s.d[y * n + x];
      const th = IP.map(src, (v) => (v >= 128 ? 255 : 0));
      const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
      const od = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) od.d[y * n + x] = src.d[y * n + x] > (B4[y % 4][x % 4] + 0.5) * 16 ? 255 : 0;
      const e = IP.clone(src), fs = img(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, o = e.d[i] >= 128 ? 255 : 0, er = e.d[i] - o; fs.d[i] = o; if (x + 1 < n) e.d[i + 1] += (er * 7) / 16; if (y + 1 < n) { if (x > 0) e.d[i + n - 1] += (er * 3) / 16; e.d[i + n] += (er * 5) / 16; if (x + 1 < n) e.d[i + n + 1] += er / 16; } }
      el.appendChild(rowOf([fig(toCanvas(src, { size: 100 }), '入力（上端はグラデーション）'), fig(toCanvas(th, { size: 100 }), '単純2値化（しきい値128）')]));
      el.appendChild(rowOf([fig(toCanvas(od, { size: 100 }), '組織的ディザ（4×4ベイヤー行列）'), fig(toCanvas(fs, { size: 100 }), '誤差拡散（Floyd–Steinberg）')]));
      el.appendChild(h('div', { className: 'figs' }, `<div class="fig"><table class="gt">${B4.map((r) => '<tr>' + r.map((v) => `<td>${v}</td>`).join('') + '</tr>').join('')}</table><div class="cap">ベイヤー型ディザ行列（×16+8 がしきい値）</div></div><div class="fig"><table class="gt"><tr><td></td><td style="background:#3563e9;color:#fff">●</td><td>7/16</td></tr><tr><td>3/16</td><td>5/16</td><td>1/16</td></tr></table><div class="cap">誤差拡散の配分（●が注目画素）</div></div>`));
      el.appendChild(note('白黒2値しか出せない装置で中間調を表す方法。<b>単純2値化</b>は階調が失われる。<b>組織的ディザ</b>は場所ごとにしきい値を変えた行列（ベイヤー型など）と比べるので、規則的な網目模様になる。<b>誤差拡散</b>は「2値化で生じた誤差（元の値−出力）」を右・下の未処理画素に配り、局所的な平均濃度を保つ。模様が不規則で自然に見える。'));
      el.appendChild(code(`import numpy as np
def floyd_steinberg(img):
    f = img.astype(float).copy(); H, W = f.shape; out = np.zeros_like(f)
    for y in range(H):
        for x in range(W):
            out[y, x] = 255 if f[y, x] >= 128 else 0
            e = f[y, x] - out[y, x]                    # 量子化誤差
            if x+1 < W: f[y, x+1] += e * 7/16          # 右
            if y+1 < H:
                if x > 0: f[y+1, x-1] += e * 3/16      # 左下
                f[y+1, x] += e * 5/16                   # 下
                if x+1 < W: f[y+1, x+1] += e * 1/16    # 右下
    return out
B4 = np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]])
H, W = img.shape
ordered = (img > (np.tile(B4, (H//4+1, W//4+1))[:H,:W] + 0.5) * 16) * 255`));
    },
  };

  // ======================================================================
  // 2値化・モルフォロジー・ラベリング・距離変換・細線化
  // ======================================================================
  V['binary-otsu'] = {
    title: '大津の方法：クラス間分散が最大になるしきい値',
    run(el) {
      const src = IP.addGauss(scene(80), 12); const hs = IP.hist(src); const N = src.d.length;
      const sb = []; let best = 0, bt = 0;
      for (let t = 1; t < 255; t++) { let w0 = 0, s0 = 0, s = 0; for (let i = 0; i < 256; i++) { s += i * hs[i]; if (i < t) { w0 += hs[i]; s0 += i * hs[i]; } } const w1 = N - w0; if (!w0 || !w1) { sb.push([t, 0]); continue; } const m0 = s0 / w0, m1 = (s - s0) / w1, v = (w0 / N) * (w1 / N) * (m0 - m1) ** 2; sb.push([t, v]); if (v > best) { best = v; bt = t; } }
      let t = bt; const ui = h('div');
      el.appendChild(control('しきい値 t', 1, 254, 1, t, (v) => v + (v === bt ? '（大津の最適値）' : ''), (v) => { t = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = '';
        ui.appendChild(rowOf([fig(toCanvas(src, { size: 110 }), '入力'), arrow(), fig(toCanvas(IP.map(src, (v) => (v >= t ? 255 : 0)), { size: 110 }), `t=${t} で2値化`)]));
        const hp = hs.map((v, i) => [i, v]); const mx = Math.max(...hs);
        ui.appendChild(svgPlot([{ pts: hp, color: '#99a', bars: 1 }, { pts: sb.map(([x, y]) => [x, (y / best) * mx]), color: '#e33' }], { w: 300, h: 130, x0: 0, x1: 255, marks: [{ x: bt, label: '最大', color: '#e33' }, { x: t, label: 't', color: '#3563e9' }], xl: '濃度（灰：ヒストグラム、赤：クラス間分散）' }));
        ui.appendChild(note('しきい値 t でヒストグラムを2クラスに分け、<b>クラス間分散 σ_B² = ω₀ω₁(μ₀−μ₁)²</b> を計算する。これが最大になる t を選ぶ（＝クラス内分散最小と等価）。ヒストグラムだけから自動でしきい値が決まり、山が2つ（双峰性）ならうまく分かれる。'));
      }
      draw();
      el.appendChild(code(`import numpy as np
hist = np.bincount(img.ravel(), minlength=256).astype(float)
p = hist / hist.sum(); i = np.arange(256)
w0 = np.cumsum(p); w1 = 1 - w0                    # 各 t での2クラスの割合
mu0 = np.cumsum(p*i) / np.maximum(w0, 1e-12)
mu1 = ((p*i).sum() - np.cumsum(p*i)) / np.maximum(w1, 1e-12)
sb = w0 * w1 * (mu0 - mu1)**2                     # クラス間分散
t = int(np.argmax(sb))                            # cv2.threshold(img,0,255,cv2.THRESH_OTSU)`));
    },
  };
  function binScene(n = 40) {
    const G = Array.from({ length: n }, () => Array(n).fill(0));
    const put = (f) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (f(x, y)) G[y][x] = 1; };
    put((x, y) => x > 3 && x < 16 && y > 4 && y < 18); put((x, y) => (x - 28) ** 2 + (y - 11) ** 2 < 42); put((x, y) => x > 6 && x < 34 && y > 24 && y < 33); put((x, y) => x > 15 && x < 22 && y > 9 && y < 12); // 細い橋
    G[10][9] = G[11][9] = G[10][10] = 0; G[28][14] = G[28][15] = 0; G[29][15] = 0; // 小さな穴
    [[2, 36], [3, 22], [37, 5], [20, 38], [36, 36]].forEach(([x, y]) => (G[y][x] = 1)); // ごみ
    for (let x = 24; x < 34; x++) G[21][x] = 1; // 細い突起
    return G;
  }
  const g2img = (G, on = 20, off = 245) => { const n = G.length, m = G[0].length, a = img(m, n); for (let y = 0; y < n; y++) for (let x = 0; x < m; x++) a.d[y * m + x] = G[y][x] ? on : off; return a; };
  function morphDemo(el, start) {
    let op = start, r = 1, shape = 'sq'; const src = binScene(); const ui = h('div'); const ctls = h('div', { className: 'vz-ctls' }); el.appendChild(ctls); el.appendChild(ui);
    ctls.appendChild(select('演算', [['dil', '膨張'], ['ero', '収縮'], ['open', 'オープニング（収縮→膨張）'], ['close', 'クロージング（膨張→収縮）'], ['tophat', 'トップハット（元−オープニング）']], op, (v) => { op = v; draw(); }));
    ctls.appendChild(select('構造要素', [['sq', '正方形'], ['cross', '十字']], shape, (v) => { shape = v; draw(); }));
    ctls.appendChild(control('構造要素の半径', 1, 3, 1, r, (v) => `${2 * v + 1}×${2 * v + 1}`, (v) => { r = v; draw(); }));
    function draw() {
      ui.innerHTML = ''; const se = Array.from({ length: 2 * r + 1 }, (_, j) => Array.from({ length: 2 * r + 1 }, (_, i) => (shape === 'sq' || i === r || j === r ? 1 : 0)));
      const f = { dil: (G) => IP.dilate(G, se), ero: (G) => IP.erode(G, se), open: (G) => IP.opening(G, se), close: (G) => IP.closing(G, se), tophat: (G) => { const o = IP.opening(G, se); return G.map((row, y) => row.map((v, x) => (v && !o[y][x] ? 1 : 0))); } }[op];
      const out = f(src); const diff = img(40, 40);
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) diff.d[y * 40 + x] = 0;
      const rC = img(40, 40), gC = img(40, 40), bC = img(40, 40);
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const a = src[y][x], b = out[y][x], i = y * 40 + x; const c = a && b ? [30, 30, 30] : b && !a ? [42, 157, 143] : a && !b ? [230, 57, 70] : [250, 250, 250]; rC.d[i] = c[0]; gC.d[i] = c[1]; bC.d[i] = c[2]; }
      ui.appendChild(rowOf([fig(toCanvas(g2img(src), { size: 120 }), '入力（黒=図形）'), arrow(), fig(toCanvas(g2img(out), { size: 120 }), '出力'), fig(toCanvas({ r: rC, g: gC, b: bC }, { size: 120 }), '差分：<span style="color:#2a9d8f">緑=増えた</span> <span style="color:#e63946">赤=消えた</span>')]));
      ui.appendChild(note({ dil: '<b>膨張</b>：構造要素を図形の各画素に置いて覆われる範囲を全部図形にする。図形が太り、<b>小さな穴やすき間が埋まる</b>。', ero: '<b>収縮</b>：構造要素が図形に完全に収まる位置だけ残す。図形が細り、<b>細い部分・孤立点（ごみ）が消える</b>。', open: '<b>オープニング</b>＝収縮→膨張。大きな図形の形はほぼ保ったまま、構造要素より細い<b>突起・橋・ごみを除去</b>。', close: '<b>クロージング</b>＝膨張→収縮。形を保ったまま<b>小さな穴・切れ目を埋める</b>。', tophat: '<b>トップハット</b>＝元画像−オープニング。オープニングで消えた「細い・小さい部分」だけが取り出せる。' }[op]));
    }
    draw();
    el.appendChild(code(`import numpy as np, cv2
se = np.ones((3,3), np.uint8)                       # 構造要素
def dilate(B, se):                                 # 中身：ずらした画像の OR
    r = se.shape[0]//2; P = np.pad(B, r); out = np.zeros_like(B)
    for j in range(se.shape[0]):
        for i in range(se.shape[1]):
            if se[j,i]: out |= P[j:j+B.shape[0], i:i+B.shape[1]]
    return out
def erode(B, se):                                  # ずらした画像の AND
    r = se.shape[0]//2; P = np.pad(B, r); out = np.ones_like(B)
    for j in range(se.shape[0]):
        for i in range(se.shape[1]):
            if se[j,i]: out &= P[j:j+B.shape[0], i:i+B.shape[1]]
    return out
opening = dilate(erode(B, se), se)                 # cv2.morphologyEx(B, cv2.MORPH_OPEN, se)
closing = erode(dilate(B, se), se)                 # cv2.MORPH_CLOSE`));
  }
  [['binary-dilation', 'dil'], ['binary-erosion', 'ero'], ['binary-opening', 'open'], ['binary-closing', 'close'], ['binary-duality', 'dil']].forEach(([id, op]) => (V[id] = { title: 'モルフォロジー実験室', run: (el) => morphDemo(el, op) }));

  function labelDemo(el) {
    let conn = 8; const G = binScene(); for (let k = 0; k < 6; k++) G[36 - k][2 + k] = 1; // 斜め線（4/8連結で差が出る）
    const ui = h('div'); el.appendChild(select('連結性', [['4', '4連結（上下左右）'], ['8', '8連結（斜めも）']], '8', (v) => { conn = +v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const { n, L } = IP.label(G, conn); const m = 40, r = img(m, m), g = img(m, m), b = img(m, m);
      for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { const c = LABELC[L[y][x] ? 1 + ((L[y][x] - 1) % (LABELC.length - 1)) : 0]; r.d[y * m + x] = c[0]; g.d[y * m + x] = c[1]; b.d[y * m + x] = c[2]; }
      ui.appendChild(rowOf([fig(toCanvas(g2img(G), { size: 130 }), '入力'), arrow(), fig(toCanvas({ r, g, b }, { size: 130 }), `ラベル数 ${n}（色=ラベル）`)]));
      ui.appendChild(note(`つながっている図形画素の塊（連結成分）ごとに番号を付ける。左下の<b>斜めの点列</b>は、8連結なら1つの成分、4連結ならバラバラ（点の数だけ成分）になる。現在 <b>${conn}連結でラベル数 ${n}</b>。穴の数 ${IP.holes(G, conn)}、オイラー数 ${IP.euler(G, conn)}。`));
    }
    draw();
    el.appendChild(code(`import numpy as np
from collections import deque
def label(B, conn=8):
    H, W = B.shape; L = np.zeros((H, W), int); n = 0
    nb = [(1,0),(-1,0),(0,1),(0,-1)] + ([(1,1),(1,-1),(-1,1),(-1,-1)] if conn==8 else [])
    for y in range(H):
        for x in range(W):
            if B[y,x] and not L[y,x]:
                n += 1; L[y,x] = n; q = deque([(y,x)])
                while q:                                # 塗りつぶし（幅優先）
                    cy, cx = q.popleft()
                    for dy, dx in nb:
                        Y, X = cy+dy, cx+dx
                        if 0<=Y<H and 0<=X<W and B[Y,X] and not L[Y,X]:
                            L[Y,X] = n; q.append((Y,X))
    return n, L
# OpenCV: n, L = cv2.connectedComponents(B, connectivity=8)`));
  }
  V['binary-labeling'] = V['binary-two-pass'] = { title: 'ラベリング：4連結と8連結で数が変わる', run: labelDemo };

  V['binary-distance-transform'] = {
    title: '距離変換：背景からの距離を画素値に',
    run(el) {
      let metric = 'city'; const ui = h('div'); el.appendChild(select('距離', [['city', '市街地距離（4近傍）'], ['chess', 'チェス盤距離（8近傍）'], ['euc', 'ユークリッド距離']], 'city', (v) => { metric = v; draw(); })); el.appendChild(ui);
      const G = binScene(); const m = 40;
      function draw() {
        ui.innerHTML = ''; const D = img(m, m); let mx = 1; const bg = []; for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) if (!G[y][x]) bg.push([x, y]);
        for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) if (G[y][x]) { let best = 1e9; for (const [bx, by] of bg) { const dx = Math.abs(bx - x), dy = Math.abs(by - y); const d = metric === 'city' ? dx + dy : metric === 'chess' ? Math.max(dx, dy) : Math.hypot(dx, dy); if (d < best) best = d; } D.d[y * m + x] = best; mx = Math.max(mx, best); }
        const vis = IP.map(D, (v) => (v / mx) * 255);
        ui.appendChild(rowOf([fig(toCanvas(g2img(G), { size: 120 }), '入力'), arrow(), fig(toCanvas(vis, { size: 120, cmap: jet }), '距離変換（赤ほど遠い）')]));
        ui.appendChild(fig(gridTable(D, 4, 4, 9, { mapv: (v) => 255 - (v / mx) * 200 }), '左上の四角の一部の距離値'));
        ui.appendChild(note('各図形画素に「最も近い背景画素までの距離」を入れる。図形の<b>中心線ほど値が大きく</b>、尾根をたどると骨格（中心軸）になる。市街地距離は等距離線がひし形、チェス盤は正方形、ユークリッドは円になる。'));
      }
      draw();
      el.appendChild(code(`import numpy as np
def distance_city(B):                       # 2パス法（市街地距離）
    H, W = B.shape; INF = 10**9
    D = np.where(B, INF, 0).astype(int)
    for y in range(H):                      # 順方向：左と上から
        for x in range(W):
            if D[y,x]:
                if y: D[y,x] = min(D[y,x], D[y-1,x]+1)
                if x: D[y,x] = min(D[y,x], D[y,x-1]+1)
    for y in reversed(range(H)):            # 逆方向：右と下から
        for x in reversed(range(W)):
            if y < H-1: D[y,x] = min(D[y,x], D[y+1,x]+1)
            if x < W-1: D[y,x] = min(D[y,x], D[y,x+1]+1)
    return D
# OpenCV: cv2.distanceTransform(B, cv2.DIST_L1 / DIST_C / DIST_L2, 3)`));
    },
  };
  V['binary-thinning'] = V['binary-zhang-suen'] = V['binary-hilditch'] = {
    title: '細線化：図形を1画素幅の芯線にする',
    run(el) {
      const G0 = binScene().map((r) => r.slice()); let it = 0; const steps = [G0.map((r) => r.slice())]; let G = G0.map((r) => r.slice());
      const m = 40; const P = (G, x, y) => (y >= 0 && y < m && x >= 0 && x < m ? G[y][x] : 0);
      for (let k = 0; k < 20; k++) { let ch = false; for (const pass of [0, 1]) { const del = []; for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { if (!G[y][x]) continue; const p = [P(G, x, y - 1), P(G, x + 1, y - 1), P(G, x + 1, y), P(G, x + 1, y + 1), P(G, x, y + 1), P(G, x - 1, y + 1), P(G, x - 1, y), P(G, x - 1, y - 1)]; const B = p.reduce((a, b) => a + b); let A = 0; for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) A++; if (B < 2 || B > 6 || A !== 1) continue; if (pass === 0 ? p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0 : p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0) del.push([x, y]); } del.forEach(([x, y]) => (G[y][x] = 0)); if (del.length) ch = true; } steps.push(G.map((r) => r.slice())); if (!ch) break; }
      const ui = h('div'); el.appendChild(control('反復回数', 0, steps.length - 1, 1, steps.length - 1, null, (v) => { it = v; draw(); })); el.appendChild(ui); it = steps.length - 1;
      function draw() { ui.innerHTML = ''; ui.appendChild(rowOf([fig(toCanvas(g2img(G0), { size: 120 }), '入力'), arrow(), fig(toCanvas(g2img(steps[it]), { size: 120 }), `${it}回目`)])); }
      draw();
      el.appendChild(note('境界から「消しても<b>つながり（連結性）が切れない</b>」「端点ではない」画素を少しずつ削る操作を、変化がなくなるまで繰り返す（Zhang–Suen 法）。結果は図形の形と<b>連結性・穴の数を保った</b>1画素幅の線になる。文字認識や指紋の前処理に使う。スライダーで削られていく様子を見よう。'));
      el.appendChild(code(`import numpy as np
def zhang_suen(B):
    B = B.copy().astype(np.uint8); changed = True
    while changed:
        changed = False
        for step in (0, 1):
            P = np.pad(B, 1); dels = []
            for y, x in zip(*np.nonzero(B)):
                y1, x1 = y+1, x+1
                p = [P[y1-1,x1],P[y1-1,x1+1],P[y1,x1+1],P[y1+1,x1+1],
                     P[y1+1,x1],P[y1+1,x1-1],P[y1,x1-1],P[y1-1,x1-1]]   # 上から時計回り
                b = sum(p)                                              # 図形の近傍数
                a = sum((p[i]==0 and p[(i+1)%8]==1) for i in range(8))  # 0→1 の変化数(=連結数)
                c = p[0]*p[2]*p[4]==0 and p[2]*p[4]*p[6]==0 if step==0 else \\
                    p[0]*p[2]*p[6]==0 and p[0]*p[4]*p[6]==0
                if 2 <= b <= 6 and a == 1 and c: dels.append((y, x))
            for y, x in dels: B[y, x] = 0
            changed |= bool(dels)
    return B
# OpenCV(contrib): cv2.ximgproc.thinning(B*255)`));
    },
  };

  // ======================================================================
  // 幾何学的変換
  // ======================================================================
  function affineDemo(el) {
    let rot = 30, sx = 1, sh = 0, tx = 0, interp = 'nn';
    const src = IP.glyphF(48); const ui = h('div'); const ctls = h('div', { className: 'vz-ctls' }); el.appendChild(ctls); el.appendChild(ui);
    ctls.appendChild(control('回転', -180, 180, 5, rot, (v) => v + '°', (v) => { rot = v; draw(); }));
    ctls.appendChild(control('x方向の拡大率', 0.4, 2, 0.1, sx, (v) => v.toFixed(1), (v) => { sx = v; draw(); }));
    ctls.appendChild(control('せん断（スキュー）', -1, 1, 0.1, sh, (v) => v.toFixed(1), (v) => { sh = v; draw(); }));
    ctls.appendChild(control('x方向の平行移動', -12, 12, 1, tx, null, (v) => { tx = v; draw(); }));
    function draw() {
      ui.innerHTML = ''; const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
      // M = R · Sh · S （まず拡大、次にせん断、最後に回転）＋平行移動
      const A = [[sx, sh], [0, 1]]; const M2 = [[c * A[0][0] - s * A[1][0], c * A[0][1] - s * A[1][1]], [s * A[0][0] + c * A[1][0], s * A[0][1] + c * A[1][1]]];
      const M = [[M2[0][0], M2[0][1], tx], [M2[1][0], M2[1][1], 0]];
      const out = IP.warp(src, M);
      // 順変換（穴あき）
      const fw = img(48, 48, 245), cc = 24; for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const X = x + 0.5 - cc, Y = cc - (y + 0.5); const u = M[0][0] * X + M[0][1] * Y + M[0][2], v = M[1][0] * X + M[1][1] * Y + M[1][2]; const xi = Math.floor(u + cc), yi = Math.floor(cc - v); if (xi >= 0 && yi >= 0 && xi < 48 && yi < 48) fw.d[yi * 48 + xi] = Math.min(fw.d[yi * 48 + xi], src.d[y * 48 + x]); }
      const f = (v) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(2));
      ui.appendChild(rowOf([fig(toCanvas(src, { size: 100 }), '入力'), arrow(), fig(toCanvas(out, { size: 100 }), '逆変換で作成'), fig(toCanvas(fw, { size: 100 }), '順変換（穴があく）')]));
      ui.appendChild(h('div', { className: 'figs' }, `<div class="fig"><span class="mtxwrap"><span>(x′,y′,1)ᵀ =</span><span class="br l"></span><table class="mtx"><tr><td>${f(M[0][0])}</td><td>${f(M[0][1])}</td><td>${f(M[0][2])}</td></tr><tr><td>${f(M[1][0])}</td><td>${f(M[1][1])}</td><td>${f(M[1][2])}</td></tr><tr><td>0</td><td>0</td><td>1</td></tr></table><span class="br r"></span><span>(x,y,1)ᵀ</span></span><div class="cap">同次座標のアフィン変換行列</div></div>`));
      ui.appendChild(note('左上2×2が回転・拡大・せん断、右列が平行移動。<b>第1列＝x軸の単位ベクトルの行き先、第2列＝y軸の単位ベクトルの行き先</b>。アフィン変換では<b>直線は直線、平行線は平行のまま</b>（長さ・角度は保存されない）。出力画像は<b>逆変換</b>（出力の各画素が入力のどこから来たかを計算して値を取る）で作る。順変換で入力の画素を飛ばすと、拡大・回転時に<b>穴</b>があく。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
def warp_affine(src, M, out_shape):           # 逆変換による再標本化（最近傍）
    Minv = np.linalg.inv(np.vstack([M, [0,0,1]]))
    H, W = out_shape; out = np.zeros(out_shape, src.dtype)
    ys, xs = np.mgrid[0:H, 0:W]
    pts = np.stack([xs.ravel(), ys.ravel(), np.ones(H*W)])
    sx, sy, _ = Minv @ pts                     # 出力画素 → 入力の座標
    sx, sy = np.round(sx).astype(int), np.round(sy).astype(int)
    ok = (0<=sx)&(sx<src.shape[1])&(0<=sy)&(sy<src.shape[0])
    out.ravel()[ok] = src[sy[ok], sx[ok]]
    return out
# OpenCV: M = cv2.getRotationMatrix2D(center, angle, scale); cv2.warpAffine(src, M, (W,H))`));
  }
  ['geo-affine', 'geo-mesh-warping'].forEach((id) => (V[id] = { title: 'アフィン変換：行列を動かして結果を見る', run: affineDemo }));
  V['geo-projective'] = {
    title: '射影変換：斜めから撮った面を正面から見た画像に',
    run(el) {
      const n = 96, board = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) board.d[y * n + x] = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 230 : 40;
      for (let y = 30; y < 66; y++) for (let x = 30; x < 66; x++) if (Math.abs(x - 48) + Math.abs(y - 48) < 14) board.d[y * n + x] = 160;
      const dst = [[22, 10], [80, 22], [90, 86], [6, 74]], srcq = [[0, 0], [n, 0], [n, n], [0, n]];
      const Hm = homography(srcq, dst); const Hi = homography(dst, srcq);
      const persp = warpH(board, Hi, n), rect = warpH(persp, Hm, n);
      const s = (q) => q.map((p) => p.join(',')).join(' ');
      el.appendChild(rowOf([fig(toCanvas(persp, { size: 120 }), '斜めから撮った画像（台形にゆがむ）'), arrow(), fig(toCanvas(rect, { size: 120 }), '4点を指定して射影変換')]));
      el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 96 96" width="120" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" fill="#fff" stroke="#ccc"/><polygon points="${s(dst)}" fill="none" stroke="#e33" stroke-width="1.5"/>${dst.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.5" fill="#e33"/><text x="${x + 3}" y="${y - 2}" font-size="7">${i + 1}</text>`).join('')}</svg>`));
      el.appendChild(note('射影変換（ホモグラフィ）は 3×3 行列 H で <b>(x′,y′,w′)ᵀ = H(x,y,1)ᵀ、x′/w′, y′/w′</b>。自由度8なので<b>4点の対応</b>から決まる。アフィンと違い<b>平行線は平行でなくなる</b>（直線性は保存）。斜めから撮った書類・看板・路面を正面視に直したり、パノラマ合成の位置合わせに使う。'));
      el.appendChild(code(`import numpy as np, cv2
src = np.float32([[x1,y1],[x2,y2],[x3,y3],[x4,y4]])   # 画像上の四隅
dst = np.float32([[0,0],[W,0],[W,H],[0,H]])           # 正面視での位置
Hm = cv2.getPerspectiveTransform(src, dst)            # 4点→3×3行列（8元連立方程式）
out = cv2.warpPerspective(img, Hm, (W, H))
# 中身：各対応 (x,y)->(u,v) から
#  [x y 1 0 0 0 -ux -uy] h = u,  [0 0 0 x y 1 -vx -vy] h = v  を4点分並べて解く`));
    },
  };
  function homography(s, d) { const A = [], b = []; for (let i = 0; i < 4; i++) { const [x, y] = s[i], [u, v] = d[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); } const hv = solve(A, b); return [[hv[0], hv[1], hv[2]], [hv[3], hv[4], hv[5]], [hv[6], hv[7], 1]]; }
  function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / r[i]); }
  function warpH(a, Hinv, n) { const b = img(n, n, 250); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const w = Hinv[2][0] * x + Hinv[2][1] * y + Hinv[2][2]; const u = (Hinv[0][0] * x + Hinv[0][1] * y + Hinv[0][2]) / w, v = (Hinv[1][0] * x + Hinv[1][1] * y + Hinv[1][2]) / w; if (u >= 0 && v >= 0 && u < a.w && v < a.h) b.d[y * n + x] = a.d[Math.floor(v) * a.w + Math.floor(u)]; } return b; }
  V['geo-nearest'] = V['geo-bilinear'] = {
    title: '補間：最近傍 vs 双線形（拡大して比べる）',
    run(el) {
      const s = 12, a = img(s, s); const sc = scene(48); for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) a.d[y * s + x] = sc.d[(y * 4 + 2) * 48 + x * 4 + 2];
      const Z = 8, N = s * Z, nn = img(N, N), bl = img(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = (x + 0.5) / Z - 0.5, v = (y + 0.5) / Z - 0.5; nn.d[y * N + x] = px(a, Math.round(u), Math.round(v)); const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0; bl.d[y * N + x] = (1 - fx) * (1 - fy) * px(a, x0, y0) + fx * (1 - fy) * px(a, x0 + 1, y0) + (1 - fx) * fy * px(a, x0, y0 + 1) + fx * fy * px(a, x0 + 1, y0 + 1); }
      el.appendChild(rowOf([fig(toCanvas(a, { size: 96 }), `元画像 ${s}×${s}`), arrow(), fig(toCanvas(nn, { size: 120 }), '最近傍補間（8倍）'), fig(toCanvas(bl, { size: 120 }), '双線形補間（8倍）')]));
      const f00 = 100, f10 = 200, f01 = 50, f11 = 150, dx = 0.3, dy = 0.6, v = (1 - dx) * (1 - dy) * f00 + dx * (1 - dy) * f10 + (1 - dx) * dy * f01 + dx * dy * f11;
      el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 200 130" width="220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="130" fill="#fff"/><rect x="40" y="15" width="120" height="100" fill="none" stroke="#999"/>${[[40, 15, f00], [160, 15, f10], [40, 115, f01], [160, 115, f11]].map(([x, y, val]) => `<circle cx="${x}" cy="${y}" r="5" fill="#3563e9"/><text x="${x + (x < 100 ? -36 : 8)}" y="${y + 4}" font-size="11">${val}</text>`).join('')}<circle cx="${40 + 120 * dx}" cy="${15 + 100 * dy}" r="5" fill="#e33"/><text x="${46 + 120 * dx}" y="${12 + 100 * dy}" font-size="11" fill="#e33">?</text><text x="40" y="128" font-size="9">x=0.3, y=0.6</text></svg>`));
      el.appendChild(note(`<b>最近傍</b>：一番近い画素の値をそのまま使う → 赤点は左下の <b>${f01}</b>。ブロック状（ジャギー）になるが値は元のまま。<b>双線形</b>：周囲4画素を距離で重み付け平均 → (1−0.3)(1−0.6)·${f00} + 0.3(1−0.6)·${f10} + (1−0.3)0.6·${f01} + 0.3·0.6·${f11} = <b>${v.toFixed(1)}</b>。滑らかだがぼける。双3次（バイキュービック）は周囲16画素を使い、よりシャープ。`));
      el.appendChild(code(`import numpy as np
def bilinear(f, x, y):
    x0, y0 = int(np.floor(x)), int(np.floor(y)); dx, dy = x-x0, y-y0
    return ((1-dx)*(1-dy)*f[y0,x0] + dx*(1-dy)*f[y0,x0+1] +
            (1-dx)*dy*f[y0+1,x0] + dx*dy*f[y0+1,x0+1])
# OpenCV: cv2.resize(img, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST / INTER_LINEAR / INTER_CUBIC)`));
    },
  };

  // ======================================================================
  // 周波数領域
  // ======================================================================
  function dft2(a) { const n = a.w, re = new Float64Array(n * n), im = new Float64Array(n * n), tr = new Float64Array(n * n), ti = new Float64Array(n * n), C = [], S = []; for (let k = 0; k < n; k++) { C[k] = Math.cos((2 * Math.PI * k) / n); S[k] = Math.sin((2 * Math.PI * k) / n); } for (let y = 0; y < n; y++) for (let u = 0; u < n; u++) { let sr = 0, si = 0; for (let x = 0; x < n; x++) { const k = (u * x) % n, v = a.d[y * n + x]; sr += v * C[k]; si -= v * S[k]; } tr[y * n + u] = sr; ti[y * n + u] = si; } for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) { let sr = 0, si = 0; for (let y = 0; y < n; y++) { const k = (v * y) % n, r = tr[y * n + u], i = ti[y * n + u]; sr += r * C[k] + i * S[k]; si += i * C[k] - r * S[k]; } re[v * n + u] = sr; im[v * n + u] = si; } return { re, im, n }; }
  function idft2(F) { const { re, im, n } = F, C = [], S = []; for (let k = 0; k < n; k++) { C[k] = Math.cos((2 * Math.PI * k) / n); S[k] = Math.sin((2 * Math.PI * k) / n); } const tr = new Float64Array(n * n), ti = new Float64Array(n * n), b = img(n, n); for (let v = 0; v < n; v++) for (let x = 0; x < n; x++) { let sr = 0, si = 0; for (let u = 0; u < n; u++) { const k = (u * x) % n, r = re[v * n + u], i = im[v * n + u]; sr += r * C[k] - i * S[k]; si += r * S[k] + i * C[k]; } tr[v * n + x] = sr; ti[v * n + x] = si; } for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { let sr = 0; for (let v = 0; v < n; v++) { const k = (v * y) % n; sr += tr[v * n + x] * C[k] - ti[v * n + x] * S[k]; } b.d[y * n + x] = sr / (n * n); } return b; }
  function specImg(F) { const { re, im, n } = F, b = img(n, n); let mx = 0; const t = new Float64Array(n * n); for (let i = 0; i < n * n; i++) { t[i] = Math.log(1 + Math.hypot(re[i], im[i])); if (t[i] > mx) mx = t[i]; } for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) b.d[((v + n / 2) % n) * n + ((u + n / 2) % n)] = (t[v * n + u] / mx) * 255; return b; }
  V['freq-fourier-transform'] = V['freq-dft'] = V['freq-dft-2d'] = V['freq-fft'] = {
    title: '縞の向き・細かさとフーリエスペクトル',
    run(el) {
      let ang = 0, per = 4, mix = 'one'; const n = 48; const ui = h('div');
      el.appendChild(control('縞の向き', 0, 165, 15, ang, (v) => v + '°', (v) => { ang = v; draw(); }));
      el.appendChild(control('縞の本数（周波数）', 1, 12, 1, per, (v) => v + '本', (v) => { per = v; draw(); }));
      el.appendChild(select('画像', [['one', '正弦波の縞1つ'], ['two', '縞を2つ重ねる'], ['scene', '普通の画像'], ['square', '方形波の縞（白黒くっきり）']], mix, (v) => { mix = v; draw(); }));
      el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const a = img(n, n), t = (ang * Math.PI) / 180, fx = per * Math.cos(t), fy = per * Math.sin(t);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const ph = (2 * Math.PI * (fx * x + fy * y)) / n; let v = Math.cos(ph); if (mix === 'two') v = 0.6 * v + 0.6 * Math.cos((2 * Math.PI * (3 * y - 2 * x)) / n); if (mix === 'square') v = v >= 0 ? 1 : -1; a.d[y * n + x] = 128 + 100 * v; }
        const src = mix === 'scene' ? (() => { const s = scene(n); return s; })() : a;
        ui.appendChild(rowOf([fig(toCanvas(src, { size: 120 }), '画像'), arrow(), fig(toCanvas(specImg(dft2(src)), { size: 120 }), '振幅スペクトル（中心=直流）')]));
        ui.appendChild(note('スペクトルの1点＝「ある向き・細かさの縞」1種類。正弦波の縞は<b>中心に対称な2点</b>になり、<b>点は縞と直角の方向</b>に並ぶ（縞の濃淡が変わる方向）。<b>縞が細かいほど点は中心から遠い</b>。方形波（くっきりした縞）は奇数倍の高調波が並ぶ。普通の画像は低周波（中心付近）が強く、エッジと直角な方向に筋が出る。'));
      }
      draw();
      el.appendChild(code(`import numpy as np
F = np.fft.fft2(img)                  # 2次元DFT（FFTで高速計算）
F = np.fft.fftshift(F)                # 直流成分を中心へ（象限入れ替え）
mag = np.log1p(np.abs(F))             # 振幅スペクトル（対数で見やすく）
phase = np.angle(F)                   # 位相スペクトル
back = np.fft.ifft2(np.fft.ifftshift(F)).real   # 逆変換で元に戻る`));
    },
  };
  V['freq-lowpass'] = V['freq-highpass'] = V['freq-ideal-filter'] = V['freq-gaussian-filter'] = V['freq-idft'] = {
    title: '周波数フィルタ：マスクを掛けて逆変換',
    run(el) {
      let kind = 'ilpf', cut = 6; const n = 48, src = scene(n), F0 = dft2(src); const ui = h('div');
      el.appendChild(select('フィルタ', [['ilpf', '理想ローパス'], ['glpf', 'ガウシアンローパス'], ['ihpf', '理想ハイパス'], ['ghpf', 'ガウシアンハイパス']], kind, (v) => { kind = v; draw(); }));
      el.appendChild(control('遮断周波数', 1, 20, 1, cut, null, (v) => { cut = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const re = new Float64Array(F0.re), im = new Float64Array(F0.im), mask = img(n, n);
        for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) { const fu = u < n / 2 ? u : u - n, fv = v < n / 2 ? v : v - n, D = Math.hypot(fu, fv); let H = { ilpf: D <= cut ? 1 : 0, ihpf: D <= cut ? 0 : 1, glpf: Math.exp(-(D * D) / (2 * cut * cut)), ghpf: 1 - Math.exp(-(D * D) / (2 * cut * cut)) }[kind]; if (kind.includes('hpf') && u === 0 && v === 0) H = 0; re[v * n + u] *= H; im[v * n + u] *= H; mask.d[((v + n / 2) % n) * n + ((u + n / 2) % n)] = H * 255; }
        let out = idft2({ re, im, n }); if (kind.includes('hpf')) out = IP.map(out, (v) => clamp(128 + v * 1.5));
        ui.appendChild(rowOf([fig(toCanvas(src, { size: 90 }), '入力'), fig(toCanvas(specImg(F0), { size: 90 }), 'スペクトル'), fig(toCanvas(mask, { size: 90 }), '× マスク H(u,v)'), arrow(), fig(toCanvas(out, { size: 90 }), '逆変換した結果')]));
        ui.appendChild(note('<b>ローパス</b>：中心（低周波）だけ通す → ぼける。<b>ハイパス</b>：中心を消す → エッジ（輪郭）だけ残る。<b>理想フィルタ</b>はマスクの縁が急峻なため、結果に<b>リンギング</b>（輪郭のまわりの波紋）が出る。ガウシアンはなめらかに減衰させるのでリンギングが出ない。理想ローパスで遮断周波数を小さくして波紋を確認しよう。'));
      }
      draw();
      el.appendChild(code(`import numpy as np
F = np.fft.fftshift(np.fft.fft2(img))
H_, W_ = img.shape; v, u = np.mgrid[-H_//2:H_//2, -W_//2:W_//2]
D = np.hypot(u, v)
H_ideal = (D <= D0).astype(float)          # 理想ローパス（リンギングが出る）
H_gauss = np.exp(-D**2 / (2*D0**2))        # ガウシアンローパス
out = np.fft.ifft2(np.fft.ifftshift(F * H_gauss)).real
# ハイパスは 1 - H`));
    },
  };
  // DCT
  function dct8(blk) { const C = (k) => (k ? Math.sqrt(2 / 8) : Math.sqrt(1 / 8)), out = []; for (let v = 0; v < 8; v++) { out.push([]); for (let u = 0; u < 8; u++) { let s = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += blk[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16); out[v].push(C(u) * C(v) * s); } } return out; }
  function idct8(F) { const C = (k) => (k ? Math.sqrt(2 / 8) : Math.sqrt(1 / 8)), out = []; for (let y = 0; y < 8; y++) { out.push([]); for (let x = 0; x < 8; x++) { let s = 0; for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += C(u) * C(v) * F[v][u] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16); out[y].push(s); } } return out; }
  const QT = [[16, 11, 10, 16, 24, 40, 51, 61], [12, 12, 14, 19, 26, 58, 60, 55], [14, 13, 16, 24, 40, 57, 69, 56], [14, 17, 22, 29, 51, 87, 80, 62], [18, 22, 37, 56, 68, 109, 103, 77], [24, 35, 55, 64, 81, 104, 113, 92], [49, 64, 78, 87, 103, 121, 120, 101], [72, 92, 95, 98, 112, 100, 103, 99]];
  V['code-dct'] = V['freq-dct'] = V['code-quant-table'] = {
    title: 'JPEGの中身：8×8 DCT → 量子化 → 復元',
    run(el) {
      const bas = img(64, 64); for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bas.d[(v * 8 + y) * 64 + u * 8 + x] = 128 + 127 * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
      el.appendChild(rowOf([fig(toCanvas(bas, { size: 150 }), 'DCT基底64枚（左上=直流、右下ほど高周波）')]));
      el.appendChild(note('8×8ブロックを、この64枚の模様の<b>重ね合わせ</b>で表す。各模様の重み（係数）を求めるのが DCT。自然画像では左上（低周波）の係数が大きく、右下はほぼ0になる。'));
      let q = 50; const n = 64, src = scene(n); const ui = h('div'); el.appendChild(control('画質（品質係数）', 1, 100, 1, q, null, (v) => { q = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const sc = q < 50 ? 5000 / q : 200 - 2 * q; const Q = QT.map((r) => r.map((v) => Math.max(1, Math.floor((v * sc + 50) / 100))));
        const out = img(n, n); let nz = 0; let ex = null;
        for (let by = 0; by < n; by += 8) for (let bx = 0; bx < n; bx += 8) {
          const blk = []; for (let y = 0; y < 8; y++) { blk.push([]); for (let x = 0; x < 8; x++) blk[y].push(src.d[(by + y) * n + bx + x] - 128); }
          const F = dct8(blk), Fq = F.map((r, v) => r.map((c, u) => Math.round(c / Q[v][u]))); Fq.forEach((r) => r.forEach((c) => c && nz++));
          if (by === 16 && bx === 8) ex = { blk, Fq };
          const R = idct8(Fq.map((r, v) => r.map((c, u) => c * Q[v][u]))); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.d[(by + y) * n + bx + x] = clamp(R[y][x] + 128);
        }
        ui.appendChild(rowOf([fig(toCanvas(src, { size: 110 }), '元画像'), arrow(), fig(toCanvas(out, { size: 110 }), `復元（非0係数 ${nz}/${n * n}）`)]));
        const t = (M, col) => `<table class="gt">${M.map((r) => '<tr>' + r.map((v) => `<td style="${col && v ? 'background:#3563e9;color:#fff' : ''}">${Math.round(v)}</td>`).join('') + '</tr>').join('')}</table>`;
        ui.appendChild(h('div', { className: 'figs' }, `<div class="fig">${t(ex.Fq, 1)}<div class="cap">あるブロックの量子化後の係数（青=非0）</div></div><div class="fig">${t(Q)}<div class="cap">量子化テーブル（右下ほど粗い）</div></div>`));
        ui.appendChild(note('係数を量子化テーブルで割って四捨五入すると、高周波の小さな係数が<b>0</b>になる（ここで情報が失われる＝非可逆）。0が並ぶので<b>ジグザグスキャン→ランレングス→ハフマン符号</b>で効率よく圧縮できる。画質を下げると<b>ブロックノイズ</b>（8×8の境界の段差）や<b>モスキートノイズ</b>（エッジ周辺のもやもや）が出る。'));
      }
      draw();
      el.appendChild(code(`import numpy as np, cv2
blk = img[0:8, 0:8].astype(float) - 128      # レベルシフト
F = cv2.dct(blk)                             # 8×8 DCT
Fq = np.round(F / Q)                         # 量子化（ここで非可逆）
zig = [Fq[i, j] for i, j in sorted(((i,j) for i in range(8) for j in range(8)),
        key=lambda p: (p[0]+p[1], p[0] if (p[0]+p[1])%2 else -p[0]))]  # ジグザグ
rec = cv2.idct(Fq * Q) + 128                 # 復号：逆量子化→逆DCT`));
    },
  };
  V['freq-wavelet'] = V['freq-haar'] = V['code-wavelet'] = {
    title: 'ハールウェーブレット分解：画像を4つに分ける',
    run(el) {
      const n = 64, src = scene(n);
      const haar = (a) => { const m = a.w / 2, LL = img(m, m), LH = img(m, m), HL = img(m, m), HH = img(m, m); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { const p = px(a, 2 * x, 2 * y), q = px(a, 2 * x + 1, 2 * y), r = px(a, 2 * x, 2 * y + 1), s = px(a, 2 * x + 1, 2 * y + 1), i = y * m + x; LL.d[i] = (p + q + r + s) / 4; HL.d[i] = 128 + (p - q + r - s) * 1.2; LH.d[i] = 128 + (p + q - r - s) * 1.2; HH.d[i] = 128 + (p - q - r + s) * 2; } return { LL, LH, HL, HH }; };
      const L1 = haar(src), L2 = haar(L1.LL); const comp = img(n, n); const put = (a, ox, oy) => { for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) comp.d[(oy + y) * n + ox + x] = a.d[y * a.w + x]; };
      put(L2.LL, 0, 0); put(L2.HL, 16, 0); put(L2.LH, 0, 16); put(L2.HH, 16, 16); put(L1.HL, 32, 0); put(L1.LH, 0, 32); put(L1.HH, 32, 32);
      el.appendChild(rowOf([fig(toCanvas(src, { size: 120 }), '入力'), arrow(), fig(toCanvas(comp, { size: 160 }), '2段分解')]));
      el.appendChild(note('2×2画素ごとに「平均」「横の差」「縦の差」「斜めの差」を計算し、半分サイズの4枚に分ける。<b>左上（LL）</b>＝縮小した画像、右上＝縦エッジ（横方向の変化）、左下＝横エッジ（縦方向の変化）、右下＝斜め成分。LL をさらに分解すると<b>多重解像度</b>の表現になる。高域の係数はほとんど0（灰色）なので圧縮に向く（JPEG 2000）。'));
      el.appendChild(code(`import numpy as np
def haar2d(a):
    p, q = a[0::2, 0::2], a[0::2, 1::2]       # 2×2ブロックの4画素
    r, s = a[1::2, 0::2], a[1::2, 1::2]
    LL = (p + q + r + s) / 4                  # 平均（縮小画像）
    HL = (p - q + r - s) / 4                  # 横方向の差 → 縦エッジ
    LH = (p + q - r - s) / 4                  # 縦方向の差 → 横エッジ
    HH = (p - q - r + s) / 4                  # 斜め
    return LL, LH, HL, HH
# PyWavelets: pywt.dwt2(img, 'haar')`));
    },
  };
  V['freq-image-pyramid'] = V['freq-gaussian-pyramid'] = V['freq-laplacian-pyramid'] = V['detect-pyramid'] = V['motion-coarse-to-fine'] = {
    title: 'ガウシアン／ラプラシアンピラミッド',
    run(el) {
      let a = scene(64); const G = [a], Lp = [];
      for (let k = 0; k < 3; k++) { const b = conv(G[k], gaussK(1)), m = b.w / 2, d = img(m, m); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) d.d[y * m + x] = b.d[2 * y * b.w + 2 * x]; G.push(d); }
      for (let k = 0; k < 3; k++) { const up = img(G[k].w, G[k].h); for (let y = 0; y < up.h; y++) for (let x = 0; x < up.w; x++) up.d[y * up.w + x] = px(G[k + 1], x >> 1, y >> 1); const ups = conv(up, gaussK(1)); const l = img(up.w, up.h); for (let i = 0; i < l.d.length; i++) l.d[i] = clamp(128 + (G[k].d[i] - ups.d[i]) * 2); Lp.push(l); }
      el.appendChild(rowOf(G.map((g, i) => fig(toCanvas(g, { size: 120 / 2 ** i + 20 }), `G${i}（${g.w}×${g.w}）`))));
      el.appendChild(rowOf(Lp.map((g, i) => fig(toCanvas(g, { size: 120 / 2 ** i + 20 }), `L${i}=G${i}−拡大(G${i + 1})`))));
      el.appendChild(note('<b>ガウシアンピラミッド</b>：ぼかして縦横1/2に間引くを繰り返す（解像度の段階）。粗い段で大まかに探して細かい段で詰める<b>粗密探索</b>や、スケールの違う物体の検出に使う。<b>ラプラシアンピラミッド</b>：各段とその1つ上の段を拡大したものとの差＝その解像度でしか見えない細部（帯域）。画像合成（マルチバンドブレンディング）や圧縮に使う。'));
      el.appendChild(code(`import cv2
G = [img]
for _ in range(3): G.append(cv2.pyrDown(G[-1]))          # ぼかして1/2
L = [G[i] - cv2.pyrUp(G[i+1], dstsize=G[i].shape[::-1]) for i in range(3)]  # 差分（float で）`));
    },
  };

  // ======================================================================
  // 検出・マッチング
  // ======================================================================
  V['detect-template-matching'] = {
    title: 'テンプレートマッチング：類似度マップ',
    run(el) {
      let mode = 'ssd', bright = 0; const n = 64, base = scene(n); const T = img(12, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) T.d[y * 12 + x] = base.d[(16 + y) * n + 14 + x];
      const ui = h('div'); el.appendChild(select('類似度', [['ssd', 'SSD（差の2乗和、小さいほど似ている）'], ['sad', 'SAD（差の絶対値和）'], ['zncc', 'ZNCC（正規化相互相関、1に近いほど似ている）']], mode, (v) => { mode = v; draw(); }));
      el.appendChild(control('探索画像の明るさを変える', -80, 80, 10, bright, (v) => (v > 0 ? '+' : '') + v, (v) => { bright = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const S = IP.map(base, (v) => clamp(v + bright)); const m = n - 11, M = img(m, m); let best = mode === 'zncc' ? -2 : 1e18, bp = [0, 0]; const tm = T.d.reduce((a, b) => a + b) / 144; let td = 0; T.d.forEach((v) => (td += (v - tm) ** 2));
        for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { let s = 0, sm = 0; if (mode === 'zncc') { for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) sm += S.d[(y + j) * n + x + i]; sm /= 144; let num = 0, sd = 0; for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const a = S.d[(y + j) * n + x + i] - sm, b = T.d[j * 12 + i] - tm; num += a * b; sd += a * a; } s = sd && td ? num / Math.sqrt(sd * td) : 0; } else for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const d = S.d[(y + j) * n + x + i] - T.d[j * 12 + i]; s += mode === 'ssd' ? d * d : Math.abs(d); } M.d[y * m + x] = s; if (mode === 'zncc' ? s > best : s < best) { best = s; bp = [x, y]; } }
        let mn = Infinity, mx = -Infinity; M.d.forEach((v) => { mn = Math.min(mn, v); mx = Math.max(mx, v); }); const vis = IP.map(M, (v) => (mode === 'zncc' ? (v - mn) / (mx - mn) : 1 - (v - mn) / (mx - mn)) * 255);
        const cs = toCanvas(S, { size: 130 }); const ctx = cs.getContext('2d'); ctx.strokeStyle = '#ff2'; ctx.lineWidth = 1; ctx.strokeRect(bp[0] + 0.5, bp[1] + 0.5, 11, 11);
        ui.appendChild(rowOf([fig(toCanvas(T, { size: 50 }), 'テンプレート'), fig(cs, `探索画像（黄枠=最良 ${bp}）`), fig(toCanvas(vis, { size: 130, cmap: jet }), '類似度マップ（赤=似ている）')]));
        ui.appendChild(note(`テンプレートを1画素ずつずらしながら、重なった部分の類似度を計算する。最良値 ${mode === 'zncc' ? best.toFixed(3) : Math.round(best)}。<b>明るさスライダーを動かすと</b>、SSD/SAD は値が大きく悪化し誤検出することがあるが、<b>ZNCC は平均を引いて正規化するので明るさの一様な変化に強い</b>（値はほぼ1のまま）。`));
      }
      draw();
      el.appendChild(code(`import numpy as np, cv2
def zncc(a, t):
    a = a - a.mean(); t = t - t.mean()
    return (a*t).sum() / np.sqrt((a*a).sum() * (t*t).sum())
H, W = T.shape
score = np.array([[zncc(S[y:y+H, x:x+W].astype(float), T.astype(float))
                   for x in range(S.shape[1]-W+1)] for y in range(S.shape[0]-H+1)])
y, x = np.unravel_index(score.argmax(), score.shape)
# OpenCV: cv2.matchTemplate(S, T, cv2.TM_SQDIFF / TM_CCOEFF_NORMED)`));
    },
  };
  V['detect-hough'] = V['detect-hough-line'] = {
    title: 'ハフ変換：点が正弦曲線に、直線が交点に',
    run(el) {
      const n = 64, E = []; for (let t = 0; t < 30; t++) E.push([10 + t * 1.5, 50 - t * 0.9]); for (let t = 0; t < 26; t++) E.push([40, 6 + t * 1.6]); for (let k = 0; k < 15; k++) E.push([Math.random() * n, Math.random() * n]);
      const a = img(n, n, 250); E.forEach(([x, y]) => (a.d[Math.round(y) * n + Math.round(x)] = 0));
      const TH = 90, RH = 92, Acc = img(TH, RH); E.forEach(([x, y]) => { for (let ti = 0; ti < TH; ti++) { const t = (ti * Math.PI) / TH, r = x * Math.cos(t) + y * Math.sin(t); const ri = Math.round(r + RH / 2 - 1); if (ri >= 0 && ri < RH) Acc.d[ri * TH + ti] += 1; } });
      let mx = 0; Acc.d.forEach((v) => (mx = Math.max(mx, v))); const vis = IP.map(Acc, (v) => 255 * Math.pow(v / mx, 0.6));
      const peaks = []; const A2 = IP.clone(Acc); for (let k = 0; k < 2; k++) { let bi = 0; A2.d.forEach((v, i) => { if (v > A2.d[bi]) bi = i; }); peaks.push([bi % TH, Math.floor(bi / TH)]); for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const y = Math.floor(bi / TH) + j, x = (bi % TH) + i; if (y >= 0 && y < RH && x >= 0 && x < TH) A2.d[y * TH + x] = 0; } }
      const ci = toCanvas(a, { size: 130 }), ctx = ci.getContext('2d'); ctx.strokeStyle = '#e33';
      peaks.forEach(([ti, ri]) => { const t = (ti * Math.PI) / TH, r = ri - RH / 2 + 1, c = Math.cos(t), s = Math.sin(t); ctx.beginPath(); if (Math.abs(s) > 0.3) { ctx.moveTo(0, r / s); ctx.lineTo(n, (r - n * c) / s); } else { ctx.moveTo(r / c, 0); ctx.lineTo((r - n * s) / c, n); } ctx.stroke(); });
      const cv = toCanvas(vis, { size: 160, cmap: jet }); const c2 = cv.getContext('2d'); c2.strokeStyle = '#fff'; peaks.forEach(([ti, ri]) => c2.strokeRect(ti - 3, ri - 3, 6, 6));
      el.appendChild(rowOf([fig(ci, 'エッジ点（赤=検出した直線）'), arrow(), fig(cv, '投票空間（横θ 0→180°、縦ρ）')]));
      el.appendChild(note('直線を <b>ρ = x cosθ + y sinθ</b>（ρ: 原点からの距離, θ: 法線の角度）で表す。画像上の<b>1点</b>を通る直線は無数にあり、(θ, ρ) 空間では<b>1本の正弦曲線</b>になる。各エッジ点が曲線上に投票すると、<b>同じ直線上の点の曲線は1点で交わる</b>ので、票が集中した点（白枠）が直線のパラメータ。途切れやノイズ点（ばらまいた点）があっても頑健。'));
      el.appendChild(code(`import numpy as np
def hough_lines(edges, n_theta=180):
    H, W = edges.shape; diag = int(np.hypot(H, W))
    thetas = np.deg2rad(np.arange(n_theta))
    acc = np.zeros((2*diag, n_theta), int)
    ys, xs = np.nonzero(edges)
    for x, y in zip(xs, ys):                                  # 各エッジ点が投票
        rho = np.round(x*np.cos(thetas) + y*np.sin(thetas)).astype(int) + diag
        acc[rho, np.arange(n_theta)] += 1                     # 正弦曲線上に+1
    return acc        # ピーク (rho, theta) が直線
# OpenCV: cv2.HoughLines(edges, 1, np.pi/180, threshold)`));
    },
  };
  V['detect-harris'] = {
    title: 'Harrisのコーナー検出：応答マップ',
    run(el) {
      const n = 64, a = scene(n); let k = 0.05;
      const gx = conv(a, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 1), gy = conv(a, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 1);
      const A = img(n, n), B = img(n, n), C = img(n, n); for (let i = 0; i < n * n; i++) { A.d[i] = gx.d[i] ** 2; B.d[i] = gy.d[i] ** 2; C.d[i] = gx.d[i] * gy.d[i]; }
      const G = gaussK(1.2), Sa = conv(A, G, 1), Sb = conv(B, G, 1), Sc = conv(C, G, 1); const ui = h('div');
      el.appendChild(control('k', 0.02, 0.15, 0.01, k, (v) => v.toFixed(2), (v) => { k = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const R = img(n, n); let mx = 0, mn = 0; for (let i = 0; i < n * n; i++) { const det = Sa.d[i] * Sb.d[i] - Sc.d[i] ** 2, tr = Sa.d[i] + Sb.d[i]; R.d[i] = det - k * tr * tr; mx = Math.max(mx, R.d[i]); mn = Math.min(mn, R.d[i]); }
        const vis = IP.map(R, (v) => (v > 0 ? 128 + 127 * Math.sqrt(v / mx) : 128 - 127 * Math.sqrt(v / mn)));
        const cs = toCanvas(a, { size: 130 }), ctx = cs.getContext('2d'); ctx.fillStyle = '#e33';
        for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) { const v = R.d[y * n + x]; if (v < mx * 0.05) continue; let ok = true; for (let j = -2; j <= 2 && ok; j++) for (let i = -2; i <= 2; i++) if (R.d[(y + j) * n + x + i] > v) { ok = false; break; } if (ok) ctx.fillRect(x - 1, y - 1, 3, 3); }
        ui.appendChild(rowOf([fig(cs, '入力（赤=コーナー）'), arrow(), fig(toCanvas(vis, { size: 130, cmap: jet }), '応答 R（赤=コーナー、青=エッジ）')]));
      }
      draw();
      el.appendChild(note('各画素のまわりで勾配の行列 <b>M = Σ[[Ix², IxIy],[IxIy, Iy²]]</b>（構造テンソル）を作る。固有値 λ₁, λ₂ が<b>両方大きい＝コーナー</b>、片方だけ大きい＝エッジ、両方小さい＝平坦。固有値を計算せずに <b>R = det M − k (tr M)²</b> で判定：R が大きな正→コーナー、負→エッジ、0付近→平坦。'));
      el.appendChild(code(`import numpy as np, cv2
Ix = cv2.Sobel(img, cv2.CV_64F, 1, 0); Iy = cv2.Sobel(img, cv2.CV_64F, 0, 1)
Sxx = cv2.GaussianBlur(Ix*Ix, (5,5), 1.2)    # 窓内で和（重み付き）
Syy = cv2.GaussianBlur(Iy*Iy, (5,5), 1.2)
Sxy = cv2.GaussianBlur(Ix*Iy, (5,5), 1.2)
R = (Sxx*Syy - Sxy**2) - k*(Sxx + Syy)**2    # det - k tr^2
corners = (R > 0.05*R.max())                 # + 非極大値抑制
# OpenCV: cv2.cornerHarris(img, 2, 3, 0.05)`));
    },
  };

  // ======================================================================
  // 領域処理・認識
  // ======================================================================
  V['region-kmeans'] = V['recog-kmeans'] = {
    title: 'k-means：画素を k 色に分ける（反復の様子）',
    run(el) {
      const cs = colorScene(64); let K = 4, it = 0; const ui = h('div');
      el.appendChild(control('クラスタ数 k', 2, 8, 1, K, null, (v) => { K = v; run(); })); el.appendChild(ui);
      let hist = [];
      function run() {
        const N = 64 * 64, P = []; for (let i = 0; i < N; i++) P.push([cs.r.d[i], cs.g.d[i], cs.b.d[i]]);
        let C = Array.from({ length: K }, (_, k) => P[Math.floor(((k + 0.5) / K) * N)].slice()); hist = [];
        for (let t = 0; t < 8; t++) { const lab = P.map((p) => { let b = 0, bd = 1e18; C.forEach((c, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = k; } }); return b; }); hist.push({ lab, C: C.map((c) => c.slice()) }); const S = C.map(() => [0, 0, 0, 0]); lab.forEach((k, i) => { S[k][0] += P[i][0]; S[k][1] += P[i][1]; S[k][2] += P[i][2]; S[k][3]++; }); C = S.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : C[k])); }
        it = hist.length - 1; draw();
      }
      function draw() {
        ui.innerHTML = ''; const { lab, C } = hist[it]; const r = img(64, 64), g = img(64, 64), b = img(64, 64); lab.forEach((k, i) => { r.d[i] = C[k][0]; g.d[i] = C[k][1]; b.d[i] = C[k][2]; });
        ui.appendChild(rowOf([fig(toCanvas(cs, { size: 120 }), '入力'), arrow(), fig(toCanvas({ r, g, b }, { size: 120 }), `${it + 1}回目の割り当て`)]));
        const sl = control('反復', 0, hist.length - 1, 1, it, (v) => v + 1 + '回目', (v) => { it = v; draw(); }); ui.appendChild(sl);
        ui.appendChild(h('div', {}, C.map((c) => `<span class="pill" style="background:rgb(${c.map(Math.round)});color:${c[0] + c[1] + c[2] > 380 ? '#000' : '#fff'}">中心 (${c.map(Math.round)})</span>`).join('')));
      }
      run();
      el.appendChild(note('①k個の中心を仮に置く → ②各画素を<b>最も近い中心</b>（色空間での距離）に割り当てる → ③各クラスタの<b>平均</b>を新しい中心にする → ②③を変化がなくなるまで繰り返す。k は人が決める。初期値によって結果が変わる（局所解）。'));
      el.appendChild(code(`import numpy as np
X = img.reshape(-1, 3).astype(float)                 # 画素を色の点として並べる
C = X[np.random.choice(len(X), k, replace=False)]    # 初期中心
for _ in range(20):
    d = ((X[:, None, :] - C[None]) ** 2).sum(-1)     # 全点×全中心の距離
    lab = d.argmin(1)                                 # 最も近い中心
    C = np.array([X[lab == j].mean(0) for j in range(k)])   # 平均で更新
seg = C[lab].reshape(img.shape)
# OpenCV: cv2.kmeans(X.astype(np.float32), k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)`));
    },
  };
  V['region-growing'] = {
    title: '領域成長法：種から似た画素を広げる',
    run(el) {
      const n = 64, a = IP.addGauss(scene(n), 8); let th = 20, seed = [20, 22]; const ui = h('div');
      el.appendChild(control('許容する濃度差', 4, 80, 2, th, null, (v) => { th = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const R = new Uint8Array(n * n), st = [seed[1] * n + seed[0]]; const s0 = a.d[st[0]]; R[st[0]] = 1; let cnt = 1, sum = s0;
        while (st.length) { const i = st.pop(), x = i % n, y = (i / n) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= n || Y >= n) continue; const j = Y * n + X; if (!R[j] && Math.abs(a.d[j] - sum / cnt) < th) { R[j] = 1; cnt++; sum += a.d[j]; st.push(j); } } }
        const r = img(n, n), g = img(n, n), b = img(n, n); for (let i = 0; i < n * n; i++) { r.d[i] = R[i] ? 230 : a.d[i]; g.d[i] = R[i] ? 60 : a.d[i]; b.d[i] = R[i] ? 70 : a.d[i]; }
        const c = toCanvas({ r, g, b }, { size: 150 }); c.addEventListener('click', (e) => { const rc = e.target.getBoundingClientRect(); seed = [Math.floor(((e.clientX - rc.left) / rc.width) * n), Math.floor(((e.clientY - rc.top) / rc.height) * n)]; draw(); });
        ui.appendChild(rowOf([fig(c, `赤=成長した領域（${cnt}画素）。タップで種を置く`)]));
      }
      draw();
      el.appendChild(note('種（シード）画素から始めて、隣の画素が「領域の平均濃度との差がしきい値未満」なら領域に加える、を繰り返す。しきい値が小さいと領域が途中で止まり、大きいと境界を越えて<b>漏れ出す</b>。'));
      el.appendChild(code(`from collections import deque
def region_grow(img, seed, th):
    H, W = img.shape; R = np.zeros((H, W), bool); R[seed] = True
    q = deque([seed]); s, n = float(img[seed]), 1
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            Y, X = y+dy, x+dx
            if 0<=Y<H and 0<=X<W and not R[Y,X] and abs(img[Y,X] - s/n) < th:
                R[Y,X] = True; s += img[Y,X]; n += 1; q.append((Y,X))
    return R`));
    },
  };
  V['recog-conv-layer'] = V['recog-pooling'] = {
    title: 'CNNの畳み込み層とプーリング層',
    run(el) {
      const n = 48, a = scene(n);
      const ks = [['縦エッジ', [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]], ['横エッジ', [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]], ['ぼかし', [[1, 2, 1], [2, 4, 2], [1, 2, 1]].map((r) => r.map((v) => v / 16))], ['斜め', [[2, 1, 0], [1, 0, -1], [0, -1, -2]]]];
      const maps = ks.map(([nm, k]) => { const o = conv(a, k, 1); return [nm, k, IP.map(o, (v) => clamp(Math.max(0, v) * (nm === 'ぼかし' ? 1 : 1.2)))]; });
      el.appendChild(rowOf([fig(toCanvas(a, { size: 90 }), '入力 48×48×1')]));
      el.appendChild(rowOf(maps.map(([nm, k, o]) => fig(toCanvas(o, { size: 70 }), `${nm}フィルタ→ReLU`))));
      const pool = (o) => { const m = o.w / 2, p = img(m, m); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) p.d[y * m + x] = Math.max(px(o, 2 * x, 2 * y), px(o, 2 * x + 1, 2 * y), px(o, 2 * x, 2 * y + 1), px(o, 2 * x + 1, 2 * y + 1)); return p; };
      el.appendChild(rowOf(maps.map(([nm, k, o]) => fig(toCanvas(pool(o), { size: 50 }), '最大値プーリング 2×2'))));
      el.appendChild(note('<b>畳み込み層</b>：複数のフィルタ（カーネル）を画像全体に<b>同じ重みで</b>スライドさせ、それぞれ特徴マップを作る（ここでは手作りの4枚。CNNでは学習でカーネルの値が決まる）。出力チャネル数＝フィルタ数。ReLUで負を0に。<b>プーリング層</b>：2×2の最大値などで縦横1/2にし、位置の小さなずれに強くし計算量を減らす（学習パラメータなし）。出力サイズ＝(W+2P−K)/S+1。'));
      el.appendChild(code(`import torch, torch.nn as nn
net = nn.Sequential(
    nn.Conv2d(1, 4, kernel_size=3, padding=1),   # 1ch→4ch、パラメータ数 3*3*1*4+4 = 40
    nn.ReLU(),
    nn.MaxPool2d(2),                             # 48×48 → 24×24
)
y = net(torch.randn(1, 1, 48, 48))               # y.shape == (1, 4, 24, 24)`));
    },
  };

  // ======================================================================
  // 撮影・色
  // ======================================================================
  V['cam-bayer'] = V['cam-demosaicing'] = {
    title: 'ベイヤー配列とデモザイキング',
    run(el) {
      const cs = colorScene(48), n = 48; const mr = img(n, n), mg = img(n, n), mb = img(n, n), raw = img(n, n);
      const ch = (x, y) => (y % 2 === 0 ? (x % 2 === 0 ? 'g' : 'r') : x % 2 === 0 ? 'b' : 'g');
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, c = ch(x, y); raw.d[i] = cs[c].d[i]; mr.d[i] = c === 'r' ? raw.d[i] : 0; mg.d[i] = c === 'g' ? raw.d[i] : 0; mb.d[i] = c === 'b' ? raw.d[i] : 0; }
      const dem = { r: img(n, n), g: img(n, n), b: img(n, n) };
      for (const c of ['r', 'g', 'b']) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0, k = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= n || Y >= n) continue; if (ch(X, Y) === c) { s += raw.d[Y * n + X]; k++; } } dem[c].d[y * n + x] = ch(x, y) === c ? raw.d[y * n + x] : s / k; }
      el.appendChild(rowOf([fig(toCanvas(cs, { size: 100 }), '実際の景色'), arrow(), fig(toCanvas({ r: mr, g: mg, b: mb }, { size: 100 }), 'センサが記録する値（各画素1色だけ）')]));
      el.appendChild(rowOf([fig(toCanvas(raw, { size: 100 }), 'RAWデータ（1枚のモザイク）'), arrow(), fig(toCanvas(dem, { size: 100 }), 'デモザイキング（周囲から補間）')]));
      el.appendChild(h('div', { className: 'figs' }, `<table class="gt">${[0, 1, 2, 3].map((y) => '<tr>' + [0, 1, 2, 3].map((x) => { const c = ch(x, y); return `<td style="background:${{ r: '#e66', g: '#6c6', b: '#69f' }[c]};color:#fff;width:34px;height:34px;font-weight:700">${c.toUpperCase()}</td>`; }).join('') + '</tr>').join('')}</table>`));
      el.appendChild(note('各画素の上に R・G・B どれか1色のカラーフィルタが乗っている。<b>G が R・B の2倍</b>（人の目が緑＝明るさに敏感なため）。足りない2色は周囲の同じ色の画素から補間して作る（デモザイキング）。細い棒（左下）のように細かい模様の部分では<b>偽色</b>（本来ない色のにじみ）が出る。拡大して確認しよう。'));
      el.appendChild(code(`import numpy as np, cv2
# raw: ベイヤー配列のRAW（2次元）。GRBG 配列の簡単な双線形デモザイク
H, W = raw.shape; out = np.zeros((H, W, 3))
masks = {'R': np.zeros((H,W)), 'G': np.zeros((H,W)), 'B': np.zeros((H,W))}
masks['G'][0::2, 0::2] = 1; masks['R'][0::2, 1::2] = 1
masks['B'][1::2, 0::2] = 1; masks['G'][1::2, 1::2] = 1
k = np.ones((3, 3))
for c, ch in zip('RGB', range(3)):
    s = cv2.filter2D(raw * masks[c], -1, k)        # 周囲の同色画素の合計
    m = cv2.filter2D(masks[c], -1, k)              # その個数
    out[..., ch] = np.where(masks[c] > 0, raw, s / m)
# OpenCV: cv2.cvtColor(raw, cv2.COLOR_BayerGR2BGR)`));
    },
  };
  V['cam-sampling-theorem'] = V['cam-aliasing'] = V['freq-sampling-theorem'] = V['freq-aliasing'] = V['geo-antialias-downscale'] = V['cam-olpf'] = {
    title: '標本化とエイリアシング（モアレ）',
    run(el) {
      const N = 192, zp = img(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r2 = (x - N / 2) ** 2 + (y - N / 2) ** 2; zp.d[y * N + x] = 128 + 120 * Math.cos(r2 / 90); }
      let step = 4, pre = false; const ui = h('div');
      el.appendChild(control('間引き間隔（標本化の粗さ）', 1, 8, 1, step, (v) => `1/${v}`, (v) => { step = v; draw(); }));
      el.appendChild(select('間引く前に', [['no', '何もしない'], ['yes', 'ぼかす（ローパス）']], 'no', (v) => { pre = v === 'yes'; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const s = pre ? conv(zp, gaussK(step * 0.5)) : zp; const m = Math.floor(N / step), d = img(m, m); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) d.d[y * m + x] = s.d[y * step * N + x * step];
        ui.appendChild(rowOf([fig(toCanvas(zp, { size: 130 }), '元画像（外側ほど細かい同心円）'), arrow(), fig(toCanvas(d, { size: 130 }), `${m}×${m} に標本化`)]));
        ui.appendChild(note('標本化定理：<b>標本化周波数の1/2（ナイキスト周波数）より細かい模様は正しく記録できない</b>。超えた分は<b>低い周波数に化けて</b>（折り返し）、元にない縞（モアレ）が出る。間引き間隔を大きくすると外側に偽の同心円が現れる。<b>先にぼかして高周波を取り除けば</b>（アンチエイリアシング／カメラの光学ローパスフィルタ）、細部は失われるがモアレは出ない。'));
      }
      draw();
      el.appendChild(code(`import cv2
small_bad  = img[::4, ::4]                          # 単純な間引き → モアレ
small_good = cv2.GaussianBlur(img, (0,0), 2)[::4, ::4]   # ぼかしてから間引く
# cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA) も平均化して縮小`));
    },
  };
  V['color-mach-band'] = {
    title: 'マッハバンド：段差の縁が強調されて見える',
    run(el) {
      const W = 160, H = 50, a = img(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a.d[y * W + x] = 40 + Math.floor(x / 20) * 25;
      el.appendChild(rowOf([fig(toCanvas(a, { size: 300 }), '各帯は内部で完全に均一な濃度')]));
      const pts = [], per = []; for (let x = 0; x < W; x++) { pts.push([x, a.d[x]]); per.push([x, a.d[x] + (x % 20 < 3 && x > 3 ? 12 * (1 - (x % 20) / 3) : 0) - (x % 20 > 16 ? 12 * ((x % 20) - 16) / 3 : 0)]); }
      el.appendChild(svgPlot([{ pts, color: '#3563e9' }, { pts: per, color: '#e33', dash: 1 }], { w: 300, h: 120, xl: '位置（青：実際の濃度、赤：見え方の模式）' }));
      el.appendChild(note('実際は階段状に一定なのに、<b>帯の境目の明るい側はより明るく、暗い側はより暗く</b>筋が見える。網膜の神経が隣の細胞の反応を抑える<b>側抑制</b>によるもので、視覚が自然に輪郭を強調している（ラプラシアンによる鮮鋭化と同じ働き）。'));
    },
  };
  V['color-hsv'] = V['color-ycbcr'] = V['color-additive-mixing'] = {
    title: '色空間：RGB・HSV・YCbCr に分解して見る',
    run(el) {
      const cs = colorScene(64), n = 64; const H = img(n, n), S = img(n, n), Vv = img(n, n), Y = img(n, n), Cb = img(n, n), Cr = img(n, n);
      for (let i = 0; i < n * n; i++) { const r = cs.r.d[i], g = cs.g.d[i], b = cs.b.d[i], mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0; if (mx !== mn) { if (mx === r) hh = (60 * (g - b)) / (mx - mn); else if (mx === g) hh = (60 * (b - r)) / (mx - mn) + 120; else hh = (60 * (r - g)) / (mx - mn) + 240; } if (hh < 0) hh += 360; H.d[i] = (hh / 360) * 255; S.d[i] = mx ? ((mx - mn) / mx) * 255 : 0; Vv.d[i] = mx; Y.d[i] = 0.299 * r + 0.587 * g + 0.114 * b; Cb.d[i] = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b; Cr.d[i] = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b; }
      el.appendChild(rowOf([fig(toCanvas(cs, { size: 90 }), '入力'), fig(toCanvas(cs.r, { size: 64 }), 'R'), fig(toCanvas(cs.g, { size: 64 }), 'G'), fig(toCanvas(cs.b, { size: 64 }), 'B')]));
      el.appendChild(rowOf([fig(toCanvas(H, { size: 64 }), 'H 色相'), fig(toCanvas(S, { size: 64 }), 'S 彩度'), fig(toCanvas(Vv, { size: 64 }), 'V 明度')]));
      el.appendChild(rowOf([fig(toCanvas(Y, { size: 64 }), 'Y 輝度'), fig(toCanvas(Cb, { size: 64 }), 'Cb 青色差'), fig(toCanvas(Cr, { size: 64 }), 'Cr 赤色差')]));
      let r = 255, g = 120, b = 40; const box = h('div'); const sw = () => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0; if (mx !== mn) { if (mx === r) hh = (60 * (g - b)) / (mx - mn); else if (mx === g) hh = (60 * (b - r)) / (mx - mn) + 120; else hh = (60 * (r - g)) / (mx - mn) + 240; } if (hh < 0) hh += 360; box.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="width:60px;height:60px;border-radius:10px;background:rgb(${r},${g},${b})"></div><div style="font-size:13px">RGB=(${r},${g},${b})<br>H=${hh.toFixed(0)}° S=${mx ? ((mx - mn) / mx).toFixed(2) : 0} V=${mx}<br>Y=${(0.299 * r + 0.587 * g + 0.114 * b).toFixed(1)}　補色=(${255 - r},${255 - g},${255 - b})</div><div style="width:40px;height:60px;border-radius:10px;background:rgb(${255 - r},${255 - g},${255 - b})"></div></div>`; };
      el.appendChild(control('R', 0, 255, 5, r, null, (v) => { r = v; sw(); })); el.appendChild(control('G', 0, 255, 5, g, null, (v) => { g = v; sw(); })); el.appendChild(control('B', 0, 255, 5, b, null, (v) => { b = v; sw(); })); el.appendChild(box); sw();
      el.appendChild(note('<b>HSV</b>は人の感覚に近い「色合い・鮮やかさ・明るさ」に分ける（赤い家・黄色い太陽は S が高い）。<b>YCbCr</b>は明るさ Y と色差に分ける。人は色差の解像度に鈍いので、Cb・Cr を間引いても（4:2:0）見た目が変わりにくい → JPEG・動画圧縮で使う。Y の重み 0.587 が最大なのは緑に最も敏感だから。'));
      el.appendChild(code(`import numpy as np, cv2
hsv   = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)      # OpenCVはH:0-179
ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
R, G, B = rgb[...,0], rgb[...,1], rgb[...,2]
Y  = 0.299*R + 0.587*G + 0.114*B                  # 輝度（BT.601）
Cb = 128 - 0.1687*R - 0.3313*G + 0.5*B
Cr = 128 + 0.5*R - 0.4187*G - 0.0813*B`));
    },
  };

  // ======================================================================
  // 動画像・復元
  // ======================================================================
  function frames() {
    const n = 64, bg = scene(n); const f = (t) => { const a = IP.clone(bg); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - 14 - t * 4) ** 2 + (y - 46) ** 2 < 49) a.d[y * n + x] = 245; return IP.addGauss(a, 4); };
    return { n, bg, f };
  }
  V['motion-frame-diff'] = V['motion-bg-subtraction'] = V['tone-difference'] = {
    title: 'フレーム間差分と背景差分',
    run(el) {
      const { n, bg, f } = frames(); const f1 = f(3), f2 = f(4); let th = 30; const ui = h('div');
      el.appendChild(control('2値化しきい値', 5, 100, 5, th, null, (v) => { th = v; draw(); })); el.appendChild(ui);
      function draw() {
        ui.innerHTML = ''; const fd = img(n, n), bd = img(n, n); for (let i = 0; i < n * n; i++) { fd.d[i] = Math.abs(f2.d[i] - f1.d[i]) > th ? 255 : 0; bd.d[i] = Math.abs(f2.d[i] - bg.d[i]) > th ? 255 : 0; }
        ui.appendChild(rowOf([fig(toCanvas(bg, { size: 76 }), '背景画像'), fig(toCanvas(f1, { size: 76 }), 'フレーム t−1'), fig(toCanvas(f2, { size: 76 }), 'フレーム t')]));
        ui.appendChild(rowOf([fig(toCanvas(fd, { size: 100 }), '|t − (t−1)|（フレーム間差分）'), fig(toCanvas(bd, { size: 100 }), '|t − 背景|（背景差分）')]));
        ui.appendChild(note('<b>フレーム間差分</b>：前後のフレームの差。背景画像が要らないが、物体の<b>前後の縁だけ</b>（重なり部分は差が出ない）が検出され、止まった物体は消える。<b>背景差分</b>：あらかじめ用意した背景との差。物体<b>全体</b>が取れるが、照明変化・背景の変化に弱い（背景モデルの更新が必要）。しきい値が低いとノイズまで拾う。'));
      }
      draw();
      el.appendChild(code(`import cv2
diff = cv2.absdiff(frame_t, frame_prev)           # フレーム間差分
fg   = cv2.absdiff(frame_t, background)           # 背景差分
_, mask = cv2.threshold(fg, 30, 255, cv2.THRESH_BINARY)
# 適応的な背景モデル（混合ガウス）: bs = cv2.createBackgroundSubtractorMOG2(); mask = bs.apply(frame)`));
    },
  };
  V['motion-block-matching'] = V['motion-optical-flow'] = V['motion-of-constraint'] = V['motion-gradient-method'] = {
    title: 'ブロックマッチングで動きベクトルを求める',
    run(el) {
      const n = 64, bg = scene(n); const sh = (a, dx, dy, mask) => { const b = IP.clone(a); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mask(x, y)) b.d[y * n + x] = px(a, x - dx, y - dy); return b; };
      const f1 = bg, f2 = sh(bg, 3, 0, (x, y) => y < 34 && x > 6 && x < 60); const f3 = sh(f2, -2, 2, (x, y) => y >= 34 && x > 26 && x < 62);
      const B = 8, R = 4, cs = toCanvas(f3, { size: 180 }), ctx = cs.getContext('2d'); ctx.strokeStyle = '#e33'; ctx.fillStyle = '#e33'; ctx.lineWidth = 0.6;
      for (let by = 0; by < n; by += B) for (let bx = 0; bx < n; bx += B) { let best = 1e9, bv = [0, 0]; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { let s = 0; for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) s += Math.abs(px(f3, bx + i, by + j) - px(f1, bx + i - dx, by + j - dy)); if (s < best - 1e-6 || (Math.abs(s - best) < 1e-6 && Math.abs(dx) + Math.abs(dy) < Math.abs(bv[0]) + Math.abs(bv[1]))) { best = s; bv = [dx, dy]; } } const cx = bx + B / 2, cy = by + B / 2; if (bv[0] || bv[1]) { ctx.beginPath(); ctx.moveTo(cx - bv[0], cy - bv[1]); ctx.lineTo(cx, cy); ctx.stroke(); ctx.fillRect(cx - 0.7, cy - 0.7, 1.4, 1.4); } }
      el.appendChild(rowOf([fig(toCanvas(f1, { size: 90 }), '前フレーム'), fig(toCanvas(f3, { size: 90 }), '現フレーム（上は右へ3、下の右側は左下へ）')]));
      el.appendChild(rowOf([fig(cs, '8×8ブロックごとの動きベクトル（赤）')]));
      el.appendChild(note('現フレームを8×8のブロックに分け、各ブロックについて前フレームの周囲±4画素を探して <b>SAD が最小</b>の位置を探す → そのずれが<b>動きベクトル</b>。MPEG/H.264 の動き補償予測の基本。模様のない平坦な部分では一致する場所が多く、ベクトルが決まりにくい（<b>開口問題</b>と同根）。勾配法（Lucas–Kanade）は I_x u + I_y v + I_t = 0 を窓内で最小二乗に解き、サブピクセルの動きを求める。'));
      el.appendChild(code(`import numpy as np, cv2
def block_motion(prev, cur, B=8, R=4):
    H, W = cur.shape; vec = {}
    for by in range(0, H-B+1, B):
        for bx in range(0, W-B+1, B):
            blk = cur[by:by+B, bx:bx+B].astype(int); best = None
            for dy in range(-R, R+1):
                for dx in range(-R, R+1):
                    y, x = by-dy, bx-dx
                    if 0<=y<=H-B and 0<=x<=W-B:
                        s = np.abs(blk - prev[y:y+B, x:x+B]).sum()   # SAD
                        if best is None or s < best[0]: best = (s, dx, dy)
            vec[(bx, by)] = best[1:]
    return vec
# 密なオプティカルフロー: cv2.calcOpticalFlowFarneback(prev, cur, None, 0.5, 3, 15, 3, 5, 1.2, 0)
# 特徴点の追跡（LK法）: cv2.calcOpticalFlowPyrLK(prev, cur, pts, None)`));
    },
  };
  V['restore-wiener'] = V['restore-motion-blur'] = {
    title: '動きぼけの復元：逆フィルタ vs ウィーナーフィルタ',
    run(el) {
      const n = 48, src = scene(n); let L = 7, noise = 2, K = 0.01; const ui = h('div');
      el.appendChild(control('ぶれの長さ', 3, 13, 2, L, (v) => v + '画素', (v) => { L = v; draw(); }));
      el.appendChild(control('ノイズ', 0, 10, 1, noise, null, (v) => { noise = v; draw(); }));
      el.appendChild(control('ウィーナーの K', 0.001, 0.1, 0.001, K, (v) => v.toFixed(3), (v) => { K = v; draw(); })); el.appendChild(ui);
      const F0 = dft2(src);
      function draw() {
        ui.innerHTML = ''; const psf = img(n, n); for (let i = 0; i < L; i++) psf.d[i] = 1 / L; const Hf = dft2(psf);
        const re = new Float64Array(n * n), im = new Float64Array(n * n); for (let i = 0; i < n * n; i++) { re[i] = F0.re[i] * Hf.re[i] - F0.im[i] * Hf.im[i]; im[i] = F0.re[i] * Hf.im[i] + F0.im[i] * Hf.re[i]; }
        let g = idft2({ re, im, n }); g = IP.map(g, (v) => v + (Math.random() - 0.5) * 2 * noise * 1.7); const G = dft2(g);
        const rec = (wiener) => { const r2 = new Float64Array(n * n), i2 = new Float64Array(n * n); for (let i = 0; i < n * n; i++) { const hr = Hf.re[i], hi = Hf.im[i], h2 = hr * hr + hi * hi; let wr, wi; if (wiener) { wr = hr / (h2 + K); wi = -hi / (h2 + K); } else { const d = Math.max(h2, 1e-6); wr = hr / d; wi = -hi / d; } r2[i] = G.re[i] * wr - G.im[i] * wi; i2[i] = G.re[i] * wi + G.im[i] * wr; } return IP.map(idft2({ re: r2, im: i2, n }), (v) => clamp(v)); };
        ui.appendChild(rowOf([fig(toCanvas(src, { size: 80 }), '原画像'), fig(toCanvas(IP.map(g, (v) => clamp(v)), { size: 80 }), `横ぶれ${L}画素＋ノイズ`)]));
        ui.appendChild(rowOf([fig(toCanvas(rec(false), { size: 100 }), '逆フィルタ 1/H'), fig(toCanvas(rec(true), { size: 100 }), `ウィーナー（K=${K.toFixed(3)}）`)]));
        ui.appendChild(note('劣化モデル G = H·F + N（周波数領域）。<b>逆フィルタ</b> F = G/H は、H がほぼ0の周波数（動きぼけでは縞状に0が並ぶ）でノイズを<b>極端に増幅</b>して破綻する（ノイズ0なら完全に戻る。ノイズを0にして確かめよう）。<b>ウィーナーフィルタ</b> H*/(|H|²+K) は、|H| が小さい所では増幅を抑えるので、ノイズがあっても安定して復元できる。K はノイズと信号のパワー比。'));
      }
      draw();
      el.appendChild(code(`import numpy as np
H = np.fft.fft2(psf, s=g.shape)               # 点拡がり関数のスペクトル
G = np.fft.fft2(g)
F_inv = G / H                                  # 逆フィルタ（H≈0 で発散）
F_wie = G * np.conj(H) / (np.abs(H)**2 + K)    # ウィーナーフィルタ
f_hat = np.real(np.fft.ifft2(F_wie))`));
    },
  };
  V['code-rle'] = {
    title: 'ランレングス符号化：同じ値の連続を（値, 長さ）に',
    run(el) {
      const row = [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
      const runs = []; let c = row[0], l = 0; row.forEach((v) => { if (v === c) l++; else { runs.push([c, l]); c = v; l = 1; } }); runs.push([c, l]);
      el.appendChild(h('div', { className: 'figs' }, `<table class="gt bin"><tr>${row.map((v) => `<td style="background:${v ? '#222' : '#fff'};width:12px;height:22px"></td>`).join('')}</tr></table>`));
      el.appendChild(note(`2値画像の1行（${row.length}画素）→ ランの列：<b>${runs.map(([v, l]) => `${v ? '黒' : '白'}${l}`).join(', ')}</b>。白黒が交互なので長さだけ送れば済む：<b>${runs.map((r) => r[1]).join(', ')}</b>（${runs.length}個の数）。FAXなど同じ値が長く続く画像に効く。細かい模様（ランが短い）ではかえって増える。ランの長さをさらにハフマン符号化するのが MH 符号（FAX）。`));
      el.appendChild(code(`def rle(row):
    runs, cur, n = [], row[0], 0
    for v in row:
        if v == cur: n += 1
        else: runs.append((cur, n)); cur, n = v, 1
    runs.append((cur, n))
    return runs        # [(0,5),(1,3),(0,6),(1,7),(0,3)]`));
    },
  };
  V['code-huffman'] = {
    title: 'ハフマン符号：出やすい記号ほど短い符号',
    run(el) {
      const P = { A: 0.4, B: 0.2, C: 0.2, D: 0.1, E: 0.1 }; let nodes = Object.entries(P).map(([s, p]) => ({ s, p })); const steps = [];
      while (nodes.length > 1) { nodes.sort((a, b) => a.p - b.p); const [a, b] = nodes.splice(0, 2); steps.push(`${a.s || '('+a.p.toFixed(1)+')'}(${a.p.toFixed(1)}) と ${b.s || '('+b.p.toFixed(1)+')'}(${b.p.toFixed(1)}) を結合 → ${(a.p + b.p).toFixed(1)}`); nodes.push({ p: a.p + b.p, l: a, r: b }); }
      const codes = {}; const walk = (t, c) => { if (t.s) codes[t.s] = c || '0'; else { walk(t.l, c + '0'); walk(t.r, c + '1'); } }; walk(nodes[0], '');
      const L = Object.entries(P).reduce((s, [k, p]) => s + p * codes[k].length, 0), Hh = -Object.values(P).reduce((s, p) => s + p * Math.log2(p), 0);
      el.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>記号</th>${Object.keys(P).map((k) => `<th>${k}</th>`).join('')}</tr><tr><td>確率</td>${Object.values(P).map((p) => `<td>${p}</td>`).join('')}</tr><tr><td>符号</td>${Object.keys(P).map((k) => `<td><b>${codes[k]}</b></td>`).join('')}</tr></table>`));
      el.appendChild(note('<b>手順</b>：確率の小さい2つを結合して1つにする、を1つになるまで繰り返し、木の枝に0/1を振る。<br>' + steps.map((s, i) => `${i + 1}. ${s}`).join('<br>') + `<br>平均符号長 = Σ p·(符号長) = <b>${L.toFixed(2)} ビット</b>（固定長なら3ビット）。エントロピー H = ${Hh.toFixed(3)} ビットが下限で、H ≤ 平均符号長 < H+1。どの符号も他の符号の先頭部分にならない（<b>瞬時復号可能</b>）。`));
      el.appendChild(code(`import heapq
def huffman(prob):
    h = [[p, [s, '']] for s, p in prob.items()]; heapq.heapify(h)
    while len(h) > 1:
        lo, hi = heapq.heappop(h), heapq.heappop(h)     # 最小の2つ
        for x in lo[1:]: x[1] = '0' + x[1]
        for x in hi[1:]: x[1] = '1' + x[1]
        heapq.heappush(h, [lo[0] + hi[0]] + lo[1:] + hi[1:])
    return dict(h[0][1:])`));
    },
  };
  V['recog-fisher-lda'] = {
    title: '線形判別分析 vs 主成分分析：どの軸に射影するか',
    run(el) {
      const pts = []; const rnd = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return u - 3; };
      for (let i = 0; i < 60; i++) { const t = rnd() * 2.2, s = rnd() * 0.35; pts.push([t * 0.8 - s * 0.6 - 0.5, t * 0.6 + s * 0.8 + 0.5, 0]); pts.push([t * 0.8 - s * 0.6 + 0.5, t * 0.6 + s * 0.8 - 0.5, 1]); }
      const W = 260, sc = 38, X = (x) => W / 2 + x * sc, Y = (y) => 110 - y * sc;
      let g = `<svg viewBox="0 0 ${W} 220" width="${W}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="220" fill="#fff"/>`;
      pts.forEach(([x, y, c]) => (g += `<circle cx="${X(x)}" cy="${Y(y)}" r="2.3" fill="${c ? '#e33' : '#3563e9'}"/>`));
      g += `<line x1="${X(-3 * 0.8)}" y1="${Y(-3 * 0.6)}" x2="${X(3 * 0.8)}" y2="${Y(3 * 0.6)}" stroke="#999" stroke-width="2" stroke-dasharray="5 3"/><text x="${X(2.1)}" y="${Y(2.0)}" font-size="10" fill="#666">PCA第1軸</text>`;
      g += `<line x1="${X(-2 * 0.707)}" y1="${Y(2 * 0.707)}" x2="${X(2 * 0.707)}" y2="${Y(-2 * 0.707)}" stroke="#2a9d8f" stroke-width="2.5"/><text x="${X(1.5)}" y="${Y(-1.6)}" font-size="10" fill="#2a9d8f">LDAの軸</text></svg>`;
      el.appendChild(h('div', { className: 'figs' }, g));
      el.appendChild(note('2クラス（青・赤）のデータ。<b>PCA</b>（主成分分析）はクラスを無視して<b>全体のばらつきが最大</b>の方向（灰の破線）を選ぶ → この軸に射影すると2クラスが<b>重なってしまう</b>。<b>LDA</b>（フィッシャーの線形判別）は<b>クラス間の分散／クラス内の分散</b>が最大の方向（緑）を選ぶ → 射影するときれいに分かれる。PCAは教師なしの次元削減、LDAは教師ありの識別向き。'));
      el.appendChild(code(`import numpy as np
m0, m1 = X0.mean(0), X1.mean(0)
Sw = np.cov(X0.T) * (len(X0)-1) + np.cov(X1.T) * (len(X1)-1)   # クラス内散布行列
w_lda = np.linalg.solve(Sw, m1 - m0)                          # Sw^-1 (m1 - m0)
Xall = np.vstack([X0, X1]); C = np.cov(Xall.T)
w_pca = np.linalg.eigh(C)[1][:, -1]                           # 最大固有値の固有ベクトル`));
    },
  };

  const list = () => Object.keys(V);
  return { V, list, has: (id) => !!V[id], render(id, el) { const v = V[id]; if (!v) return false; el.innerHTML = ''; const t = h('div', { className: 'vz-title' }, '🔬 ' + v.title); el.appendChild(t); const body = h('div'); el.appendChild(body); try { v.run(body); } catch (e) { body.innerHTML = '<div class="sub">図解の表示に失敗しました：' + e.message + '</div>'; console.error(e); } return true; } };
})();
