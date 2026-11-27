// 図解ラボ（追加1）：撮影・色・周波数・復元・幾何・2値・領域
'use strict';
(() => {
  const { V, H } = VIZ; const { h, img, px, clamp, toCanvas, jet, fig, rowOf, arrow, control, select, note, gridTable, svgPlot, code, conv, gaussK, scene, colorScene, dft2, idft2, specImg, g2img, binScene } = H;
  const reg = (ids, title, run) => ids.forEach((id) => (V[id] = { title, run }));
  const mapRGB = (cs, f) => { const o = { r: img(cs.w, cs.h), g: img(cs.w, cs.h), b: img(cs.w, cs.h), w: cs.w, h: cs.h }; for (let i = 0; i < cs.w * cs.h; i++) { const [r, g, b] = f(cs.r.d[i], cs.g.d[i], cs.b.d[i], i); o.r.d[i] = r; o.g.d[i] = g; o.b.d[i] = b; } return o; };
  const sampleRGB = (cs, x, y) => [px(cs.r, Math.round(x), Math.round(y)), px(cs.g, Math.round(x), Math.round(y)), px(cs.b, Math.round(x), Math.round(y))];
  const inside = (cs, x, y) => x >= 0 && y >= 0 && x < cs.w && y < cs.h;

  // ======================= 撮影 =======================
  reg(['cam-dof', 'cam-coc', 'cam-f-number'], '絞り（F値）とボケ：被写界深度', (el) => {
    const n = 96; let F = 2.8, focus = 0.5; const ui = h('div');
    el.appendChild(control('F値', 1.4, 16, 0.1, F, (v) => 'F' + v.toFixed(1), (v) => { F = v; draw(); }));
    el.appendChild(control('ピントを合わせる距離', 0, 1, 0.05, focus, (v) => (v < 0.34 ? '手前' : v < 0.67 ? '中央' : '奥'), (v) => { focus = v; draw(); })); el.appendChild(ui);
    // 3つの物体（手前・中央・奥）を持つシーン：奥行き 0..1
    const base = img(n, n), dep = img(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; let v = ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 150 : 110), d = 1; if (x > 8 && x < 30 && y > 20 && y < 80) { v = (Math.floor(y / 4) % 2) ? 240 : 30; d = 0.15; } if (x > 38 && x < 60 && y > 30 && y < 72) { v = (Math.floor(x / 3) % 2) ? 230 : 40; d = 0.5; } if (x > 66 && x < 90 && y > 10 && y < 50) { v = ((x + y) % 8 < 4) ? 220 : 50; d = 0.85; } base.d[i] = v; dep.d[i] = d; }
    function draw() {
      ui.innerHTML = ''; const out = img(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.min(6, Math.abs(dep.d[y * n + x] - focus) * 28 / F * 2.8 / 2.8); const R = Math.round(r); let s = 0, c = 0; for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= r * r + 0.5) { s += px(base, x + i, y + j); c++; } out.d[y * n + x] = s / c; }
      ui.appendChild(rowOf([fig(toCanvas(out, { size: 200 }), `F${F.toFixed(1)}：左=手前／中=中央／右=奥`)]));
      const rel = (1 / F) ** 2; ui.appendChild(note(`F値 = 焦点距離 ÷ 有効口径。<b>F値を大きく（絞る）ほど開口が小さく、ピント面から外れた点の<b>錯乱円</b>が小さい → 被写界深度が深い</b>（前後までくっきり）。逆にF値を小さく（開ける）と背景がよくボケる。像面の明るさは (1/F)² に比例：今の明るさは F1.4 の ${(rel / (1 / 1.4) ** 2 * 100).toFixed(1)}%。F値が√2倍（F2.8→F4）で光量は1/2（1段）。`));
      ui.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 300 110" width="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="110" fill="#fff"/><line x1="20" y1="55" x2="290" y2="55" stroke="#ccc"/><ellipse cx="110" cy="55" rx="5" ry="${40 / F * 2.8 > 45 ? 45 : 40 / F * 2.8}" fill="#cde" stroke="#68a"/><line x1="20" y1="30" x2="110" y2="${55 - Math.min(45, 40 / F * 2.8)}" stroke="#e33"/><line x1="20" y1="30" x2="110" y2="${55 + Math.min(45, 40 / F * 2.8)}" stroke="#e33"/><line x1="110" y1="${55 - Math.min(45, 40 / F * 2.8)}" x2="250" y2="70" stroke="#e33"/><line x1="110" y1="${55 + Math.min(45, 40 / F * 2.8)}" x2="250" y2="70" stroke="#e33"/><line x1="230" y1="10" x2="230" y2="100" stroke="#333" stroke-width="2"/><line x1="230" y1="${70 - Math.min(45, 40 / F * 2.8) * 0.14}" x2="230" y2="${70 + Math.min(45, 40 / F * 2.8) * 0.14}" stroke="#e33" stroke-width="5"/><text x="234" y="20" font-size="10">撮像面</text><text x="200" y="105" font-size="10" fill="#e33">錯乱円</text><text x="95" y="10" font-size="10">レンズ（開口）</text></svg>`));
    }
    draw();
    el.appendChild(code(`# 被写界深度の近似（過焦点距離 Hf = f^2/(N c) を使う）
f, N, c, s = 50e-3, 2.8, 0.03e-3, 3.0      # 焦点距離, F値, 許容錯乱円, ピント距離[m]
Hf = f*f/(N*c)
near = s*Hf/(Hf + (s - f)); far = s*Hf/(Hf - (s - f)) if Hf > s - f else float('inf')
print(near, far)   # N を大きくすると near は手前に, far は奥に広がる`));
  });
  reg(['cam-distortion'], '歪曲収差：たる型と糸巻き型', (el) => {
    let k = -0.25; const n = 96, ui = h('div'); el.appendChild(control('歪み係数 k₁', -0.5, 0.5, 0.05, k, (v) => (v < 0 ? 'たる型 ' : v > 0 ? '糸巻き型 ' : '歪みなし ') + v.toFixed(2), (v) => { k = v; draw(); })); el.appendChild(ui);
    const grid = img(n, n, 245); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x % 12 === 6 || y % 12 === 6) grid.d[y * n + x] = 30;
    function draw() {
      ui.innerHTML = ''; const out = img(n, n, 255), fixed = img(n, n, 255), c = n / 2;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - c) / c, v = (y - c) / c; let ru = u, rv = v; for (let it = 0; it < 6; it++) { const r2 = ru * ru + rv * rv; ru = u / (1 + k * r2); rv = v / (1 + k * r2); } const sx = ru * c + c, sy = rv * c + c; if (sx >= 0 && sy >= 0 && sx < n && sy < n) out.d[y * n + x] = px(grid, Math.floor(sx), Math.floor(sy)); }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - c) / c, v = (y - c) / c, r2 = u * u + v * v; const sx = u * (1 + k * r2) * c + c, sy = v * (1 + k * r2) * c + c; if (sx >= 0 && sy >= 0 && sx < n && sy < n) fixed.d[y * n + x] = px(out, Math.floor(sx), Math.floor(sy)); }
      ui.appendChild(rowOf([fig(toCanvas(grid, { size: 90 }), '本来の格子'), arrow(), fig(toCanvas(out, { size: 110 }), 'レンズで撮ると'), arrow(), fig(toCanvas(fixed, { size: 90 }), '歪み補正後')]));
      ui.appendChild(note('像の位置が中心からの距離 r に応じて <b>r_d = r(1 + k₁r² + k₂r⁴…)</b> とずれる。k₁<0 で外側ほど縮む<b>たる型</b>（広角レンズ）、k₁>0 で外側ほど伸びる<b>糸巻き型</b>（望遠）。直線が曲がるが<b>ピントのボケではない</b>（収差の中で唯一、像の鮮明さに影響しない）。キャリブレーションで k を求めて逆変換で補正する。'));
    }
    draw();
    el.appendChild(code(`import cv2
# K: 内部パラメータ, dist = [k1, k2, p1, p2, k3]（キャリブレーションで推定）
undist = cv2.undistort(img, K, dist)
# 中身: 正規化座標 (x, y) について r^2 = x^2 + y^2,
#   x_d = x (1 + k1 r^2 + k2 r^4 + k3 r^6) + 2 p1 x y + p2 (r^2 + 2x^2) ...`));
  });
  reg(['cam-vignetting'], '周辺減光：cos⁴則', (el) => {
    let fov = 60; const n = 96, ui = h('div'); el.appendChild(control('画角', 20, 120, 5, fov, (v) => v + '°', (v) => { fov = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const a = img(n, n), c = n / 2, fpx = c / Math.tan((fov / 2) * Math.PI / 180) * Math.SQRT1_2; const prof = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x - c, y - c), th = Math.atan(r / fpx); a.d[y * n + x] = 235 * Math.cos(th) ** 4; }
      for (let x = 0; x < n; x++) prof.push([x, a.d[(n >> 1) * n + x]]);
      ui.appendChild(rowOf([fig(toCanvas(a, { size: 130 }), '一様な白い壁を撮った画像'), fig(svgPlot([{ pts: prof, color: '#3563e9' }], { w: 160, h: 110, y0: 0, y1: 255, xl: '中央の行' }), '明るさ')]));
      ui.appendChild(note(`光軸から角度 θ の方向の像面照度は <b>cos⁴θ</b> に比例して下がる（斜めに入る光は、距離・入射角・開口の見かけの面積の効果が重なる）。画角 ${fov}° だと四隅で約 ${(Math.cos(Math.atan(Math.tan(fov / 2 * Math.PI / 180))) ** 4 * 100).toFixed(0)}% に低下。鏡筒で光がけられるビネッティングも加わる。補正は白い面を撮った画像で割る<b>シェーディング補正</b>。`));
    }
    draw();
    el.appendChild(code(`import numpy as np
H, W = img.shape; y, x = np.mgrid[0:H, 0:W]
r = np.hypot(x - W/2, y - H/2); theta = np.arctan(r / f_px)
fall = np.cos(theta) ** 4                  # cos^4 則
corrected = img / fall                     # 実際は白画像 W で割る: (img - dark)/(white - dark)`));
  });
  reg(['cam-chromatic-aberration', 'cam-lateral-chromatic'], '色収差：色ごとに像の位置・大きさがずれる', (el) => {
    let s = 0.03; const cs = colorScene(80), ui = h('div'); el.appendChild(control('ずれの大きさ', 0, 0.08, 0.005, s, (v) => (v * 100).toFixed(1) + '%', (v) => { s = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const c = 40; const out = mapRGB(cs, (r, g, b, i) => { const x = i % 80, y = (i / 80) | 0; const R = sampleRGB(cs, c + (x - c) / (1 + s), c + (y - c) / (1 + s))[0]; const B = sampleRGB(cs, c + (x - c) / (1 - s), c + (y - c) / (1 - s))[2]; return [R, g, B]; });
      const zoom = (o) => { const z = { r: img(40, 40), g: img(40, 40), b: img(40, 40), w: 40, h: 40 }; for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const i = y * 40 + x, j = (y + 30) * 80 + x + 40; z.r.d[i] = o.r.d[j]; z.g.d[i] = o.g.d[j]; z.b.d[i] = o.b.d[j]; } return z; };
      ui.appendChild(rowOf([fig(toCanvas(out, { size: 140 }), '倍率色収差のある画像'), fig(toCanvas(zoom(out), { size: 110 }), '右下を拡大（縁に色のにじみ）')]));
      ui.appendChild(note('レンズの屈折率は波長で違う（分散）ので、赤・緑・青で焦点や倍率がずれる。<b>倍率色収差</b>：色ごとに像の大きさが違い、<b>画面の周辺ほど</b>エッジに赤・青の色ずれが出る（中心は出ない）。<b>軸上色収差</b>：色ごとにピント位置が違い、画面中央でも色のにじみ・ボケが出る。対策は分散の異なるガラスを組み合わせた色消しレンズや、画像処理で色ごとに拡大率を補正。'));
    }
    draw();
    el.appendChild(code(`import cv2
# 倍率色収差の補正：R と B チャネルを中心まわりに少し拡大縮小して G に合わせる
h, w = img.shape[:2]; c = (w/2, h/2)
b, g, r = cv2.split(img)
r = cv2.warpAffine(r, cv2.getRotationMatrix2D(c, 0, 1/1.003), (w, h))
b = cv2.warpAffine(b, cv2.getRotationMatrix2D(c, 0, 1.003), (w, h))
fixed = cv2.merge([b, g, r])`));
  });
  reg(['cam-rolling-shutter'], 'ローリングシャッタ歪み', (el) => {
    let speed = 3; const n = 80, ui = h('div'); el.appendChild(control('物体の横移動速度', 0, 6, 0.5, speed, (v) => v + ' 画素/行時間×10', (v) => { speed = v; draw(); })); el.appendChild(ui);
    const objAt = (x, y, t) => { const ox = 20 + t; return x > ox && x < ox + 14 && y > 10 && y < 70; };
    function draw() {
      ui.innerHTML = ''; const gs = img(n, n, 220), rs = img(n, n, 220), prop = img(n, n, 220);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (objAt(x, y, 0)) gs.d[y * n + x] = 30; if (objAt(x, y, speed * y / 10)) rs.d[y * n + x] = 30; }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = (Math.atan2(y - 40, x - 40) + Math.PI + speed * y / 25) % (Math.PI / 2); if (Math.hypot(x - 40, y - 40) < 34 && a < 0.12) prop.d[y * n + x] = 30; }
      ui.appendChild(rowOf([fig(toCanvas(gs, { size: 100 }), 'グローバルシャッタ'), fig(toCanvas(rs, { size: 100 }), 'ローリングシャッタ'), fig(toCanvas(prop, { size: 100 }), '回転するプロペラ')]));
      ui.appendChild(note('CMOSセンサの多くは<b>上の行から順に時間をずらして</b>露光・読み出しする（ローリングシャッタ）。撮影中に物体が動くと、行ごとに違う時刻の位置が写るため、<b>縦の棒が斜めに傾く</b>、回転体が曲がるなどの歪みが出る。全画素を同時に露光するグローバルシャッタでは起きない（CCDや一部のCMOS）。'));
    }
    draw();
  });
  reg(['cam-mtf', 'restore-mtf'], 'MTF：細かい縞ほどコントラストが落ちる', (el) => {
    let sig = 1.2; const W = 192, Hh = 40, ui = h('div'); el.appendChild(control('レンズのぼけ（PSFの広がり）', 0.3, 3, 0.1, sig, (v) => 'σ=' + v.toFixed(1), (v) => { sig = v; draw(); })); el.appendChild(ui);
    const chirp = img(W, Hh); for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const f = 0.01 + (x / W) * 0.45; chirp.d[y * W + x] = 128 + 110 * Math.sin(2 * Math.PI * (0.01 * x + 0.45 * x * x / (2 * W))); }
    function draw() {
      ui.innerHTML = ''; const k = gaussK(sig); const k1 = [k[k.length >> 1].map((v) => v / k[k.length >> 1].reduce((a, b) => a + b))]; const out = conv(chirp, k1);
      ui.appendChild(rowOf([fig(toCanvas(chirp, { size: 300 }), '被写体：右ほど細かい縞（コントラスト一定）')]));
      ui.appendChild(rowOf([fig(toCanvas(out, { size: 300 }), 'レンズを通した像：細かい縞ほど灰色に溶ける')]));
      const mtf = []; for (let f = 0; f <= 0.5; f += 0.01) mtf.push([f, Math.exp(-2 * (Math.PI * f * sig) ** 2)]);
      ui.appendChild(svgPlot([{ pts: mtf, color: '#e33' }], { w: 300, h: 110, x0: 0, x1: 0.5, y0: 0, y1: 1.05, xl: '空間周波数（周期/画素、0.5=ナイキスト）', yl: 'MTF' }));
      ui.appendChild(note('MTF（変調伝達関数）＝ 像のコントラスト ÷ 被写体のコントラスト を空間周波数ごとに表したもの。<b>PSF（点の広がり）のフーリエ変換の絶対値</b>。低い周波数では1に近く、高い周波数ほど下がる。曲線が右まで高いほど解像力の高いレンズ。ぼけ（σ）を大きくすると曲線が早く落ちる。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
psf = np.exp(-x**2 / (2*sigma**2)); psf /= psf.sum()      # 線像分布(LSF)
mtf = np.abs(np.fft.rfft(psf, n=1024)); mtf /= mtf[0]      # MTF = |FT(PSF)| を正規化
freq = np.fft.rfftfreq(1024)                               # 周期/画素`));
  });
  reg(['cam-shot-noise', 'cam-dynamic-range', 'tone-dynamic-range'], '光が少ないとノイズが目立つ（ショットノイズ）', (el) => {
    let photons = 30; const n = 80, base = scene(n), ui = h('div'); el.appendChild(control('1画素あたりの平均光子数（明るさ）', 1, 1000, 1, photons, (v) => v + ' 個', (v) => { photons = v; draw(); })); el.appendChild(ui);
    const pois = (lam) => { if (lam > 50) { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return Math.max(0, lam + (u - 3) * Math.sqrt(lam * 2)); } let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
    function draw() {
      ui.innerHTML = ''; const out = img(n, n); for (let i = 0; i < n * n; i++) { const lam = (base.d[i] / 255) * photons; out.d[i] = (pois(lam) / photons) * 255; }
      ui.appendChild(rowOf([fig(toCanvas(out, { size: 150 }), `平均 ${photons} 光子/画素`)]));
      ui.appendChild(note(`光子は確率的にやってくるので、平均 N 個のときの揺らぎ（標準偏差）は <b>√N</b>（ポアソン分布）。SN比 = N/√N = <b>√N</b> ＝ 今は約 ${Math.sqrt(photons).toFixed(1)}。暗い（光子が少ない）ほどザラザラになり、これは<b>センサをどれだけ良くしても避けられない</b>。光量を4倍にするとSN比は2倍。ISO感度を上げるのは信号とノイズを一緒に増幅するだけ。`));
    }
    draw();
    el.appendChild(code(`import numpy as np
lam = img / 255 * photons               # 期待される光子数
noisy = np.random.poisson(lam) / photons * 255
snr = np.sqrt(lam)                      # ショットノイズ限界の SN 比`));
  });
  reg(['cam-white-balance'], 'ホワイトバランス：照明の色を打ち消す', (el) => {
    let temp = 3000; const cs = colorScene(72), ui = h('div'); el.appendChild(control('照明の色温度', 2000, 10000, 250, temp, (v) => v + 'K', (v) => { temp = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const ill = bbRGB(temp); const lit = mapRGB(cs, (r, g, b) => [r * ill[0], g * ill[1], b * ill[2]]);
      // 灰色仮説（グレーワールド）で補正
      let sr = 0, sg = 0, sb = 0; const N = 72 * 72; for (let i = 0; i < N; i++) { sr += lit.r.d[i]; sg += lit.g.d[i]; sb += lit.b.d[i]; } const m = (sr + sg + sb) / 3; const gw = mapRGB(lit, (r, g, b) => [r * m / sr * 1, g * m / sg, b * m / sb]);
      ui.appendChild(rowOf([fig(toCanvas(cs, { size: 90 }), '本来の色'), fig(toCanvas(lit, { size: 90 }), `${temp}K の照明で撮影`), arrow(), fig(toCanvas(gw, { size: 90 }), 'グレーワールド法で補正')]));
      ui.appendChild(note(`照明の色（電球=赤っぽい低色温度、日陰=青っぽい高色温度）がそのまま写ると、白い物も色づく。人の目は<b>色順応</b>で自動的に補正するがカメラはしない。<b>ホワイトバランス</b>は R・G・B に別々の係数を掛けて白を白にする。<b>グレーワールド法</b>は「画面全体の平均は灰色のはず」と仮定して各チャネルの平均をそろえる。照明の推定値：R×${ill[0].toFixed(2)} G×${ill[1].toFixed(2)} B×${ill[2].toFixed(2)}。`));
    }
    draw();
    el.appendChild(code(`import numpy as np
mean = img.reshape(-1, 3).mean(0)          # 各チャネルの平均
gain = mean.mean() / mean                  # グレーワールド仮定
balanced = np.clip(img * gain, 0, 255)
# 白い物を指定する場合: gain = 255 / img[y, x]`));
  });
  function bbRGB(T) { // 黒体の色（近似, Tanner Helland の式）を0..1に正規化
    const t = T / 100; let r, g, b; r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332); g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755); b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
    const c = [r, g, b].map((v) => clamp(v) / 255); const m = Math.max(...c); return c.map((v) => v / m);
  }

  // ======================= 色・視覚 =======================
  const cone = (l, peak, w) => Math.exp(-((l - peak) ** 2) / (2 * w * w));
  reg(['color-cone', 'color-rod', 'color-luminous-efficiency'], '錐体・桿体の感度と、見える色', (el) => {
    let lam = 550; const ui = h('div'); el.appendChild(control('光の波長', 380, 780, 5, lam, (v) => v + ' nm', (v) => { lam = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const S = [], M = [], L = [], R = [], Vp = []; for (let l = 380; l <= 780; l += 5) { S.push([l, cone(l, 440, 25)]); M.push([l, cone(l, 535, 40)]); L.push([l, cone(l, 565, 45)]); R.push([l, cone(l, 498, 40)]); Vp.push([l, cone(l, 555, 45)]); }
      const s = cone(lam, 440, 25), m = cone(lam, 535, 40), l = cone(lam, 565, 45); const wl = wavelengthRGB(lam);
      ui.appendChild(svgPlot([{ pts: S, color: '#3563e9' }, { pts: M, color: '#2a9d8f' }, { pts: L, color: '#e33' }, { pts: R, color: '#888', dash: 1 }], { w: 300, h: 140, x0: 380, x1: 780, y0: 0, y1: 1.05, marks: [{ x: lam, label: lam + 'nm', color: '#000' }], xl: '波長 nm（青S・緑M・赤L錐体、灰破線=桿体）' }));
      ui.appendChild(h('div', { className: 'row', style: 'gap:12px;align-items:center;justify-content:center' }, `<div style="width:70px;height:70px;border-radius:12px;background:rgb(${wl})"></div><div style="font-size:14px">S錐体 ${(s * 100).toFixed(0)}%<br>M錐体 ${(m * 100).toFixed(0)}%<br>L錐体 ${(l * 100).toFixed(0)}%</div>`));
      ui.appendChild(note('網膜には色を感じる<b>錐体</b>3種（S≈420-440nm・M≈530nm・L≈560nm にピーク）と、暗所で働く<b>桿体</b>（≈500nm、色は区別しない）がある。脳は3種の錐体の<b>反応の比</b>で色を感じる（三色説）。だから違う波長の組み合わせでも反応比が同じなら同じ色に見える（<b>メタメリズム</b>）。比視感度は明所視で555nm、暗所視（桿体）で507nmが最大 → 暗くなると青っぽい物が相対的に明るく見える（<b>プルキンエ現象</b>）。'));
    }
    draw();
  });
  function wavelengthRGB(l) { let r = 0, g = 0, b = 0; if (l < 440) { r = (440 - l) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = (510 - l) / 20; } else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = (645 - l) / 65; } else r = 1; const f = l < 420 ? 0.3 + 0.7 * (l - 380) / 40 : l > 700 ? 0.3 + 0.7 * (780 - l) / 80 : 1; return [r, g, b].map((v) => Math.round(255 * Math.pow(v * f, 0.8))).join(','); }
  reg(['color-color-temperature', 'color-blackbody'], '色温度：黒体を熱したときの色', (el) => {
    let T = 6500; const ui = h('div'); el.appendChild(control('温度', 1500, 12000, 100, T, (v) => v + ' K', (v) => { T = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const c = bbRGB(T).map((v) => Math.round(v * 255)); const sp = []; for (let l = 380; l <= 780; l += 5) { const lm = l * 1e-9; sp.push([l, 1 / (lm ** 5 * (Math.exp(1.4388e-2 / (lm * T)) - 1))]); } const mx = Math.max(...sp.map((p) => p[1])); const peak = 2.898e6 / T;
      ui.appendChild(h('div', { className: 'row', style: 'gap:12px;justify-content:center;align-items:center' }, `<div style="width:90px;height:90px;border-radius:50%;background:rgb(${c});box-shadow:0 0 30px rgb(${c})"></div><div style="font-size:14px">${T} K<br>ピーク波長 ${peak.toFixed(0)} nm<br>${T < 3500 ? '電球・夕日（赤っぽい）' : T < 5500 ? '昼白色' : T < 7000 ? '昼光（D65≈6504K）' : '曇り空・日陰（青っぽい）'}</div>`));
      ui.appendChild(svgPlot([{ pts: sp.map(([l, v]) => [l, v / mx]), color: '#e9a23b' }], { w: 300, h: 110, x0: 380, x1: 780, y0: 0, y1: 1.05, xl: '波長 nm（可視域のプランク分布）' }));
      ui.appendChild(note('理想的な黒体を熱すると、温度に応じた光を出す（プランクの法則）。温度が高いほどピーク波長が短くなる（<b>ウィーンの変位則 λmax = 2898/T μm</b>）→ 赤 → 白 → 青白。光源の色をその色に見える黒体の温度で表したのが<b>色温度</b>。注意：<b>低い色温度＝赤っぽい（暖色）、高い色温度＝青っぽい（寒色）</b>で、感覚の「暖かい・冷たい」と逆。'));
    }
    draw();
  });
  reg(['color-contrast-effect', 'color-weber-law', 'color-weber-fechner'], '同時対比とウェーバーの法則', (el) => {
    let gray = 128; const ui = h('div'); el.appendChild(control('中央の四角の濃度（左右共通）', 60, 200, 2, gray, null, (v) => { gray = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = '';
      ui.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 300 120" width="300" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="150" height="120" fill="rgb(30,30,30)"/><rect x="150" y="0" width="150" height="120" fill="rgb(230,230,230)"/><rect x="50" y="35" width="50" height="50" fill="rgb(${gray},${gray},${gray})"/><rect x="200" y="35" width="50" height="50" fill="rgb(${gray},${gray},${gray})"/></svg>`));
      ui.appendChild(note('左右の小さな四角は<b>まったく同じ濃度</b>なのに、暗い背景の上は明るく、明るい背景の上は暗く見える（<b>明るさの同時対比</b>）。視覚は絶対値ではなく周囲との<b>比・差</b>で明るさを判断している。'));
      const rows = [20, 50, 100, 200].map((I) => `<tr><td>${I}</td><td>${(I * 0.02).toFixed(1)}</td><td>0.02</td></tr>`).join('');
      ui.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>基準の明るさ I</th><th>やっと分かる差 ΔI</th><th>ΔI/I</th></tr>${rows}</table>`));
      ui.appendChild(note('<b>ウェーバーの法則</b>：やっと区別できる差 ΔI は基準 I に比例し <b>ΔI/I = 一定</b>（明るさで約1〜2%）。暗い所では小さな差でも分かるが、明るい所では大きな差が要る。これを積分すると感覚量は刺激の<b>対数</b>に比例する（<b>ウェーバー・フェヒナーの法則</b> E = k log I）。画像の階調をガンマや対数で割り当てる根拠。'));
    }
    draw();
  });
  reg(['color-mse', 'color-psnr', 'color-ssim'], 'MSE・PSNR・SSIM：画質を数値で測る', (el) => {
    let kind = 'noise', amt = 15; const n = 64, ref = scene(n), ui = h('div');
    el.appendChild(select('劣化', [['noise', 'ガウスノイズ'], ['blur', 'ぼかし'], ['bright', '明るさを一様に上げる'], ['jpeg', 'ブロック化（粗い量子化）']], kind, (v) => { kind = v; draw(); }));
    el.appendChild(control('劣化の強さ', 1, 40, 1, amt, null, (v) => { amt = v; draw(); })); el.appendChild(ui);
    function ssim(a, b) { const C1 = 6.5025, C2 = 58.5225; let tot = 0, cnt = 0; for (let y = 0; y < n - 7; y += 4) for (let x = 0; x < n - 7; x += 4) { let ma = 0, mb = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { ma += a.d[(y + j) * n + x + i]; mb += b.d[(y + j) * n + x + i]; } ma /= 64; mb /= 64; let va = 0, vb = 0, cv = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const da = a.d[(y + j) * n + x + i] - ma, db = b.d[(y + j) * n + x + i] - mb; va += da * da; vb += db * db; cv += da * db; } va /= 63; vb /= 63; cv /= 63; tot += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); cnt++; } return tot / cnt; }
    function draw() {
      ui.innerHTML = ''; let d;
      if (kind === 'noise') d = IP.addGauss(ref, amt); else if (kind === 'blur') d = conv(ref, gaussK(amt / 10 + 0.3)); else if (kind === 'bright') d = IP.map(ref, (v) => clamp(v + amt)); else { const q = amt * 3; d = IP.map(ref, (v, i) => { const x = i % n, y = (i / n) | 0; let s = 0; for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) s += px(ref, (x & ~3) + k, (y & ~3) + j); return Math.round(s / 16 / q) * q; }); }
      let mse = 0; for (let i = 0; i < n * n; i++) mse += (ref.d[i] - d.d[i]) ** 2; mse /= n * n; const psnr = 10 * Math.log10(65025 / Math.max(mse, 1e-9)); const ss = ssim(ref, d);
      ui.appendChild(rowOf([fig(toCanvas(ref, { size: 110 }), '原画像'), fig(toCanvas(d, { size: 110 }), '劣化画像')]));
      ui.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>MSE</th><th>PSNR</th><th>SSIM</th></tr><tr><td>${mse.toFixed(1)}</td><td>${psnr.toFixed(1)} dB</td><td>${ss.toFixed(3)}</td></tr></table>`));
      ui.appendChild(note('<b>MSE</b>＝画素ごとの差の2乗の平均。<b>PSNR = 10 log₁₀(255²/MSE)</b> [dB]、大きいほど良い（30dB台で良好、MSE が1/10で+10dB）。ただし MSE/PSNR は人の見た目と一致しないことがある：<b>明るさを一様に上げただけ</b>でも PSNR は大きく下がるが、見た目の劣化は小さい。<b>SSIM</b> は局所の平均（輝度）・分散（コントラスト）・共分散（構造）の類似度で、1が完全一致。構造が保たれていれば高い。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
mse = np.mean((ref.astype(float) - img) ** 2)
psnr = 10 * np.log10(255**2 / mse)
from skimage.metrics import structural_similarity as ssim   # SSIM
s = ssim(ref, img, data_range=255)`));
  });
  reg(['color-subtractive-mixing', 'color-xy-chromaticity'], '加法混色・減法混色と色度図', (el) => {
    const W = 300;
    el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 300 140" width="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="140" fill="#000" rx="8" x="0" width="146"/><g style="mix-blend-mode:screen"><circle cx="55" cy="55" r="34" fill="#f00"/><circle cx="90" cy="55" r="34" fill="#0f0"/><circle cx="72" cy="85" r="34" fill="#00f"/></g><rect x="154" y="0" width="146" height="140" fill="#fff" rx="8"/><g style="mix-blend-mode:multiply"><circle cx="205" cy="55" r="34" fill="#0ff"/><circle cx="240" cy="55" r="34" fill="#f0f"/><circle cx="222" cy="85" r="34" fill="#ff0"/></g><text x="8" y="134" font-size="10" fill="#fff">加法混色（光：RGB）</text><text x="160" y="134" font-size="10">減法混色（インク：CMY）</text></svg>`));
    el.appendChild(note('<b>加法混色</b>（ディスプレイ・照明）：光を足す。R+G=イエロー、G+B=シアン、R+B=マゼンタ、全部で<b>白</b>。<b>減法混色</b>（印刷・絵の具・フィルタ）：光を吸収して引く。C+M=青、M+Y=赤、C+Y=緑、全部で<b>黒</b>（実際は濁るので K＝黒インクを足して CMYK）。'));
    const loc = [[380, 0.1741, 0.005], [460, 0.144, 0.0297], [470, 0.1241, 0.0578], [480, 0.0913, 0.1327], [490, 0.0454, 0.295], [500, 0.0082, 0.5384], [510, 0.0139, 0.7502], [520, 0.0743, 0.8338], [540, 0.2296, 0.7543], [560, 0.3731, 0.6245], [580, 0.5125, 0.4866], [600, 0.627, 0.3725], [620, 0.6915, 0.3083], [700, 0.7347, 0.2653]];
    const X = (x) => 30 + x * 320, Y = (y) => 290 - y * 320;
    el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 300 300" width="280" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#fff"/><defs><linearGradient id="gg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#36f"/><stop offset=".45" stop-color="#3f9"/><stop offset="1" stop-color="#f33"/></linearGradient></defs><polygon points="${loc.map(([, x, y]) => X(x) + ',' + Y(y)).join(' ')}" fill="url(#gg)" opacity=".35" stroke="#333"/>${loc.filter((p, i) => i % 2 === 0 || p[0] === 700).map(([l, x, y]) => `<text x="${X(x) + 3}" y="${Y(y)}" font-size="9">${l}</text>`).join('')}<polygon points="${X(0.64)},${Y(0.33)} ${X(0.3)},${Y(0.6)} ${X(0.15)},${Y(0.06)}" fill="none" stroke="#000" stroke-width="1.5"/><polygon points="${X(0.708)},${Y(0.292)} ${X(0.17)},${Y(0.797)} ${X(0.131)},${Y(0.046)}" fill="none" stroke="#e33" stroke-dasharray="4 2"/><circle cx="${X(0.3127)}" cy="${Y(0.329)}" r="3"/><text x="${X(0.32)}" y="${Y(0.31)}" font-size="9">D65</text><line x1="30" y1="290" x2="290" y2="290" stroke="#999"/><line x1="30" y1="30" x2="30" y2="290" stroke="#999"/><text x="280" y="285" font-size="10">x</text><text x="34" y="40" font-size="10">y</text><text x="${X(0.45)}" y="${Y(0.62)}" font-size="9">sRGB（黒）</text><text x="${X(0.47)}" y="${Y(0.7)}" font-size="9" fill="#e33">BT.2020（赤破線）</text></svg>`));
    el.appendChild(note('<b>xy色度図</b>：XYZ から x=X/(X+Y+Z), y=Y/(X+Y+Z) を取り、明るさを除いた色みを平面に表したもの。外周の馬てい形が単色光（<b>スペクトル軌跡</b>、数字は波長nm）、下辺の直線が<b>純紫軌跡</b>。3原色で作れる色は三角形の内側だけ（<b>色域</b>）。2色を混ぜた色は2点を結ぶ線分上にある。'));
  });

  // ======================= 周波数・復元 =======================
  reg(['freq-phase-spectrum'], '振幅と位相を入れ替える実験：形を決めるのは位相', (el) => {
    const n = 48, A = scene(n), B = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) B.d[y * n + x] = (Math.hypot(x - 24, y - 24) < 16 ? 220 : 40) + ((x + y) % 12 < 6 ? 20 : 0);
    const FA = dft2(A), FB = dft2(B); const mix = (Fm, Fp) => { const re = new Float64Array(n * n), im = new Float64Array(n * n); for (let i = 0; i < n * n; i++) { const m = Math.hypot(Fm.re[i], Fm.im[i]), p = Math.atan2(Fp.im[i], Fp.re[i]); re[i] = m * Math.cos(p); im[i] = m * Math.sin(p); } return IP.map(idft2({ re, im, n }), (v) => clamp(v)); };
    el.appendChild(rowOf([fig(toCanvas(A, { size: 90 }), '画像A'), fig(toCanvas(B, { size: 90 }), '画像B')]));
    el.appendChild(rowOf([fig(toCanvas(mix(FB, FA), { size: 100 }), 'Bの振幅 ＋ Aの位相'), fig(toCanvas(mix(FA, FB), { size: 100 }), 'Aの振幅 ＋ Bの位相')]));
    el.appendChild(note('フーリエ変換の結果は各周波数の<b>振幅</b>（その縞の強さ）と<b>位相</b>（縞の位置のずれ）。振幅と位相を2枚の画像で入れ替えて逆変換すると、<b>見た目は位相を提供した画像に似る</b>。エッジや物体の位置・形の情報は位相に多く含まれる。だから位相限定相関法は位相だけで位置合わせができる。'));
    el.appendChild(code(`import numpy as np
FA, FB = np.fft.fft2(A), np.fft.fft2(B)
mix = np.abs(FB) * np.exp(1j * np.angle(FA))     # Bの振幅 + Aの位相
out = np.real(np.fft.ifft2(mix))                 # → Aのように見える`));
  });
  reg(['freq-notch'], 'ノッチフィルタ：周期ノイズをスペクトルで消す', (el) => {
    const n = 48, src = scene(n), noisy = IP.map(src, (v, i) => clamp(v + 45 * Math.sin((2 * Math.PI * (6 * (i % n) + 3 * ((i / n) | 0))) / n)));
    const F = dft2(noisy), re = new Float64Array(F.re), im = new Float64Array(F.im);
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) { const fu = u < n / 2 ? u : u - n, fv = v < n / 2 ? v : v - n; if (Math.hypot(fu - 6, fv - 3) < 2 || Math.hypot(fu + 6, fv + 3) < 2) { re[v * n + u] = 0; im[v * n + u] = 0; } }
    el.appendChild(rowOf([fig(toCanvas(noisy, { size: 90 }), '斜めの縞ノイズ入り'), fig(toCanvas(specImg(F), { size: 90 }), 'スペクトル（明るい2点）'), arrow(), fig(toCanvas(specImg({ re, im, n }), { size: 90 }), '2点だけ消す'), fig(toCanvas(IP.map(idft2({ re, im, n }), (v) => clamp(v)), { size: 90 }), '逆変換')]));
    el.appendChild(note('電気的な干渉などで乗った<b>周期的なノイズ</b>は、スペクトル上で<b>中心対称の明るい点</b>として現れる。その点の周辺だけを0にする（ノッチ＝切り欠き）と、画像の他の成分はほぼそのままでノイズだけ消せる。空間フィルタでは難しい処理。'));
  });
  reg(['freq-gabor'], 'ガボールフィルタ：向きと細かさを選んで反応', (el) => {
    let th = 0, lam = 6; const n = 64, src = IP.map(scene(n), (v, i) => v + (((i % n) > 32 && ((i / n) | 0) > 40) ? 40 * Math.sin((i % n) * 1.05) : 0)), ui = h('div');
    el.appendChild(control('向き θ', 0, 165, 15, th, (v) => v + '°', (v) => { th = v; draw(); })); el.appendChild(control('波長 λ', 3, 14, 1, lam, null, (v) => { lam = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const k = [], r = 6, t = (th * Math.PI) / 180; for (let j = -r; j <= r; j++) { const row = []; for (let i = -r; i <= r; i++) { const xr = i * Math.cos(t) + j * Math.sin(t), yr = -i * Math.sin(t) + j * Math.cos(t); row.push(Math.exp(-(xr * xr + yr * yr) / (2 * (lam * 0.5) ** 2)) * Math.cos((2 * Math.PI * xr) / lam)); } k.push(row); }
      const m = k.flat().reduce((a, b) => a + b) / k.flat().length; const kk = k.map((rw) => rw.map((v) => v - m)); const kim = img(13, 13); kk.flat().forEach((v, i) => (kim.d[i] = 128 + v * 120));
      const out = IP.map(conv(src, kk, 1), (v) => clamp(Math.abs(v) * 0.8));
      ui.appendChild(rowOf([fig(toCanvas(kim, { size: 70 }), 'カーネル'), fig(toCanvas(src, { size: 100 }), '入力'), arrow(), fig(toCanvas(out, { size: 100 }), '応答（明=強い）')]));
      ui.appendChild(note('ガウス関数 × 正弦波 のカーネル。<b>特定の向き θ・特定の細かさ λ の縞やエッジにだけ強く反応</b>する（空間と周波数の両方で局在）。複数の向き・波長のフィルタ群（フィルタバンク）の応答をテクスチャ特徴や虹彩・指紋認識に使う。脳の視覚野（V1）の単純型細胞の受容野に似ている。向きを変えて、応答する輪郭が変わることを確認しよう。'));
    }
    draw();
    el.appendChild(code(`import cv2, numpy as np
k = cv2.getGaborKernel((13, 13), sigma=3, theta=np.deg2rad(th), lambd=6, gamma=1, psi=0)
resp = cv2.filter2D(img.astype(np.float32), -1, k)`));
  });
  reg(['restore-radon', 'restore-back-projection', 'restore-fbp', 'restore-projection-slice'], 'CT：投影（サイノグラム）から断面を再構成', (el) => {
    let nang = 60, filt = true; const n = 48, ui = h('div');
    const ph = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - 24) / 20, v = (y - 24) / 22; let val = u * u + v * v < 1 ? 100 : 0; if ((x - 18) ** 2 + (y - 20) ** 2 < 25) val = 220; if (Math.abs(x - 30) < 4 && Math.abs(y - 30) < 6) val = 40; if ((x - 28) ** 2 + (y - 16) ** 2 < 6) val = 255; ph.d[y * n + x] = val; }
    el.appendChild(control('投影の方向の数', 4, 90, 2, nang, (v) => v + ' 方向', (v) => { nang = v; draw(); }));
    el.appendChild(select('再構成', [['fbp', 'フィルタ補正逆投影法（FBP）'], ['bp', '単純逆投影法']], 'fbp', (v) => { filt = v === 'fbp'; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const NR = n; const sino = []; for (let a = 0; a < nang; a++) { const t = (a * Math.PI) / nang, c = Math.cos(t), s = Math.sin(t), p = new Float64Array(NR); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const rf = (x - 24) * c + (y - 24) * s + NR / 2, r0 = Math.floor(rf), f = rf - r0; if (r0 >= 0 && r0 + 1 < NR) { p[r0] += ph.d[y * n + x] * (1 - f); p[r0 + 1] += ph.d[y * n + x] * f; } } sino.push(p); }
      const sImg = img(NR, nang); sino.forEach((p, a) => p.forEach((v, r) => (sImg.d[a * NR + r] = v))); let mx = 0; sImg.d.forEach((v) => (mx = Math.max(mx, v))); const sVis = IP.map(sImg, (v) => (v / mx) * 255);
      const fp = sino.map((p) => { if (!filt) return p; const q = new Float64Array(NR); for (let r = 0; r < NR; r++) { let s = 0; for (let k = -NR; k <= NR; k++) { const j = r - k; if (j < 0 || j >= NR) continue; const hk = k === 0 ? 0.25 : k % 2 ? -1 / (Math.PI * Math.PI * k * k) : 0; s += hk * p[j]; } q[r] = s; } return q; });
      const rec = img(n, n); for (let a = 0; a < nang; a++) { const t = (a * Math.PI) / nang, c = Math.cos(t), s = Math.sin(t); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const rf = (x - 24) * c + (y - 24) * s + NR / 2, r0 = Math.floor(rf), f = rf - r0; if (r0 >= 0 && r0 + 1 < NR) rec.d[y * n + x] += fp[a][r0] * (1 - f) + fp[a][r0 + 1] * f; } }
      let rmn = Infinity, rmx = -Infinity; rec.d.forEach((v) => { rmn = Math.min(rmn, v); rmx = Math.max(rmx, v); }); const rVis = IP.map(rec, (v) => clamp(filt ? Math.max(0, v) / rmx * 255 : ((v - rmn) / (rmx - rmn)) * 255));
      ui.appendChild(rowOf([fig(toCanvas(ph, { size: 90 }), '断面（ファントム）'), arrow(), fig(toCanvas(sVis, { size: 110 }), 'サイノグラム（横:位置 縦:角度）'), arrow(), fig(toCanvas(rVis, { size: 90 }), filt ? 'FBPで再構成' : '単純逆投影')]));
      ui.appendChild(note('X線を各方向から当て、通り抜ける間に吸収された量の合計（<b>投影</b>＝ラドン変換）を測る。角度を縦に並べたものが<b>サイノグラム</b>（1点は正弦波状の軌跡になる）。<b>単純逆投影</b>は各投影を来た方向に塗り戻して足すだけなので、<b>ぼやけた</b>像になる（1/r のぼけ）。<b>FBP</b>は投影に高域強調フィルタ（ランプフィルタ）をかけてから逆投影し、ぼけを打ち消す。方向が少ないと放射状の筋（アーチファクト）が出る。投影切断面定理：投影の1次元フーリエ変換＝断面の2次元フーリエ変換をその角度で切った線。'));
    }
    draw();
    el.appendChild(code(`from skimage.transform import radon, iradon
import numpy as np
theta = np.linspace(0, 180, 60, endpoint=False)
sino = radon(phantom, theta=theta)                  # 投影（ラドン変換）
bp   = iradon(sino, theta=theta, filter_name=None)  # 単純逆投影（ぼける）
fbp  = iradon(sino, theta=theta, filter_name='ramp')  # フィルタ補正逆投影`));
  });
  reg(['restore-hdr', 'restore-tone-mapping'], 'HDR合成とトーンマッピング', (el) => {
    const n = 72, rad = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let L = 0.02 + 0.05 * (x / n); if (y < 30) L = 3 + 4 * (1 - y / 30); if ((x - 52) ** 2 + (y - 14) ** 2 < 49) L = 60; if (x > 8 && x < 30 && y > 40 && y < 66) L = 0.01 + ((x + y) % 6 < 3 ? 0.03 : 0); if (x > 36 && x < 64 && y > 44 && y < 64) L = 0.15 + ((x % 8) < 4 ? 0.1 : 0); rad.d[y * n + x] = L; }
    const exp = [0.5, 4, 32].map((t) => IP.map(rad, (L) => clamp(255 * Math.pow(Math.min(1, L * t / 8), 1 / 2.2))));
    el.appendChild(note('明るい空・太陽と暗い室内が同時にあるシーン（明るさの比は数千倍）。1枚の撮影では<b>どこかが白飛びか黒つぶれ</b>する。'));
    el.appendChild(rowOf(exp.map((e, i) => fig(toCanvas(e, { size: 86 }), ['短い露光', '中間', '長い露光'][i]))));
    const L = rad.d; let lavg = 0; L.forEach((v) => (lavg += Math.log(1e-4 + v))); lavg = Math.exp(lavg / L.length);
    const tm = IP.map(rad, (v) => { const Lm = (0.18 * v) / lavg; return clamp(255 * Math.pow(Lm / (1 + Lm), 1 / 2.2)); });
    const lin = IP.map(rad, (v) => clamp((v / 60) * 255));
    el.appendChild(rowOf([fig(toCanvas(lin, { size: 100 }), 'HDRを線形に表示（暗部が真っ黒）'), arrow(), fig(toCanvas(tm, { size: 100 }), 'トーンマッピング（Reinhard）')]));
    el.appendChild(note('<b>HDR合成</b>：露光を変えた複数枚から、各画素で白飛び・黒つぶれしていない画像の値を重み付きで使い、<b>実際の明るさ（放射輝度）に比例した高ダイナミックレンジ画像</b>を作る（カメラの応答曲線の推定も行う：Debevec–Malik）。<b>トーンマッピング</b>：それをディスプレイの0〜255に収める圧縮。Reinhard の L/(1+L) は暗部をほぼ線形に、明部を強く圧縮する。'));
    el.appendChild(code(`import cv2, numpy as np
imgs = [img_short, img_mid, img_long]; times = np.array([1/250, 1/30, 1/4], np.float32)
hdr = cv2.createMergeDebevec().process(imgs, times)     # 放射輝度マップ（float）
ldr = cv2.createTonemapReinhard(gamma=2.2).process(hdr) # 0..1 に圧縮
# Reinhard の中身: Lm = a * L / mean_log(L);  Ld = Lm / (1 + Lm)`));
  });
  reg(['restore-dark-channel'], 'ダークチャネルプライアによる霞除去', (el) => {
    const cs = colorScene(72), n = 72; const t = (y) => 0.25 + 0.75 * (y / n); const A = [215, 220, 225];
    const hazy = mapRGB(cs, (r, g, b, i) => { const tt = t((i / n) | 0) * (1 - 0.4 * ((i % n) / n)); return [r * tt + A[0] * (1 - tt), g * tt + A[1] * (1 - tt), b * tt + A[2] * (1 - tt)]; });
    const dark = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let m = 255; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const X = Math.min(n - 1, Math.max(0, x + i)), Y = Math.min(n - 1, Math.max(0, y + j)), k = Y * n + X; m = Math.min(m, hazy.r.d[k] / A[0] * 255, hazy.g.d[k] / A[1] * 255, hazy.b.d[k] / A[2] * 255); } dark.d[y * n + x] = m; }
    const tr = IP.map(dark, (v) => Math.max(0.1, 1 - 0.95 * v / 255));
    const out = mapRGB(hazy, (r, g, b, i) => { const tt = tr.d[i]; return [(r - A[0]) / tt + A[0], (g - A[1]) / tt + A[1], (b - A[2]) / tt + A[2]]; });
    el.appendChild(rowOf([fig(toCanvas(hazy, { size: 100 }), '霞んだ画像'), fig(toCanvas(dark, { size: 100 }), 'ダークチャネル'), arrow(), fig(toCanvas(out, { size: 100 }), '霞除去')]));
    el.appendChild(note('霞のモデル：<b>I = J·t + A(1−t)</b>（J: 本来の色, A: 大気光, t: 透過率）。霞のない屋外画像では、局所領域の<b>RGBの最小値（ダークチャネル）はほぼ0</b>になる（影・鮮やかな色・暗い物が必ずある）という経験則を使う。霞があると最小値が持ち上がるので、その量から t を推定して J を逆算する（He ら 2009）。空のように本当に明るく白い領域では仮定が崩れる。'));
  });
  reg(['restore-inpainting', 'restore-exemplar-inpainting'], 'インペインティング：欠けた部分を周囲から埋める', (el) => {
    const n = 64, src = scene(n), mask = new Uint8Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((Math.abs(x - y - 4) < 2 && x > 10 && x < 54) || (x > 40 && x < 48 && y > 12 && y < 26)) mask[y * n + x] = 1;
    const broken = IP.map(src, (v, i) => (mask[i] ? 255 : v)); const steps = [IP.clone(broken)]; let cur = IP.map(broken, (v, i) => (mask[i] ? 128 : v));
    for (let it = 1; it <= 200; it++) { const nx = IP.clone(cur); for (let i = 0; i < n * n; i++) if (mask[i]) { const x = i % n, y = (i / n) | 0; nx.d[i] = (px(cur, x - 1, y) + px(cur, x + 1, y) + px(cur, x, y - 1) + px(cur, x, y + 1)) / 4; } cur = nx; if (it === 5 || it === 30 || it === 200) steps.push(IP.clone(cur)); }
    el.appendChild(rowOf(steps.map((s, i) => fig(toCanvas(s, { size: 80 }), ['欠損（白）', '5回', '30回', '200回'][i]))));
    el.appendChild(note('欠損部分（傷・文字・取り除きたい物体）の画素値を、周囲の画素から推定して埋める。<b>拡散型</b>（ここで実演）は周囲の値を少しずつ染み込ませる（ラプラス方程式を解く）ので、細い傷には有効だが大きな穴はぼやける。<b>事例ベース</b>（Criminisi ら）は画像中の似たパッチをコピーして埋め、テクスチャや構造まで再現できる。最近は深層学習（生成モデル）が主流。'));
    el.appendChild(code(`import cv2
out = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)   # mask: 欠損=255
# 拡散の中身（反復）: 欠損画素 = 上下左右の平均 を収束するまで繰り返す`));
  });

  // ======================= 幾何 =======================
  reg(['geo-polar', 'geo-log-polar'], '極座標・対数極座標変換', (el) => {
    const n = 80, src = IP.glyphF(80); let mode = 'log', rot = 0, sc = 1; const ui = h('div');
    el.appendChild(select('変換', [['polar', '極座標'], ['log', '対数極座標']], mode, (v) => { mode = v; draw(); }));
    el.appendChild(control('入力を回転', 0, 90, 15, rot, (v) => v + '°', (v) => { rot = v; draw(); })); el.appendChild(control('入力を拡大', 0.6, 1.6, 0.1, sc, (v) => v.toFixed(1) + '倍', (v) => { sc = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180); const inp = IP.warp(src, [[sc * c, -sc * s, 0], [sc * s, sc * c, 0]]); const out = img(n, n, 245), R = n / 2;
      for (let ti = 0; ti < n; ti++) for (let ri = 0; ri < n; ri++) { const th = (ti / n) * 2 * Math.PI, r = mode === 'log' ? Math.exp((ri / n) * Math.log(R)) : (ri / n) * R; const x = R + r * Math.cos(th), y = R - r * Math.sin(th); if (x >= 0 && y >= 0 && x < n && y < n) out.d[ti * n + ri] = px(inp, Math.floor(x), Math.floor(y)); }
      ui.appendChild(rowOf([fig(toCanvas(inp, { size: 110 }), '入力（中心が原点）'), arrow(), fig(toCanvas(out, { size: 110 }), `横:${mode === 'log' ? 'log r' : 'r'}　縦:θ`)]));
      ui.appendChild(note('中心からの距離 r と角度 θ を縦横の軸にした画像に変換する。<b>入力の回転 → 出力では縦方向の平行移動</b>になる。<b>対数極座標</b>では<b>拡大縮小も横方向の平行移動</b>になる（log(kr)=log k+log r）。回転・拡大を平行移動に変えられるので、位相限定相関などと組み合わせて回転・スケールに強い位置合わせに使う。人の網膜の視細胞配置も中心が密な対数極座標に近い。'));
    }
    draw();
    el.appendChild(code(`import cv2
polar = cv2.warpPolar(img, (W, H), center, maxRadius, cv2.WARP_POLAR_LINEAR)
logp  = cv2.warpPolar(img, (W, H), center, maxRadius, cv2.WARP_POLAR_LOG)`));
  });
  reg(['geo-morphing', 'geo-chroma-key'], 'モーフィングとクロマキー合成', (el) => {
    const n = 64; let t = 0.5; const ui = h('div'); el.appendChild(control('t（0→1）', 0, 1, 0.05, t, (v) => v.toFixed(2), (v) => { t = v; draw(); })); el.appendChild(ui);
    const A = img(n, n, 240), B = img(n, n, 240); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if ((x - 20) ** 2 + (y - 32) ** 2 < 144) A.d[y * n + x] = 40; if (x > 34 && x < 58 && y > 20 && y < 44) B.d[y * n + x] = 40; }
    function draw() {
      ui.innerHTML = ''; const cross = IP.map(A, (v, i) => (1 - t) * v + t * B.d[i]); const mor = img(n, n, 240);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const cx = 20 + (46 - 20) * t, cy = 32; const dx = x - cx, dy = y - cy; const inA = dx * dx + dy * dy < 144 * (1 - t) + 0.0001; const inB = Math.abs(dx) < 12 * t + 0.0001 && Math.abs(dy) < 12 * t + 0.0001; const rr = (1 - t) * Math.hypot(dx, dy) / 12 + t * Math.max(Math.abs(dx), Math.abs(dy)) / 12; if (rr < 1) mor.d[y * n + x] = 40; }
      ui.appendChild(rowOf([fig(toCanvas(A, { size: 70 }), 'A'), fig(toCanvas(cross, { size: 90 }), 'クロスディゾルブ'), fig(toCanvas(mor, { size: 90 }), 'モーフィング'), fig(toCanvas(B, { size: 70 }), 'B')]));
      ui.appendChild(note('<b>クロスディゾルブ</b>（単純な α ブレンド (1−t)A + tB）は2枚が<b>透けて重なる</b>だけ。<b>モーフィング</b>は対応点（目・口など）の位置を t に応じて補間し、両画像をその中間形状に<b>変形（ワーピング）してから</b>ブレンドする → 形そのものが連続的に変わって見える。'));
    }
    draw();
    const cs = colorScene(64); const fg = mapRGB(cs, (r, g, b, i) => { const x = i % 64, y = (i / 64) | 0; return (x - 32) ** 2 / 300 + (y - 36) ** 2 / 500 < 1 ? [220, 170, 130] : [20, 220, 40]; });
    const comp = mapRGB(fg, (r, g, b, i) => (g > 180 && r < 80 && b < 80 ? [cs.r.d[i], cs.g.d[i], cs.b.d[i]] : [r, g, b]));
    el.appendChild(rowOf([fig(toCanvas(fg, { size: 80 }), 'グリーンバックで撮影'), fig(toCanvas(cs, { size: 80 }), '背景'), arrow(), fig(toCanvas(comp, { size: 90 }), 'クロマキー合成')]));
    el.appendChild(note('<b>クロマキー</b>：特定の色（人の肌に少ない緑・青）の画素を「透明」とみなすマスクを作り、その部分を別の背景で置き換える。被写体に同じ色があると抜けてしまう。境界は α 値を連続的に推定（マッティング）すると自然になる。'));
  });

  // ======================= 2値・形状 =======================
  function shapes() { const n = 48, G = Array.from({ length: n }, () => Array(n).fill(0)); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if ((x - 12) ** 2 + (y - 12) ** 2 < 81) G[y][x] = 1; if (x > 26 && x < 44 && y > 4 && y < 20) G[y][x] = 1; if (y > 26 && y < 44 && Math.abs(x - 14) < (y - 26) * 0.6) G[y][x] = 1; if ((x > 28 && x < 44 && y > 28 && y < 32) || (x > 34 && x < 38 && y > 28 && y < 46)) G[y][x] = 1; } return G; }
  function contour(G, lab, L) { const H = G.length, W = G[0].length; const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H && L[y][x] === lab); let sx = -1, sy = -1; for (let y = 0; y < H && sx < 0; y++) for (let x = 0; x < W; x++) if (at(x, y)) { sx = x; sy = y; break; } const D = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]]; const pts = [[sx, sy]], codes = []; let x = sx, y = sy, d = 7; for (let k = 0; k < 4000; k++) { let found = false; for (let i = 0; i < 8; i++) { const nd = (d + 6 + i) % 8 === 0 ? 0 : (d + 6 + i) % 8; const dd = (d + 6 + i) % 8; const X = x + D[dd][0], Y = y + D[dd][1]; if (at(X, Y)) { x = X; y = Y; d = dd; codes.push(dd); pts.push([x, y]); found = true; break; } } if (!found || (x === sx && y === sy)) break; } return { pts, codes }; }
  reg(['binary-chain-code', 'binary-diff-chain', 'region-chain-code', 'binary-perimeter', 'region-perimeter', 'binary-circularity', 'region-circularity', 'binary-euler'], '形状特徴：輪郭追跡・チェーンコード・周囲長・円形度', (el) => {
    const G = shapes(); const { n, L } = IP.label(G, 8); const m = 48; const rows = [];
    const cv = toCanvas(g2img(G, 60, 250), { size: 200 }); const ctx = cv.getContext('2d'); const cols = ['#e33', '#2a9d8f', '#e9a23b', '#3563e9'];
    for (let lab = 1; lab <= n; lab++) {
      const { pts, codes } = contour(G, lab, L); ctx.strokeStyle = cols[(lab - 1) % 4]; ctx.lineWidth = 0.6; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5))); ctx.stroke();
      let S = 0; L.forEach((r) => r.forEach((v) => v === lab && S++)); const per = codes.reduce((s, c) => s + (c % 2 ? Math.SQRT2 : 1), 0); const circ = (4 * Math.PI * S) / (per * per);
      let cx = 0, cy = 0; L.forEach((r, y) => r.forEach((v, x) => { if (v === lab) { cx += x; cy += y; } })); cx /= S; cy /= S; ctx.fillStyle = '#000'; ctx.fillRect(cx - 0.8, cy - 0.8, 1.6, 1.6);
      rows.push(`<tr><td style="color:${cols[(lab - 1) % 4]}">●</td><td>${S}</td><td>${per.toFixed(1)}</td><td><b>${circ.toFixed(2)}</b></td><td style="font-family:monospace;font-size:11px">${codes.slice(0, 14).join('')}…</td></tr>`);
    }
    el.appendChild(rowOf([fig(cv, '色線=輪郭追跡の結果、黒点=重心')]));
    el.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th></th><th>面積S</th><th>周囲長L</th><th>円形度</th><th>チェーンコード</th></tr>${rows.join('')}</table>`));
    el.appendChild(h('div', { className: 'figs' }, `<table class="gt"><tr><td>3</td><td>2</td><td>1</td></tr><tr><td>4</td><td style="background:#333;color:#fff">●</td><td>0</td></tr><tr><td>5</td><td>6</td><td>7</td></tr></table><div class="cap" style="align-self:center">8方向チェーンコード（0=右、反時計回り）</div>`));
    el.appendChild(note('<b>輪郭追跡</b>：境界画素を順にたどり、進んだ方向を0〜7の数字の列（<b>フリーマンのチェーンコード</b>）で記録する。周囲長は偶数コード（上下左右）を1、奇数コード（斜め）を√2として足す。<b>円形度 = 4πS/L²</b>：円で最大1、細長い・ギザギザな形ほど小さい（三角形やT字は小さい）。チェーンコードの隣り合う差（差分チェーンコード）は図形の回転に影響されない。'));
    el.appendChild(code(`import cv2, numpy as np
cnts, _ = cv2.findContours(B, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
for c in cnts:
    S = cv2.contourArea(c); L = cv2.arcLength(c, True)
    circ = 4*np.pi*S / L**2                  # 円形度
    M = cv2.moments(c); cx, cy = M['m10']/M['m00'], M['m01']/M['m00']   # 重心`));
  });
  reg(['binary-convex-hull', 'region-convex-hull', 'binary-skeleton', 'binary-mat', 'binary-hit-or-miss'], '凸包・骨格（中心軸）', (el) => {
    const G = shapes(); const m = 48; const pts = []; G.forEach((r, y) => r.forEach((v, x) => v && pts.push([x, y])));
    const Tset = pts.filter(([x, y]) => y > 26 && x > 26); const hull = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (const p of P.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
    const hl = hull(Tset); const cv = toCanvas(g2img(G, 60, 250), { size: 160 }), ctx = cv.getContext('2d'); ctx.strokeStyle = '#e33'; ctx.lineWidth = 0.8; ctx.beginPath(); hl.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5))); ctx.closePath(); ctx.stroke();
    // 骨格：距離変換の尾根
    const D = img(m, m); const bg = []; G.forEach((r, y) => r.forEach((v, x) => !v && bg.push([x, y]))); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) if (G[y][x]) { let b = 1e9; for (const [X, Y] of bg) b = Math.min(b, Math.max(Math.abs(X - x), Math.abs(Y - y))); D.d[y * m + x] = b; }
    const sk = img(m, m, 250); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { const v = D.d[y * m + x]; if (!v) continue; sk.d[y * m + x] = 200; let isMax = true; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (px(D, x + dx, y + dy) > v) isMax = false; if (isMax && v >= 2) sk.d[y * m + x] = 0; }
    el.appendChild(rowOf([fig(cv, '赤：T字の凸包'), fig(toCanvas(sk, { size: 160 }), '黒：中心軸（距離変換の極大）')]));
    el.appendChild(note('<b>凸包</b>：図形を全部含む最小の凸多角形（輪ゴムをかけた形）。凸包と図形の差（へこみ）は形状の特徴になる（凸性＝面積/凸包面積）。<b>中心軸変換（骨格）</b>：図形に内接する最大円の中心の集合。距離変換の尾根（極大）として求まり、各点の距離値（＝内接円の半径）を持てば元の図形を<b>完全に復元</b>できる。境界のわずかな凹凸で枝が出やすい。細線化は連結性を保った1画素幅の線で、似ているが同じではない。'));
    el.appendChild(code(`import cv2
hull = cv2.convexHull(contour)                  # 凸包
dist = cv2.distanceTransform(B, cv2.DIST_L2, 5)  # 中心軸 = dist の尾根
from skimage.morphology import medial_axis, skeletonize
skel, d = medial_axis(B, return_distance=True)`));
  });
  reg(['binary-moment', 'region-moment', 'region-central-moment', 'region-normalized-moment', 'region-hu-moments'], 'モーメント：重心と主軸の向き', (el) => {
    let ang = 30, el2 = 2.5; const n = 64, ui = h('div');
    el.appendChild(control('図形の回転', 0, 180, 5, ang, (v) => v + '°', (v) => { ang = v; draw(); })); el.appendChild(control('細長さ', 1, 4, 0.1, el2, (v) => v.toFixed(1), (v) => { el2 = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const G = Array.from({ length: n }, () => Array(n).fill(0)), t = (ang * Math.PI) / 180; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - 30) * Math.cos(t) - (32 - y) * Math.sin(t), v = (x - 30) * Math.sin(t) + (32 - y) * Math.cos(t); if ((u / (6 * el2)) ** 2 + (v / 6) ** 2 < 1 || (Math.abs(u - 6 * el2 + 2) < 3 && Math.abs(v) < 9)) G[y][x] = 1; }
      let m00 = 0, m10 = 0, m01 = 0; G.forEach((r, y) => r.forEach((v, x) => { if (v) { m00++; m10 += x; m01 += y; } })); const cx = m10 / m00, cy = m01 / m00; let mu20 = 0, mu02 = 0, mu11 = 0; G.forEach((r, y) => r.forEach((v, x) => { if (v) { mu20 += (x - cx) ** 2; mu02 += (y - cy) ** 2; mu11 += (x - cx) * (y - cy); } }));
      const th = 0.5 * Math.atan2(2 * mu11, mu20 - mu02); const eta20 = mu20 / m00 ** 2, eta02 = mu02 / m00 ** 2, eta11 = mu11 / m00 ** 2; const hu1 = eta20 + eta02, hu2 = (eta20 - eta02) ** 2 + 4 * eta11 ** 2;
      const cv = toCanvas(g2img(G, 60, 250), { size: 160 }), ctx = cv.getContext('2d'); ctx.strokeStyle = '#e33'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx - 30 * Math.cos(th), cy - 30 * Math.sin(th)); ctx.lineTo(cx + 30 * Math.cos(th), cy + 30 * Math.sin(th)); ctx.stroke(); ctx.fillStyle = '#2a9d8f'; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      ui.appendChild(rowOf([fig(cv, '緑=重心、赤=主軸')]));
      ui.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>m00(面積)</th><th>重心</th><th>主軸角</th><th>Hu φ1</th><th>Hu φ2</th></tr><tr><td>${m00}</td><td>(${cx.toFixed(1)}, ${cy.toFixed(1)})</td><td>${((-th * 180) / Math.PI).toFixed(0)}°</td><td><b>${hu1.toFixed(4)}</b></td><td><b>${hu2.toFixed(5)}</b></td></tr></table>`));
      ui.appendChild(note('<b>モーメント m_pq = Σ xᵖ yᵠ</b>。m00=面積、(m10/m00, m01/m00)=重心。重心まわりの<b>中心モーメント μ_pq</b> は平行移動に不変、さらに面積で割った<b>正規化中心モーメント η_pq</b> は拡大縮小にも不変。<b>主軸の向き θ = ½ atan(2μ11/(μ20−μ02))</b>。これらを組み合わせた<b>Hu のモーメント不変量</b>は回転にも不変：図形を回転させても φ1, φ2 がほぼ変わらないことを確認しよう（細長さを変えると変わる）。'));
    }
    draw();
    el.appendChild(code(`import cv2
M = cv2.moments(B, binaryImage=True)
cx, cy = M['m10']/M['m00'], M['m01']/M['m00']
theta = 0.5*np.arctan2(2*M['mu11'], M['mu20'] - M['mu02'])   # 主軸
hu = cv2.HuMoments(M)                                          # 7つの不変量`));
  });

  // ======================= 領域処理 =======================
  reg(['region-watershed'], 'ウォーターシェッド：水を満たして境界を作る', (el) => {
    const n = 64; let level = 120; const ui = h('div');
    const G = Array.from({ length: n }, () => Array(n).fill(0)); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - 22) ** 2 + (y - 32) ** 2 < 220 || (x - 42) ** 2 + (y - 30) ** 2 < 200) G[y][x] = 1;
    const D = img(n, n); const bg = []; G.forEach((r, y) => r.forEach((v, x) => !v && bg.push([x, y]))); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (G[y][x]) { let b = 1e9; for (const [X, Y] of bg) b = Math.min(b, Math.hypot(X - x, Y - y)); D.d[y * n + x] = b; }
    let mx = 0; D.d.forEach((v) => (mx = Math.max(mx, v))); const elev = IP.map(D, (v) => 255 - (v / mx) * 255);
    el.appendChild(control('水位', 0, 255, 5, level, null, (v) => { level = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const lab = new Int32Array(n * n); const order = [...Array(n * n).keys()].sort((a, b) => elev.d[a] - elev.d[b]); let nl = 0; const r = img(n, n), g = img(n, n), b = img(n, n); const cols = [[230, 57, 70], [42, 157, 143], [233, 196, 106], [69, 123, 157]];
      for (const i of order) { if (elev.d[i] > level) break; if (!G[(i / n) | 0][i % n]) continue; const x = i % n, y = (i / n) | 0; const nb = new Set(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < n && Y < n && lab[Y * n + X] > 0) nb.add(lab[Y * n + X]); } if (nb.size === 0) lab[i] = ++nl; else if (nb.size === 1) lab[i] = [...nb][0]; else lab[i] = -1; }
      for (let i = 0; i < n * n; i++) { const c = lab[i] > 0 ? cols[(lab[i] - 1) % 4] : lab[i] < 0 ? [0, 0, 0] : G[(i / n) | 0][i % n] ? [200, 200, 200] : [250, 250, 250]; r.d[i] = c[0]; g.d[i] = c[1]; b.d[i] = c[2]; }
      ui.appendChild(rowOf([fig(toCanvas(g2img(G), { size: 100 }), 'くっついた2つの円'), fig(toCanvas(elev, { size: 100 }), '地形（距離変換を反転）'), arrow(), fig(toCanvas({ r, g, b }, { size: 100 }), `水位 ${level}：色=盆地、黒=分水嶺`)]));
      ui.appendChild(note('画像の濃淡（ここでは距離変換を反転したもの）を<b>地形の高さ</b>と見なし、低い所（盆地の底）から水を満たしていく。水位を上げると盆地ごとに湖が広がり、<b>2つの湖がぶつかる所に堤防（分水嶺）</b>を築く → それが領域の境界線。くっついた粒子の分離によく使う。そのままだと小さな凹凸ごとに盆地ができて<b>過分割</b>しやすいので、マーカー（種）を与えて使う。水位を上げて、2つの円の間に境界ができる様子を見よう。'));
    }
    draw();
    el.appendChild(code(`import cv2, numpy as np
dist = cv2.distanceTransform(B, cv2.DIST_L2, 5)
_, fg = cv2.threshold(dist, 0.6*dist.max(), 255, 0)     # 確実な前景 = マーカー
n, markers = cv2.connectedComponents(fg.astype(np.uint8))
markers = markers + 1; markers[(B > 0) & (fg == 0)] = 0  # 未知領域 = 0
markers = cv2.watershed(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), markers)  # 境界 = -1`));
  });
  reg(['region-split-merge'], '分割統合法：四分木で分けてから併合', (el) => {
    let th = 25; const n = 64, src = IP.addGauss(scene(n), 5), ui = h('div'); el.appendChild(control('一様とみなす濃度幅', 5, 100, 5, th, null, (v) => { th = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const blocks = []; const rec = (x, y, s) => { let mn = 255, mx = 0, sum = 0; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const v = src.d[(y + j) * n + x + i]; mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; } if (mx - mn <= th || s <= 2) blocks.push([x, y, s, sum / (s * s)]); else { const hs = s / 2; rec(x, y, hs); rec(x + hs, y, hs); rec(x, y + hs, hs); rec(x + hs, y + hs, hs); } }; rec(0, 0, n);
      const out = img(n, n); blocks.forEach(([x, y, s, m]) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) out.d[(y + j) * n + x + i] = m; });
      const cv = toCanvas(out, { size: 140 }), ctx = cv.getContext('2d'); ctx.strokeStyle = '#e33'; ctx.lineWidth = 0.4; blocks.forEach(([x, y, s]) => ctx.strokeRect(x + 0.2, y + 0.2, s - 0.4, s - 0.4));
      ui.appendChild(rowOf([fig(toCanvas(src, { size: 110 }), '入力'), arrow(), fig(cv, `分割後 ${blocks.length} ブロック`)]));
      ui.appendChild(note('<b>分割</b>：画像全体から始め、ブロック内の濃度が一様でなければ<b>4つに分ける</b>（四分木）を繰り返す。一様な所は大きなブロック、境界付近は細かいブロックになる。<b>統合</b>：隣り合うブロックで性質が似ていれば1つの領域にまとめる（ここでは分割の段階まで表示）。しきい値を小さくすると細かく分かれる。'));
    }
    draw();
  });
  reg(['region-glcm', 'region-glcm-asm', 'region-glcm-entropy', 'region-glcm-contrast', 'region-glcm-correlation', 'region-glcm-homogeneity', 'region-run-length'], '同時生起行列：テクスチャを数値化', (el) => {
    let tex = 'stripe'; const ui = h('div'); el.appendChild(select('テクスチャ', [['stripe', '縦縞'], ['check', '市松'], ['noise', 'ランダム'], ['flat', 'ほぼ一様']], tex, (v) => { tex = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const n = 32, a = img(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v; if (tex === 'stripe') v = Math.floor(x / 2) % 4; else if (tex === 'check') v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 3 : 0; else if (tex === 'noise') v = Math.floor(Math.random() * 4); else v = Math.random() < 0.9 ? 1 : 2; a.d[y * n + x] = v; }
      const P = [0, 1, 2, 3].map(() => [0, 0, 0, 0]); let N = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n - 1; x++) { P[a.d[y * n + x]][a.d[y * n + x + 1]]++; N++; }
      let asm = 0, ent = 0, con = 0, hom = 0; P.forEach((r, i) => r.forEach((c, j) => { const p = c / N; asm += p * p; if (p) ent -= p * Math.log2(p); con += (i - j) ** 2 * p; hom += p / (1 + Math.abs(i - j)); }));
      ui.appendChild(rowOf([fig(toCanvas(IP.map(a, (v) => v * 80), { size: 100 }), '4階調のテクスチャ'), fig(h('div', {}, `<table class="gt">${P.map((r) => '<tr>' + r.map((c) => `<td style="background:rgba(53,99,233,${c / N * 2.5});width:34px">${c}</td>`).join('') + '</tr>').join('')}</table>`), 'P(i,j)：右隣が j である i の数')]));
      ui.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>エネルギー(ASM)</th><th>エントロピー</th><th>コントラスト</th><th>一様性</th></tr><tr><td>${asm.toFixed(3)}</td><td>${ent.toFixed(2)}</td><td>${con.toFixed(2)}</td><td>${hom.toFixed(3)}</td></tr></table>`));
      ui.appendChild(note('「濃度 i の画素の、ある変位（ここでは右隣）の画素が濃度 j」である組の数を数えた表が<b>同時生起行列</b>（Haralick）。そこから：<b>エネルギー（角二次モーメント）</b>=Σp²（一様・規則的だと大きい）、<b>エントロピー</b>=−Σp log p（乱雑だと大きい）、<b>コントラスト</b>=Σ(i−j)²p（隣同士の差が大きいと大きい）、<b>一様性</b>=Σp/(1+|i−j|)（対角線に集まると大きい）。テクスチャを切り替えて値の変化を確認しよう。'));
    }
    draw();
    el.appendChild(code(`from skimage.feature import graycomatrix, graycoprops
P = graycomatrix(img_q, distances=[1], angles=[0], levels=4, normed=True)
for prop in ['ASM', 'contrast', 'homogeneity', 'correlation']:
    print(prop, graycoprops(P, prop)[0, 0])
entropy = -(P[P > 0] * np.log2(P[P > 0])).sum()`));
  });
  reg(['region-fourier-descriptor'], 'フーリエ記述子：輪郭を少ない係数で表す', (el) => {
    let K = 4; const ui = h('div'); el.appendChild(control('使う係数の数（低周波から）', 1, 30, 1, K, null, (v) => { K = v; draw(); })); el.appendChild(ui);
    const N = 128, z = []; for (let i = 0; i < N; i++) { const t = (2 * Math.PI * i) / N, r = 40 + 12 * Math.cos(5 * t) + (i % 32 < 16 ? 0 : 0); z.push([r * Math.cos(t), r * Math.sin(t) * 0.8 + 6 * Math.sin(3 * t)]); }
    const Z = []; for (let k = 0; k < N; k++) { let re = 0, im = 0; for (let i = 0; i < N; i++) { const a = (-2 * Math.PI * k * i) / N; re += z[i][0] * Math.cos(a) - z[i][1] * Math.sin(a); im += z[i][0] * Math.sin(a) + z[i][1] * Math.cos(a); } Z.push([re / N, im / N]); }
    function draw() {
      ui.innerHTML = ''; const keep = new Set([0]); for (let k = 1; k <= K; k++) { keep.add(k); keep.add(N - k); }
      const rec = []; for (let i = 0; i < N; i++) { let x = 0, y = 0; for (const k of keep) { const a = (2 * Math.PI * k * i) / N; x += Z[k][0] * Math.cos(a) - Z[k][1] * Math.sin(a); y += Z[k][0] * Math.sin(a) + Z[k][1] * Math.cos(a); } rec.push([x, y]); }
      const P = (pts) => pts.map(([x, y]) => `${(100 + x).toFixed(1)},${(80 - y).toFixed(1)}`).join(' ');
      ui.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 200 160" width="240" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="160" fill="#fff"/><polygon points="${P(z)}" fill="none" stroke="#bbb" stroke-width="3"/><polygon points="${P(rec)}" fill="none" stroke="#e33" stroke-width="1.5"/><text x="4" y="12" font-size="10">灰=元の輪郭、赤=係数 ±${K} 個で復元</text></svg>`));
      ui.appendChild(note('輪郭上の点を複素数 z(i)=x+jy の列とみなして1次元フーリエ変換した係数が<b>フーリエ記述子</b>。低周波の係数は大まかな形、高周波は細かい凹凸を表す。少数の低周波係数だけで形をよく近似できる（星形の5つの突起は5番目の係数で現れる）。係数の大きさだけを使えば、回転・始点の選び方に不変、第1係数で割れば拡大縮小にも不変な形状特徴になる。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
z = contour[:, 0] + 1j*contour[:, 1]      # 輪郭点を複素数に
Z = np.fft.fft(z)
Zk = np.zeros_like(Z); K = 4
Zk[:K+1] = Z[:K+1]; Zk[-K:] = Z[-K:]      # 低周波だけ残す
approx = np.fft.ifft(Zk)
desc = np.abs(Z[1:]) / np.abs(Z[1])       # 回転・始点・スケール不変な記述子`));
  });
})();
