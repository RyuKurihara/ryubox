// 図解ラボ（追加2）：検出・認識・動画・3次元・符号化・システム・知財
'use strict';
(() => {
  const { V, H } = VIZ; const { h, img, px, clamp, toCanvas, jet, fig, rowOf, arrow, control, select, note, svgPlot, code, conv, gaussK, scene, colorScene, g2img } = H;
  const reg = (ids, title, run) => ids.forEach((id) => (V[id] = { title, run }));
  const randn = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return u - 3; };
  // SVG座標系の散布図ヘルパー（データ範囲 -1..1）
  const W = 280, X = (x) => W / 2 + x * 120, Y = (y) => 140 - y * 120;
  const svgOpen = (hh = 280) => `<svg viewBox="0 0 ${W} ${hh}" width="${W}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${hh}" fill="#fff"/>`;

  // ======================= 検出 =======================
  reg(['detect-integral-image', 'detect-haar-like'], '積分画像とHaar-like特徴', (el) => {
    const P = [[3, 1, 4, 1], [5, 9, 2, 6], [5, 3, 5, 8], [9, 7, 9, 3]]; const S = P.map((r) => r.slice());
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) S[y][x] = P[y][x] + (x ? S[y][x - 1] : 0) + (y ? S[y - 1][x] : 0) - (x && y ? S[y - 1][x - 1] : 0);
    const t = (M, hl) => `<table class="gt">${M.map((r, y) => '<tr>' + r.map((v, x) => `<td style="${hl && hl(x, y) ? 'background:' + hl(x, y) + ';color:#fff' : ''}">${v}</td>`).join('') + '</tr>').join('')}</table>`;
    const box = 2 + 4 + 6 + 3 + 5 + 8; // (x1..2,y1..2) 1-indexed? 右下2×2 → P[1][2..3]? 説明は下の式で
    const sum = S[3][3] - S[0][3] - S[3][1] + S[0][1];
    el.appendChild(h('div', { className: 'figs' }, `<div class="fig">${t(P, (x, y) => (x >= 2 && y >= 1 ? '#3563e9' : ''))}<div class="cap">画像（青枠の和を求めたい）</div></div><div class="fig">${t(S, (x, y) => ((x === 3 && y === 3) ? '#2a9d8f' : (x === 3 && y === 0) || (x === 1 && y === 3) ? '#e33' : (x === 1 && y === 0) ? '#e9a23b' : ''))}<div class="cap">積分画像 S（左上からの累積和）</div></div>`));
    el.appendChild(note(`積分画像 S(x,y) = 左上から (x,y) までの画素の総和。1回作っておけば、<b>どんな大きさの矩形の和も4回の参照で計算できる</b>：青枠の和 = <span style="color:#2a9d8f">S(右下)</span> − <span style="color:#e33">S(上の外)</span> − <span style="color:#e33">S(左の外)</span> + <span style="color:#e9a23b">S(左上の外)</span> = ${S[3][3]} − ${S[0][3]} − ${S[3][1]} + ${S[0][1]} = <b>${sum}</b>（直接足すと ${[1, 2, 3].reduce((a, y) => a + P[y][2] + P[y][3], 0)}）。`));
    const n = 64, a = scene(n), feats = [['縦エッジ型', (x, y) => (x < 6 ? 1 : -1)], ['横エッジ型', (x, y) => (y < 6 ? 1 : -1)], ['線型', (x, y) => (x >= 4 && x < 8 ? -2 : 1)]];
    el.appendChild(rowOf(feats.map(([nm, f]) => { const k = []; for (let y = 0; y < 12; y++) { k.push([]); for (let x = 0; x < 12; x++) k[y].push(f(x, y) / 144); } const kim = img(12, 12); k.flat().forEach((v, i) => (kim.d[i] = v > 0 ? 250 : 20)); const o = IP.map(conv(a, k, 1), (v) => clamp(128 + v * 3)); const d = h('div', { className: 'fig' }); d.appendChild(toCanvas(kim, { size: 36 })); d.appendChild(toCanvas(o, { size: 76 })); d.appendChild(h('div', { className: 'cap' }, nm)); return d; })));
    el.appendChild(note('<b>Haar-like特徴</b> = 白い矩形の画素和 − 黒い矩形の画素和。明暗のパターン（目は頬より暗い、鼻筋は両側より明るい等）を捉える。積分画像のおかげで、大きさによらず定数時間で計算できる → Viola–Jones の顔検出は何十万個もの特徴を AdaBoost で選び、カスケードで高速に判定した。'));
    el.appendChild(code(`import numpy as np
S = img.cumsum(0).cumsum(1)                         # 積分画像
S = np.pad(S, ((1,0),(1,0)))                        # 先頭に0の行・列
def box(x0, y0, x1, y1):                            # [x0,x1)×[y0,y1) の和
    return S[y1,x1] - S[y0,x1] - S[y1,x0] + S[y0,x0]
haar = box(x, y, x+w//2, y+h) - box(x+w//2, y, x+w, y+h)   # 左白・右黒`));
  });
  reg(['detect-ransac'], 'RANSAC：外れ値だらけの点から直線を当てる', (el) => {
    let outl = 40; const ui = h('div'); el.appendChild(control('外れ値の割合', 0, 70, 5, outl, (v) => v + '%', (v) => { outl = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const N = 60, pts = []; for (let i = 0; i < N; i++) { if (Math.random() * 100 < outl) pts.push([Math.random() * 2 - 1, Math.random() * 2 - 1, 0]); else { const x = Math.random() * 2 - 1; pts.push([x, 0.5 * x - 0.2 + randn() * 0.03, 1]); } }
      // 最小二乗
      const mx = pts.reduce((s, p) => s + p[0], 0) / N, my = pts.reduce((s, p) => s + p[1], 0) / N; let sxy = 0, sxx = 0; pts.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }); const a1 = sxy / sxx, b1 = my - a1 * mx;
      let best = { n: -1 }; for (let it = 0; it < 100; it++) { const p = pts[(Math.random() * N) | 0], q = pts[(Math.random() * N) | 0]; if (p === q || Math.abs(p[0] - q[0]) < 1e-3) continue; const a = (q[1] - p[1]) / (q[0] - p[0]), b = p[1] - a * p[0]; const inl = pts.filter(([x, y]) => Math.abs(y - (a * x + b)) / Math.hypot(1, a) < 0.06).length; if (inl > best.n) best = { n: inl, a, b, p, q }; }
      let g = svgOpen(); pts.forEach(([x, y]) => { const inl = Math.abs(y - (best.a * x + best.b)) / Math.hypot(1, best.a) < 0.06; g += `<circle cx="${X(x)}" cy="${Y(y)}" r="3" fill="${inl ? '#2a9d8f' : '#bbb'}"/>`; });
      const L = (a, b, c, d) => `<line x1="${X(-1.1)}" y1="${Y(-1.1 * a + b)}" x2="${X(1.1)}" y2="${Y(1.1 * a + b)}" stroke="${c}" stroke-width="2" ${d ? 'stroke-dasharray="5 3"' : ''}/>`;
      g += L(a1, b1, '#e33', 1) + L(best.a, best.b, '#2a9d8f'); g += `<circle cx="${X(best.p[0])}" cy="${Y(best.p[1])}" r="5" fill="none" stroke="#000"/><circle cx="${X(best.q[0])}" cy="${Y(best.q[1])}" r="5" fill="none" stroke="#000"/><text x="6" y="14" font-size="11" fill="#e33">赤破線：最小二乗（外れ値に引っ張られる）</text><text x="6" y="28" font-size="11" fill="#2a9d8f">緑：RANSAC（インライア ${best.n}点）</text></svg>`;
      ui.appendChild(h('div', { className: 'figs' }, g));
      ui.appendChild(note('①ランダムに<b>最小限の点</b>（直線なら2点、ホモグラフィなら4点）を選んでモデルを作る → ②そのモデルに近い点（インライア）の数を数える → ①②を何度も繰り返し、<b>インライアが最多</b>のモデルを採用（最後にインライアだけで最小二乗し直す）。外れ値が多くても頑健。必要な試行回数は、外れ値率と成功確率から N = log(1−p)/log(1−(1−ε)ˢ) で見積もる。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
best = (0, None)
for _ in range(n_iter):
    i, j = np.random.choice(len(P), 2, replace=False)        # 最小サンプル
    (x1, y1), (x2, y2) = P[i], P[j]
    a, b, c = y2 - y1, x1 - x2, x2*y1 - x1*y2                 # 直線 ax+by+c=0
    d = np.abs(a*P[:,0] + b*P[:,1] + c) / np.hypot(a, b)
    inl = d < th
    if inl.sum() > best[0]: best = (inl.sum(), inl)
# 最後に best のインライアで最小二乗。OpenCV: cv2.findHomography(src, dst, cv2.RANSAC, 3.0)`));
  });
  reg(['detect-scale-space', 'detect-dog', 'detect-sift', 'detect-sift-descriptor'], 'スケール空間とDoG：大きさの違う「点」を見つける（SIFT）', (el) => {
    const n = 72, a = img(n, n, 30); [[14, 16, 2], [40, 18, 4], [20, 50, 7], [54, 52, 10]].forEach(([cx, cy, r]) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) a.d[y * n + x] = 230; });
    const sig = [1, 1.6, 2.6, 4.1, 6.6, 10.5]; const Gs = sig.map((s) => conv(a, gaussK(s))); const Ds = []; for (let i = 0; i < sig.length - 1; i++) Ds.push(IP.map(Gs[i + 1], (v, j) => clamp(128 + (v - Gs[i].d[j]) * 1.6)));
    el.appendChild(rowOf(Gs.slice(0, 5).map((g, i) => fig(toCanvas(g, { size: 56 }), `σ=${sig[i]}`))));
    el.appendChild(rowOf(Ds.map((d, i) => fig(toCanvas(d, { size: 56 }), `DoG${i + 1}`))));
    const cv = toCanvas(a, { size: 160 }), ctx = cv.getContext('2d'); ctx.strokeStyle = '#e33'; ctx.lineWidth = 0.7;
    for (let i = 1; i < Ds.length - 1; i++) for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) { const v = Ds[i].d[y * n + x]; if (v > 118) continue; let ok = true; for (let k = -1; k <= 1 && ok; k++) for (let j = -1; j <= 1 && ok; j++) for (let ii = -1; ii <= 1; ii++) { if (!k && !j && !ii) continue; if (Ds[i + k].d[(y + j) * n + x + ii] <= v) { ok = false; break; } } if (ok) { ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, sig[i] * 1.6, 0, 7); ctx.stroke(); } }
    el.appendChild(rowOf([fig(cv, '検出した特徴点（円の大きさ=スケール）')]));
    el.appendChild(note('画像をσを変えたガウシアンで段階的にぼかした列（<b>スケール空間</b>）を作り、隣り合う段の差（<b>DoG</b>≈ラプラシアン・オブ・ガウシアン）を取る。DoG が<b>位置方向と、スケール方向の上下の段も含めた 26 近傍で極値</b>になる点を特徴点とする → 小さな円は小さいσ、大きな円は大きいσで反応し、<b>点の大きさ（スケール）も同時に分かる</b>。SIFT はさらに主方向を求めて回転をそろえ、周囲 4×4 ブロック × 8方向の勾配ヒストグラム＝<b>128次元</b>の記述子にする → 拡大縮小・回転・明るさ変化に強い。'));
    el.appendChild(code(`import cv2
sift = cv2.SIFT_create()
kp, des = sift.detectAndCompute(gray, None)   # kp: 位置・スケール・方向, des: N×128
# DoG の中身: G_i = GaussianBlur(img, sigma_i);  D_i = G_{i+1} - G_i
# 極値: D_i(x,y) が 3×3×3 の近傍（上下のスケールを含む26点）より大きい/小さい`));
  });
  reg(['detect-hog'], 'HOG特徴量：セルごとの勾配方向ヒストグラム', (el) => {
    const n = 64, a = scene(n), gx = conv(a, [[-1, 0, 1]], 1), gy = conv(a, [[-1], [0], [1]], 1), C = 8;
    let g = `<svg viewBox="0 0 256 256" width="256" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="256" fill="#111"/>`;
    for (let cy = 0; cy < n / C; cy++) for (let cx = 0; cx < n / C; cx++) { const hist = new Array(9).fill(0); for (let y = cy * C; y < cy * C + C; y++) for (let x = cx * C; x < cx * C + C; x++) { const i = y * n + x, m = Math.hypot(gx.d[i], gy.d[i]); let an = (Math.atan2(gy.d[i], gx.d[i]) * 180) / Math.PI; if (an < 0) an += 180; hist[Math.min(8, Math.floor(an / 20))] += m; } const mx = Math.max(...hist, 1); const ox = cx * 32 + 16, oy = cy * 32 + 16; hist.forEach((v, b) => { const t = ((b * 20 + 10 + 90) * Math.PI) / 180, l = (v / Math.max(mx, 400)) * 15; g += `<line x1="${ox - l * Math.cos(t)}" y1="${oy - l * Math.sin(t)}" x2="${ox + l * Math.cos(t)}" y2="${oy + l * Math.sin(t)}" stroke="#fff" stroke-width="1.5" opacity="${0.3 + 0.7 * v / mx}"/>`; }); }
    g += '</svg>';
    el.appendChild(rowOf([fig(toCanvas(a, { size: 120 }), '入力'), arrow(), fig(h('div', {}, g), '8×8セルごとの勾配方向（エッジの向きに線）')]));
    el.appendChild(note('①画素ごとに勾配の強さと向きを計算 → ②画像を <b>8×8画素のセル</b>に分け、セル内の勾配方向を<b>9方向（0〜180°を20°刻み）のヒストグラム</b>に強さで投票 → ③2×2セルの<b>ブロック</b>で正規化（明るさ・コントラストの変化に強くする）→ 全部つなげて特徴ベクトルに。物体の<b>輪郭の形</b>をおおまかに表すので、SVMと組み合わせた歩行者検出（Dalal–Triggs 2005）で有名。64×128窓なら 7×15ブロック×4セル×9 = 3780次元。'));
    el.appendChild(code(`from skimage.feature import hog
feat, vis = hog(gray, orientations=9, pixels_per_cell=(8, 8),
                cells_per_block=(2, 2), block_norm='L2-Hys', visualize=True)
# OpenCV: cv2.HOGDescriptor((64,128), (16,16), (8,8), (8,8), 9).compute(gray)`));
  });
  reg(['detect-lbp', 'detect-fast'], 'LBP と FAST：周囲の画素と比べる特徴', (el) => {
    const P = [[52, 60, 61], [49, 55, 70], [40, 41, 68]]; const c = P[1][1]; const ord = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]]; const bits = ord.map(([y, x]) => (P[y][x] >= c ? 1 : 0)); const val = bits.reduce((s, b, i) => s + b * 2 ** (7 - i), 0);
    el.appendChild(h('div', { className: 'figs' }, `<div class="fig"><table class="gt">${P.map((r, y) => '<tr>' + r.map((v, x) => `<td style="${y === 1 && x === 1 ? 'background:#3563e9;color:#fff' : ''}">${v}</td>`).join('') + '</tr>').join('')}</table><div class="cap">3×3 画素</div></div><div class="fig"><table class="gt">${[0, 1, 2].map((y) => '<tr>' + [0, 1, 2].map((x) => { if (y === 1 && x === 1) return '<td>–</td>'; const k = ord.findIndex(([yy, xx]) => yy === y && xx === x); return `<td style="background:${bits[k] ? '#222' : '#fff'};color:${bits[k] ? '#fff' : '#000'}">${bits[k]}</td>`; }).join('') + '</tr>').join('')}</table><div class="cap">中心(55)以上なら1</div></div>`));
    el.appendChild(note(`<b>LBP</b>：中心画素と8近傍を比べ、大きければ1・小さければ0として左上から時計回りに並べる → <b>${bits.join('')}₂ = ${val}</b>。この値の局所ヒストグラムがテクスチャ特徴になる。<b>大小関係だけ</b>を使うので明るさの一様な変化に強い。顔認識などで使われる。`));
    const n = 64, a = scene(n), cv = toCanvas(a, { size: 160 }), ctx = cv.getContext('2d'); ctx.fillStyle = '#e33'; const circ = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];
    for (let y = 3; y < n - 3; y++) for (let x = 3; x < n - 3; x++) { const c0 = a.d[y * n + x], t = 30; const s = circ.map(([dx, dy]) => { const v = a.d[(y + dy) * n + x + dx]; return v > c0 + t ? 1 : v < c0 - t ? -1 : 0; }); let best = 0; for (const sgn of [1, -1]) { let run = 0; for (let i = 0; i < 32; i++) { if (s[i % 16] === sgn) { run++; best = Math.max(best, run); } else run = 0; } } if (best >= 9) ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4); }
    el.appendChild(rowOf([fig(cv, 'FAST で検出したコーナー（赤）')]));
    el.appendChild(note('<b>FAST</b>：注目画素のまわりの<b>半径3の円周上16画素</b>を見て、中心よりしきい値以上明るい（または暗い）画素が<b>連続して9個（または12個）以上</b>あればコーナーとする。比較だけなので非常に高速（ORB でも使われる）。'));
    el.appendChild(code(`from skimage.feature import local_binary_pattern
lbp = local_binary_pattern(gray, P=8, R=1)       # LBP 画像
hist = np.histogram(lbp, bins=256)[0]
import cv2
kps = cv2.FastFeatureDetector_create(threshold=30).detect(gray)   # FAST`));
  });
  reg(['detect-nms', 'recog-nms', 'recog-iou'], 'IoU と NMS（非最大値抑制）', (el) => {
    let th = 0.5; const ui = h('div'); el.appendChild(control('NMS の IoU しきい値', 0.1, 0.9, 0.05, th, (v) => v.toFixed(2), (v) => { th = v; draw(); })); el.appendChild(ui);
    const boxes = [[40, 40, 90, 110, 0.92], [48, 46, 96, 118, 0.85], [34, 36, 84, 104, 0.70], [150, 60, 210, 140, 0.88], [158, 70, 214, 146, 0.60], [100, 150, 140, 200, 0.40]];
    const iou = (a, b) => { const iw = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), ih = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), I = iw * ih; return I / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - I); };
    function draw() {
      ui.innerHTML = ''; const order = boxes.map((b, i) => i).sort((a, b) => boxes[b][4] - boxes[a][4]); const keep = [], sup = new Set(); for (const i of order) { if (sup.has(i)) continue; keep.push(i); for (const j of order) if (j !== i && !sup.has(j) && !keep.includes(j) && iou(boxes[i], boxes[j]) > th) sup.add(j); }
      let g = svgOpen(220); boxes.forEach((b, i) => { const k = keep.includes(i); g += `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="none" stroke="${k ? '#2a9d8f' : '#e33'}" stroke-width="${k ? 3 : 1}" ${k ? '' : 'stroke-dasharray="4 3"'}/><text x="${b[0] + 2}" y="${b[1] + 12}" font-size="10" fill="${k ? '#2a9d8f' : '#e33'}">${b[4]}</text>`; }); g += '</svg>';
      ui.appendChild(h('div', { className: 'figs' }, g));
      const a = boxes[0], b = boxes[1]; ui.appendChild(note(`<b>IoU</b> = 共通部分の面積 ÷ 和集合の面積（0〜1）。例：0.92と0.85の箱の IoU = ${iou(a, b).toFixed(2)}。<b>NMS</b>：検出器は1つの物体の周りに多数の箱を出すので、スコアの高い順に箱を採用し、採用した箱と <b>IoU がしきい値を超える箱を捨てる</b>。緑=残った箱、赤破線=抑制された箱。しきい値を下げると、近い別物体まで消える。物体検出の評価では「予測と正解の IoU ≥ 0.5 なら正解」などとし、これを使って mAP を計算する。`));
    }
    draw();
    el.appendChild(code(`def iou(a, b):
    iw = max(0, min(a[2], b[2]) - max(a[0], b[0])); ih = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    I = iw * ih; return I / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - I)
def nms(boxes, scores, th=0.5):
    order = sorted(range(len(boxes)), key=lambda i: -scores[i]); keep = []
    while order:
        i = order.pop(0); keep.append(i)
        order = [j for j in order if iou(boxes[i], boxes[j]) <= th]
    return keep           # torchvision.ops.nms(boxes, scores, th)`));
  });

  // ======================= 認識 =======================
  function twoClass(n = 50, sep = 0.5, sp = 0.28) { const P = []; for (let i = 0; i < n; i++) { P.push([-sep + randn() * sp, -0.1 + randn() * sp, 0]); P.push([sep + randn() * sp, 0.15 + randn() * sp, 1]); } return P; }
  reg(['recog-nn', 'recog-knn'], 'k-NN法：近くの k 個の多数決', (el) => {
    let k = 1; const P = twoClass(30, 0.35, 0.35); const ui = h('div'); el.appendChild(control('k', 1, 25, 2, k, null, (v) => { k = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const G = 48, cv = img(G, G), r = img(G, G), g = img(G, G), b = img(G, G);
      for (let yy = 0; yy < G; yy++) for (let xx = 0; xx < G; xx++) { const x = (xx / G) * 2.3 - 1.15, y = 1.15 - (yy / G) * 2.3; const d = P.map((p) => [(p[0] - x) ** 2 + (p[1] - y) ** 2, p[2]]).sort((a, b) => a[0] - b[0]).slice(0, k); const c = d.reduce((s, q) => s + q[1], 0) / k; const i = yy * G + xx; r.d[i] = 255 - c * 60 - (1 - c) * 10; g.d[i] = 235 - Math.abs(c - 0.5) * 40; b.d[i] = 200 + (1 - c) * 55 - c * 60; }
      const can = toCanvas({ r, g, b }, { size: 260 }); const ctx = can.getContext('2d'); P.forEach(([x, y, c]) => { ctx.fillStyle = c ? '#c22' : '#2250c8'; ctx.fillRect(((x + 1.15) / 2.3) * G - 0.6, ((1.15 - y) / 2.3) * G - 0.6, 1.2, 1.2); });
      ui.appendChild(rowOf([fig(can, `k=${k} の決定領域（背景色＝そこに点を置いたら判定されるクラス）`)]));
      ui.appendChild(note('未知のデータに<b>最も近い学習データ k 個</b>のラベルで多数決する。学習は「全データを覚えるだけ」。<b>k=1（最近傍法）</b>は境界がギザギザで、外れ値の周りに小さな島ができる（<b>過学習</b>ぎみ）。k を大きくすると境界がなめらかになるが、大きすぎると少数派の領域がつぶれる。距離の計算は特徴の<b>尺度をそろえて</b>から行う必要がある。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
def knn_predict(Xtr, ytr, x, k=5):
    d = np.linalg.norm(Xtr - x, axis=1)          # 全学習データとの距離
    idx = np.argsort(d)[:k]                      # 近い k 個
    return np.bincount(ytr[idx]).argmax()        # 多数決
# sklearn: KNeighborsClassifier(n_neighbors=5).fit(Xtr, ytr).predict(X)`));
  });
  reg(['recog-svm', 'recog-support-vector', 'recog-perceptron'], '線形識別：パーセプトロンとSVM（マージン最大化）', (el) => {
    const P = twoClass(25, 0.55, 0.2); let w = [0, 0], b0 = 0;
    for (let ep = 0; ep < 50; ep++) for (const [x, y, c] of P) { const t = c ? 1 : -1; if (t * (w[0] * x + w[1] * y + b0) <= 0) { w = [w[0] + 0.1 * t * x, w[1] + 0.1 * t * y]; b0 += 0.1 * t; } }
    // 簡易SVM: 劣勾配法でヒンジ損失 + λ|w|^2
    let sw = [0, 0], sb = 0; for (let it = 1; it <= 3000; it++) { const lr = 1 / (0.01 * it + 10); let g0 = 0.002 * sw[0], g1 = 0.002 * sw[1], gb = 0; for (const [x, y, c] of P) { const t = c ? 1 : -1; if (t * (sw[0] * x + sw[1] * y + sb) < 1) { g0 -= t * x / P.length; g1 -= t * y / P.length; gb -= t / P.length; } } sw = [sw[0] - lr * g0 * 20, sw[1] - lr * g1 * 20]; sb -= lr * gb * 20; }
    const line = (w, b, off, col, dash) => { const ys = (x) => -(w[0] * x + b - off) / w[1]; return `<line x1="${X(-1.2)}" y1="${Y(ys(-1.2))}" x2="${X(1.2)}" y2="${Y(ys(1.2))}" stroke="${col}" stroke-width="${dash ? 1 : 2.5}" ${dash ? 'stroke-dasharray="4 3"' : ''}/>`; };
    let g = svgOpen(); P.forEach(([x, y, c]) => { const m = (c ? 1 : -1) * (sw[0] * x + sw[1] * y + sb); g += `<circle cx="${X(x)}" cy="${Y(y)}" r="${m < 1.05 ? 5 : 3}" fill="${c ? '#e33' : '#3563e9'}" ${m < 1.05 ? 'stroke="#000" stroke-width="1.5"' : ''}/>`; });
    g += line(w, b0, 0, '#bbb') + line(sw, sb, 0, '#2a9d8f') + line(sw, sb, 1, '#2a9d8f', 1) + line(sw, sb, -1, '#2a9d8f', 1) + `<text x="6" y="14" font-size="11" fill="#999">灰：パーセプトロン（分けられれば終わり）</text><text x="6" y="28" font-size="11" fill="#2a9d8f">緑：SVM、破線＝マージン、黒縁＝サポートベクトル</text></svg>`;
    el.appendChild(h('div', { className: 'figs' }, g));
    el.appendChild(note('<b>パーセプトロン</b>（Rosenblatt 1958）：誤分類した点に向けて重みを少しずつ動かす。線形分離可能なら必ず収束するが、<b>分けられる直線ならどれでもよい</b>ので境界がクラスぎりぎりになりやすい。<b>SVM</b>：両クラスの最も近い点（<b>サポートベクトル</b>）までの距離＝<b>マージンが最大</b>になる境界を選ぶ → 未知データへの汎化性能が高い。境界はサポートベクトルだけで決まる。分離できない場合はソフトマージン、非線形境界は<b>カーネルトリック</b>で高次元に写して分ける。'));
    el.appendChild(code(`from sklearn.svm import SVC
clf = SVC(kernel='linear', C=1.0).fit(X, y)     # kernel='rbf' で非線形
print(clf.support_vectors_)                       # サポートベクトル
# パーセプトロンの更新: if t*(w@x+b) <= 0: w += lr*t*x; b += lr*t`));
  });
  reg(['recog-pca'], '主成分分析：ばらつき最大の方向に軸を取り直す', (el) => {
    const P = []; for (let i = 0; i < 120; i++) { const t = randn() * 0.5, s = randn() * 0.12; P.push([t * 0.85 - s * 0.5, t * 0.5 + s * 0.85]); }
    const mx = P.reduce((s, p) => s + p[0], 0) / P.length, my = P.reduce((s, p) => s + p[1], 0) / P.length; let a = 0, b = 0, c = 0; P.forEach(([x, y]) => { a += (x - mx) ** 2; b += (x - mx) * (y - my); c += (y - my) ** 2; }); a /= P.length; b /= P.length; c /= P.length;
    const tr = a + c, det = a * c - b * b, l1 = tr / 2 + Math.sqrt(tr * tr / 4 - det), l2 = tr / 2 - Math.sqrt(tr * tr / 4 - det); const v1 = [b, l1 - a], n1 = Math.hypot(...v1); const e1 = [v1[0] / n1, v1[1] / n1], e2 = [-e1[1], e1[0]];
    let g = svgOpen(); P.forEach(([x, y]) => (g += `<circle cx="${X(x)}" cy="${Y(y)}" r="2.5" fill="#3563e9" opacity=".6"/>`));
    const ar = (e, l, col, t) => `<line x1="${X(mx)}" y1="${Y(my)}" x2="${X(mx + e[0] * Math.sqrt(l) * 2)}" y2="${Y(my + e[1] * Math.sqrt(l) * 2)}" stroke="${col}" stroke-width="3"/><text x="${X(mx + e[0] * Math.sqrt(l) * 2.2)}" y="${Y(my + e[1] * Math.sqrt(l) * 2.2)}" font-size="11" fill="${col}">${t}</text>`;
    g += ar(e1, l1, '#e33', '第1主成分') + ar(e2, l2, '#2a9d8f', '第2') + '</svg>';
    el.appendChild(h('div', { className: 'figs' }, g));
    el.appendChild(note(`データの<b>共分散行列の固有ベクトル</b>が主成分の方向、固有値がその方向の分散。第1主成分＝ばらつきが最大の方向、第2はそれと直交する方向。<b>寄与率</b> = 固有値 ÷ 固有値の合計：第1主成分 ${(l1 / (l1 + l2) * 100).toFixed(1)}%、第2 ${(l2 / (l1 + l2) * 100).toFixed(1)}%。寄与率の小さい軸を捨てれば、情報をあまり失わずに<b>次元を減らせる</b>（2次元→1次元）。顔画像に使うと「固有顔」。教師なし（クラスは見ない）。`));
    el.appendChild(code(`import numpy as np
Xc = X - X.mean(0)                          # 中心化
C = Xc.T @ Xc / len(X)                      # 共分散行列
lam, E = np.linalg.eigh(C)                  # 固有値（昇順）・固有ベクトル
order = lam.argsort()[::-1]; lam, E = lam[order], E[:, order]
ratio = lam / lam.sum()                     # 寄与率
Z = Xc @ E[:, :k]                           # k 次元に射影`));
  });
  reg(['recog-confusion-matrix', 'recog-precision-recall', 'recog-f-measure', 'recog-roc-auc'], 'しきい値で変わる混同行列・適合率・再現率・ROC曲線', (el) => {
    const N = 200, S = []; for (let i = 0; i < N; i++) { const pos = i < N / 2; S.push([pos ? 0.62 + randn() * 0.15 : 0.38 + randn() * 0.15, pos]); }
    let th = 0.5; const ui = h('div'); el.appendChild(control('判定しきい値（スコアがこれ以上なら陽性）', 0, 1, 0.02, th, (v) => v.toFixed(2), (v) => { th = v; draw(); })); el.appendChild(ui);
    const roc = []; for (let t = 1.2; t >= -0.2; t -= 0.02) { let tp = 0, fp = 0; S.forEach(([s, p]) => { if (s >= t) p ? tp++ : fp++; }); roc.push([fp / (N / 2), tp / (N / 2)]); } let auc = 0; for (let i = 1; i < roc.length; i++) auc += (roc[i][0] - roc[i - 1][0]) * (roc[i][1] + roc[i - 1][1]) / 2;
    function draw() {
      ui.innerHTML = ''; let TP = 0, FP = 0, FN = 0, TN = 0; S.forEach(([s, p]) => { if (s >= th) p ? TP++ : FP++; else p ? FN++ : TN++; }); const P = TP / (TP + FP || 1), R = TP / (TP + FN || 1), F = (2 * P * R) / (P + R || 1);
      const hp = [], hn = []; for (let b = 0; b < 25; b++) { const lo = b / 25, hi = (b + 1) / 25; hp.push([lo, S.filter(([s, p]) => p && s >= lo && s < hi).length]); hn.push([lo, S.filter(([s, p]) => !p && s >= lo && s < hi).length]); }
      ui.appendChild(svgPlot([{ pts: hn, color: '#3563e9' }, { pts: hp, color: '#e33' }], { w: 280, h: 110, x0: 0, x1: 1, marks: [{ x: th, label: 'しきい値', color: '#000' }], xl: 'スコア（青=実際は陰性、赤=実際は陽性）' }));
      ui.appendChild(h('div', { className: 'figs' }, `<table class="tb"><tr><th></th><th>予測:陽性</th><th>予測:陰性</th></tr><tr><th>実際:陽性</th><td style="background:#e3f6ec">TP ${TP}</td><td>FN ${FN}</td></tr><tr><th>実際:陰性</th><td>FP ${FP}</td><td style="background:#e3f6ec">TN ${TN}</td></tr></table>`));
      const fpr = FP / (N / 2), tpr = TP / (N / 2);
      ui.appendChild(rowOf([fig(svgPlot([{ pts: [[0, 0], [1, 1]], color: '#ccc', dash: 1, w: 1 }, { pts: roc, color: '#e33' }, { pts: [[fpr, tpr], [fpr + 0.001, tpr]], color: '#000', w: 8 }], { w: 150, h: 150, x0: 0, x1: 1, y0: 0, y1: 1, xl: 'FPR', yl: 'TPR' }), `ROC曲線（AUC=${auc.toFixed(2)}）`), h('div', { className: 'explain' }, `適合率 = TP/(TP+FP) = <b>${P.toFixed(2)}</b><br>再現率 = TP/(TP+FN) = <b>${R.toFixed(2)}</b><br>F値 = 2PR/(P+R) = <b>${F.toFixed(2)}</b><br>正解率 = ${((TP + TN) / N).toFixed(2)}`)]));
      ui.appendChild(note('しきい値を<b>上げる</b>と「陽性」と言うのに慎重になり、<b>適合率↑・再現率↓</b>（見逃しが増える）。下げると逆。両者は<b>トレードオフ</b>なので F値（調和平均）でまとめる。<b>ROC曲線</b>はしきい値を動かしたときの（偽陽性率, 真陽性率）の軌跡で、左上に近いほど良い。曲線の下の面積 <b>AUC</b>（ランダムで0.5、完全で1）はしきい値によらない性能指標。'));
    }
    draw();
    el.appendChild(code(`from sklearn.metrics import confusion_matrix, precision_score, recall_score, f1_score, roc_curve, auc
pred = (score >= th).astype(int)
tn, fp, fn, tp = confusion_matrix(y, pred).ravel()
fpr, tpr, _ = roc_curve(y, score); print(auc(fpr, tpr))`));
  });
  reg(['recog-overfitting', 'recog-decision-tree'], '過学習：モデルを複雑にしすぎると', (el) => {
    let deg = 3; const tr = [], te = []; const f = (x) => Math.sin(2.5 * x); for (let i = 0; i < 12; i++) { const x = -1 + (2 * i) / 11 + (Math.random() - 0.5) * 0.08; tr.push([x, f(x) + randn() * 0.18]); } for (let i = 0; i < 40; i++) { const x = Math.random() * 2 - 1; te.push([x, f(x) + randn() * 0.18]); }
    const ui = h('div'); el.appendChild(control('多項式の次数（モデルの複雑さ）', 1, 11, 1, deg, null, (v) => { deg = v; draw(); })); el.appendChild(ui);
    const fit = (d) => { const A = tr.map(([x]) => Array.from({ length: d + 1 }, (_, k) => x ** k)), yv = tr.map((p) => p[1]); const AtA = Array.from({ length: d + 1 }, (_, i) => Array.from({ length: d + 1 }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? 1e-9 : 0))), Aty = Array.from({ length: d + 1 }, (_, i) => A.reduce((s, r, k) => s + r[i] * yv[k], 0)); return H.solve(AtA, Aty); };
    const ev = (c, x) => c.reduce((s, ck, k) => s + ck * x ** k, 0); const mse = (c, D) => D.reduce((s, [x, y]) => s + (ev(c, x) - y) ** 2, 0) / D.length;
    const curve = []; for (let d = 1; d <= 11; d++) { const c = fit(d); curve.push([d, Math.min(1, mse(c, tr)), Math.min(1, mse(c, te))]); }
    function draw() {
      ui.innerHTML = ''; const c = fit(deg); const pts = []; for (let x = -1; x <= 1.001; x += 0.02) pts.push([x, Math.max(-2, Math.min(2, ev(c, x)))]);
      let g = svgOpen(220); const Y2 = (y) => 110 - y * 50; g += `<polyline fill="none" stroke="#ccc" stroke-width="2" points="${pts.map(([x]) => X(x) + ',' + Y2(f(x))).join(' ')}"/><polyline fill="none" stroke="#e33" stroke-width="2" points="${pts.map(([x, y]) => X(x) + ',' + Y2(y)).join(' ')}"/>`; te.forEach(([x, y]) => (g += `<circle cx="${X(x)}" cy="${Y2(y)}" r="2" fill="#2a9d8f" opacity=".6"/>`)); tr.forEach(([x, y]) => (g += `<circle cx="${X(x)}" cy="${Y2(y)}" r="4" fill="#3563e9"/>`)); g += `<text x="6" y="14" font-size="10">青=学習データ、緑=テストデータ、赤=学習したモデル、灰=真の関数</text></svg>`;
      ui.appendChild(h('div', { className: 'figs' }, g));
      ui.appendChild(svgPlot([{ pts: curve.map((p) => [p[0], p[1]]), color: '#3563e9' }, { pts: curve.map((p) => [p[0], p[2]]), color: '#2a9d8f' }], { w: 280, h: 110, x0: 1, x1: 11, y0: 0, y1: 1, marks: [{ x: deg, label: '今', color: '#e33' }], xl: '次数（青=学習誤差、緑=テスト誤差）' }));
      ui.appendChild(note('モデルを複雑にするほど<b>学習データへの誤差は下がり続ける</b>が、ある所から<b>未知データ（テスト）の誤差は逆に上がる</b>。学習データのノイズまで覚えてしまう状態が<b>過学習</b>。単純すぎて傾向をつかめないのが<b>未学習</b>。対策：データを増やす、正則化、早期終了、ドロップアウト、データ拡張、交差検証でモデルを選ぶ。決定木も深くしすぎると同じことが起きる。'));
    }
    draw();
  });
  reg(['recog-activation', 'recog-sigmoid', 'recog-relu', 'recog-softmax', 'recog-cross-entropy'], '活性化関数・ソフトマックス・交差エントロピー', (el) => {
    const xs = []; for (let x = -5; x <= 5.001; x += 0.1) xs.push(x);
    el.appendChild(svgPlot([{ pts: xs.map((x) => [x, 1 / (1 + Math.exp(-x))]), color: '#3563e9' }, { pts: xs.map((x) => [x, Math.tanh(x)]), color: '#2a9d8f' }, { pts: xs.map((x) => [x, Math.max(0, x) / 3]), color: '#e33' }], { w: 280, h: 140, x0: -5, x1: 5, y0: -1.1, y1: 1.7, xl: '青:シグモイド 緑:tanh 赤:ReLU(1/3倍表示)' }));
    el.appendChild(note('<b>シグモイド</b> 1/(1+e⁻ˣ)：0〜1。両端で傾きがほぼ0 → 層を重ねると勾配が消える（<b>勾配消失</b>）。<b>tanh</b>：−1〜1。<b>ReLU</b> max(0,x)：正の側の傾きが常に1で勾配が消えにくく、計算も軽い → 深層学習の標準。'));
    let z = [2, 1, 0.1], T = 1; const ui = h('div'); el.appendChild(control('ロジット z₁（クラス1の出力）', -3, 5, 0.1, z[0], (v) => v.toFixed(1), (v) => { z[0] = v; draw(); })); el.appendChild(control('温度 T', 0.2, 5, 0.1, T, (v) => v.toFixed(1), (v) => { T = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const e = z.map((v) => Math.exp(v / T)), s = e.reduce((a, b) => a + b), p = e.map((v) => v / s); const ce = -Math.log(p[0]);
      ui.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 260 110" width="260" xmlns="http://www.w3.org/2000/svg"><rect width="260" height="110" fill="#fff"/>${p.map((v, i) => `<rect x="${30 + i * 75}" y="${90 - v * 80}" width="50" height="${v * 80}" fill="${i ? '#99a' : '#2a9d8f'}"/><text x="${55 + i * 75}" y="${86 - v * 80}" font-size="11" text-anchor="middle">${v.toFixed(2)}</text><text x="${55 + i * 75}" y="104" font-size="10" text-anchor="middle">クラス${i + 1}（z=${z[i].toFixed(1)}）</text>`).join('')}</svg>`));
      ui.appendChild(note(`<b>ソフトマックス</b> pᵢ = e^(zᵢ/T) / Σe^(zⱼ/T)：出力を合計1の確率に変換する。正解がクラス1なら<b>交差エントロピー誤差</b> = −log p₁ = <b>${ce.toFixed(3)}</b>（正解の確率が1に近いほど0に近い、低いと急に大きくなる）。温度 T を上げると分布が平らに、下げると最大のものに集中する。`));
    }
    draw();
    el.appendChild(code(`import numpy as np
sigmoid = lambda x: 1/(1+np.exp(-x)); relu = lambda x: np.maximum(0, x)
def softmax(z): e = np.exp(z - z.max()); return e / e.sum()    # 最大値を引いて桁あふれ防止
p = softmax(np.array([2.0, 1.0, 0.1]))
loss = -np.log(p[label])                                         # 交差エントロピー`));
  });
  reg(['recog-sgd', 'recog-learning-rate'], '勾配降下法と学習率', (el) => {
    let lr = 0.1; const ui = h('div'); el.appendChild(control('学習率 η', 0.01, 1.05, 0.01, lr, (v) => v.toFixed(2), (v) => { lr = v; draw(); })); el.appendChild(ui);
    const f = (x, y) => 0.5 * x * x + 2 * y * y, gr = (x, y) => [x, 4 * y];
    function draw() {
      ui.innerHTML = ''; let p = [-1.8, 0.9]; const path = [p.slice()]; for (let i = 0; i < 25; i++) { const g = gr(...p); p = [p[0] - lr * g[0], p[1] - lr * g[1]]; path.push(p.slice()); if (Math.abs(p[0]) > 5 || Math.abs(p[1]) > 5) break; }
      let g = svgOpen(220); const Xs = (x) => 140 + x * 60, Ys = (y) => 110 - y * 60; for (const lv of [0.05, 0.2, 0.5, 1, 1.8, 3]) g += `<ellipse cx="140" cy="110" rx="${Math.sqrt(2 * lv) * 60}" ry="${Math.sqrt(lv / 2) * 60}" fill="none" stroke="#ddd"/>`;
      g += `<polyline fill="none" stroke="#e33" stroke-width="1.5" points="${path.map(([x, y]) => Xs(Math.max(-2.3, Math.min(2.3, x))) + ',' + Ys(Math.max(-1.8, Math.min(1.8, y)))).join(' ')}"/>${path.map(([x, y]) => `<circle cx="${Xs(Math.max(-2.3, Math.min(2.3, x)))}" cy="${Ys(Math.max(-1.8, Math.min(1.8, y)))}" r="2" fill="#e33"/>`).join('')}<circle cx="140" cy="110" r="3" fill="#2a9d8f"/></svg>`;
      ui.appendChild(h('div', { className: 'figs' }, g)); const last = path[path.length - 1];
      ui.appendChild(note(`損失関数の等高線（中心が最小）。<b>w ← w − η ∇L</b>（勾配の逆向きに少し進む）を繰り返す。25歩後の損失 ${f(...last).toFixed(4)}。<b>学習率が小さい</b>となかなか進まない、<b>大きすぎる</b>と谷を飛び越えて振動・発散する（η を 0.5 以上にして確認）。<b>SGD</b>はデータの一部（ミニバッチ）で勾配を近似して更新するので計算が速く、ノイズが局所解からの脱出にも役立つ。Adam などは勾配の履歴で学習率をパラメータごとに自動調整する。`));
    }
    draw();
    el.appendChild(code(`import torch
opt = torch.optim.SGD(model.parameters(), lr=0.1, momentum=0.9)   # Adam: torch.optim.Adam(..., lr=1e-3)
for x, y in loader:                      # ミニバッチ
    loss = loss_fn(model(x), y)
    opt.zero_grad(); loss.backward(); opt.step()   # w ← w − lr * grad`));
  });
  reg(['recog-mlp'], '多層パーセプトロン：XORを分ける', (el) => {
    el.appendChild(h('div', { className: 'figs' }, `${svgOpen(200)}<g font-size="11">${[[60, 50, 0], [160, 50, 1], [60, 150, 1], [160, 150, 0]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="10" fill="${c ? '#e33' : '#3563e9'}"/><text x="${x - 14}" y="${y + 26}">(${x > 100 ? 1 : 0},${y > 100 ? 0 : 1})</text>`).join('')}<line x1="20" y1="120" x2="120" y2="20" stroke="#2a9d8f" stroke-width="2"/><line x1="100" y1="180" x2="200" y2="80" stroke="#2a9d8f" stroke-width="2"/><text x="200" y="30">XOR：赤=1、青=0</text><text x="200" y="46">1本の直線では分けられない</text><text x="200" y="62" fill="#2a9d8f">隠れ層で2本の直線を</text><text x="200" y="78" fill="#2a9d8f">組み合わせれば分けられる</text></g></svg>`));
    el.appendChild(note('単層パーセプトロンは直線（超平面）1本の境界しか作れないので、XOR のような問題は解けない（1969年 Minsky–Papert の指摘）。<b>隠れ層</b>を持ち非線形な活性化関数を使う多層パーセプトロンは、複数の直線を組み合わせて曲がった境界を作れる。学習は<b>誤差逆伝播法</b>（出力の誤差を連鎖律で各層の重みの勾配に伝える、1986年に広まる）。'));
  });

  // ======================= 動画 =======================
  reg(['motion-aperture-problem', 'motion-lucas-kanade'], '開口問題：小さな窓からは動きの一部しか分からない', (el) => {
    let ang = 45; const ui = h('div'); el.appendChild(control('線の本当の動きの向き', 0, 180, 15, ang, (v) => v + '°', (v) => { ang = v; draw(); })); el.appendChild(ui);
    function draw() {
      const t = (ang * Math.PI) / 180, d = [Math.cos(t), -Math.sin(t)], nrm = [Math.SQRT1_2, Math.SQRT1_2], dp = d[0] * nrm[0] + d[1] * nrm[1];
      ui.innerHTML = `<div class="figs">${svgOpen(200)}<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#e33"/></marker><marker id="ag" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#2a9d8f"/></marker></defs><line x1="40" y1="180" x2="220" y2="0" stroke="#ccc" stroke-width="6"/><line x1="${40 + d[0] * 40}" y1="${180 + d[1] * 40}" x2="${220 + d[0] * 40}" y2="${d[1] * 40}" stroke="#333" stroke-width="6"/><circle cx="130" cy="90" r="34" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="4 3"/><line x1="130" y1="90" x2="${130 + d[0] * 40}" y2="${90 + d[1] * 40}" stroke="#e33" stroke-width="2.5" marker-end="url(#ah)"/><line x1="130" y1="90" x2="${130 + nrm[0] * dp * 40}" y2="${90 + nrm[1] * dp * 40}" stroke="#2a9d8f" stroke-width="2.5" marker-end="url(#ag)"/><text x="170" y="150" font-size="11" fill="#e33">本当の動き</text><text x="170" y="166" font-size="11" fill="#2a9d8f">窓から分かる動き</text><text x="6" y="14" font-size="11">灰=前、黒=後、点線の円=観測窓</text></svg></div>`;
      ui.appendChild(note('丸い窓から直線（エッジ）だけを見ていると、線に沿った方向の動きは見えず、<b>エッジに垂直な成分</b>（緑）しか分からない。これが開口問題。数式では、オプティカルフロー拘束式 <b>Iₓu + I_yv + I_t = 0</b> は1画素につき方程式1本なのに未知数は (u, v) の2つで、1画素では解けないことに対応する。<b>Lucas–Kanade 法</b>は「窓の中の画素はみな同じ動き」と仮定して方程式を何本も集め、最小二乗で解く。コーナーのように複数方向の勾配がある所でないと解が安定しない。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
# 窓内の全画素について Ix*u + Iy*v = -It を並べて最小二乗
A = np.stack([Ix[win].ravel(), Iy[win].ravel()], 1); b = -It[win].ravel()
(u, v), *_ = np.linalg.lstsq(A, b, rcond=None)
# A^T A が特異（エッジのみ・平坦）だと解けない = 開口問題
# OpenCV: cv2.calcOpticalFlowPyrLK(prev, cur, pts, None, winSize=(15,15))`));
  });
  reg(['motion-kalman', 'motion-particle-filter'], 'カルマンフィルタ：ノイズの多い観測から位置を推定', (el) => {
    let R = 0.3; const ui = h('div'); el.appendChild(control('観測ノイズの大きさ', 0.05, 0.8, 0.05, R, (v) => v.toFixed(2), (v) => { R = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const T = 60, truth = [], obs = [], est = []; let x = [0, 0.03], P = [[1, 0], [0, 1]]; const q = 0.0005;
      for (let k = 0; k < T; k++) { const tp = 0.03 * k + 0.4 * Math.sin(k / 12); truth.push([k, tp]); const z = tp + randn() * R; obs.push([k, z]);
        // 予測
        x = [x[0] + x[1], x[1]]; P = [[P[0][0] + 2 * P[0][1] + P[1][1] + q, P[0][1] + P[1][1]], [P[1][0] + P[1][1], P[1][1] + q]];
        // 更新
        const S = P[0][0] + R * R, K = [P[0][0] / S, P[1][0] / S], y = z - x[0]; x = [x[0] + K[0] * y, x[1] + K[1] * y]; P = [[(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]], [P[1][0] - K[1] * P[0][0], P[1][1] - K[1] * P[0][1]]]; est.push([k, x[0]]); }
      ui.appendChild(svgPlot([{ pts: obs, color: '#bbb', w: 1 }, { pts: truth, color: '#2a9d8f' }, { pts: est, color: '#e33' }], { w: 290, h: 150, x0: 0, x1: T, xl: '時刻（灰=観測、緑=真の位置、赤=カルマン推定）' }));
      ui.appendChild(note('毎時刻、①<b>予測</b>：運動モデル（ここでは等速）で次の位置とその不確かさを予測 → ②<b>更新</b>：観測値との差を<b>カルマンゲイン</b>で重み付けして予測を修正。予測が確かなら観測をあまり信じず、観測が確かなら観測寄りにする。線形・ガウスノイズの仮定のもとで最適。物体追跡で、隠れて観測できない間も予測で位置を保てる。<b>パーティクルフィルタ</b>は多数の仮説（粒子）で分布を表し、非線形・非ガウスでも使える。'));
    }
    draw();
    el.appendChild(code(`import numpy as np
F = np.array([[1, 1], [0, 1]]); Hm = np.array([[1, 0]])     # 等速モデル, 位置のみ観測
x = np.zeros(2); P = np.eye(2); Q = 1e-3*np.eye(2); R = np.array([[0.3**2]])
for z in observations:
    x = F @ x; P = F @ P @ F.T + Q                            # 予測
    K = P @ Hm.T @ np.linalg.inv(Hm @ P @ Hm.T + R)           # カルマンゲイン
    x = x + K @ (z - Hm @ x); P = (np.eye(2) - K @ Hm) @ P    # 更新`));
  });
  reg(['motion-interlace', 'sys-interlace'], 'インタレース：動く物体のくし状のずれ', (el) => {
    let sp = 4; const n = 80, ui = h('div'); el.appendChild(control('物体の速さ', 0, 10, 1, sp, null, (v) => { sp = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const fr = (t) => { const a = img(n, n, 220); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - 30 - t) ** 2 + (y - 40) ** 2 < 300) a.d[y * n + x] = 40; return a; }; const A = fr(0), B = fr(sp); const il = IP.map(A, (v, i) => (((i / n) | 0) % 2 ? B.d[i] : v));
      ui.appendChild(rowOf([fig(toCanvas(il, { size: 140 }), 'インタレース（奇数行と偶数行が別時刻）'), fig(toCanvas(B, { size: 100 }), 'プログレッシブ')]));
      ui.appendChild(note('<b>インタレース</b>：1フレームを奇数行（トップフィールド）と偶数行（ボトムフィールド）に分け、<b>1/60秒ずつずれた時刻</b>に交互に送る（帯域を半分にして動きを滑らかに見せるテレビ放送の方式）。静止画では問題ないが、<b>動く物体の縁がくし状（コーミング）にずれる</b>。PCで表示・処理するときは2フィールドを補間して1枚にする（デインタレース）。<b>プログレッシブ</b>は全行を同時刻に撮る。'));
    }
    draw();
  });
  reg(['motion-motion-compensation', 'code-motion-compensation', 'code-gop'], '動き補償予測：差分だけ送る', (el) => {
    const n = 64, bg = scene(n); const fr = (t) => { const a = IP.clone(bg); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.abs(x - 16 - t) < 7 && Math.abs(y - 46) < 7) a.d[y * n + x] = 250 - ((x + y) % 4) * 20; return a; };
    const f0 = fr(0), f1 = fr(5); const diff = IP.map(f1, (v, i) => clamp(128 + v - f0.d[i])); const mc = IP.map(f1, (v, i) => { const x = i % n, y = (i / n) | 0; const inObj = Math.abs(x - 21) < 8 && Math.abs(y - 46) < 8; return clamp(128 + v - (inObj ? px(f0, x - 5, y) : f0.d[i])); });
    el.appendChild(rowOf([fig(toCanvas(f0, { size: 80 }), '参照フレーム'), fig(toCanvas(f1, { size: 80 }), '現フレーム（物体が右へ5）')]));
    el.appendChild(rowOf([fig(toCanvas(diff, { size: 90 }), '単純な差分（灰=0）'), fig(toCanvas(mc, { size: 90 }), '動きベクトル(5,0)で補償した差分')]));
    el.appendChild(note('動画の連続フレームはほとんど同じ。前のフレームを<b>動きベクトル分ずらして予測</b>し、予測との<b>差（予測誤差）とベクトルだけ</b>を符号化すれば大幅に小さくなる（灰色＝送る情報がほぼない）。'));
    el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 300 70" width="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="70" fill="#fff"/>${'IBBPBBPBBI'.split('').map((c, i) => `<rect x="${6 + i * 29}" y="20" width="24" height="30" fill="${c === 'I' ? '#e33' : c === 'P' ? '#3563e9' : '#2a9d8f'}"/><text x="${18 + i * 29}" y="40" font-size="12" fill="#fff" text-anchor="middle">${c}</text>`).join('')}<text x="6" y="14" font-size="10">GOP（Group of Pictures）の例</text><text x="6" y="64" font-size="9">I:単独で符号化 P:過去から予測 B:過去と未来の両方から予測</text></svg>`));
    el.appendChild(note('<b>Iピクチャ</b>は他を参照しない（JPEGのような画面内符号化）ので、途中から再生・頭出しの起点になる。<b>P</b>は前の I/P から、<b>B</b>は前後両方から予測するので最も小さい。I から次の I までの単位が <b>GOP</b>。'));
  });

  // ======================= 3次元 =======================
  reg(['d3-epipolar', 'd3-epipolar-line', 'd3-epipolar-constraint', 'd3-fundamental-matrix', 'd3-triangulation'], 'エピポーラ幾何：対応点は線の上にしかない', (el) => {
    let depth = 0.6; const ui = h('div'); el.appendChild(control('左画像の点 x の奥行き（未知）', 0.2, 1, 0.05, depth, (v) => v.toFixed(2), (v) => { depth = v; draw(); })); el.appendChild(ui);
    function draw() {
      const C1 = [60, 210], C2 = [240, 210], Px = 150 - 60 * (1 - depth), Py = 40 + 120 * (1 - depth); const x1 = [C1[0] + (Px - C1[0]) * 0.35, C1[1] + (Py - C1[1]) * 0.35], x2 = [C2[0] + (Px - C2[0]) * 0.35, C2[1] + (Py - C2[1]) * 0.35];
      const ray = []; for (const d of [0.2, 0.4, 0.6, 0.8, 1]) { const qx = 150 - 60 * (1 - d), qy = 40 + 120 * (1 - d); ray.push([qx, qy, C2[0] + (qx - C2[0]) * 0.35, C2[1] + (qy - C2[1]) * 0.35]); }
      ui.innerHTML = `<div class="figs"><svg viewBox="0 0 300 240" width="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="240" fill="#fff"/><polygon points="${C1.join(',')} ${Px},${Py} ${C2.join(',')}" fill="#3563e9" opacity=".08"/><line x1="${C1[0]}" y1="${C1[1]}" x2="${C2[0]}" y2="${C2[1]}" stroke="#999" stroke-dasharray="4 3"/><line x1="25" y1="170" x2="110" y2="150" stroke="#333" stroke-width="2"/><line x1="190" y1="150" x2="275" y2="170" stroke="#333" stroke-width="2"/><line x1="${C1[0]}" y1="${C1[1]}" x2="${150 - 60 * 0.8 + 0}" y2="${40 + 120 * 0.8}" stroke="#e33" stroke-width="0" /><line x1="${C1[0]}" y1="${C1[1]}" x2="${150}" y2="${40}" stroke="#e33" stroke-width="1"/><line x1="${ray[0][2]}" y1="${ray[0][3]}" x2="${ray[4][2]}" y2="${ray[4][3]}" stroke="#2a9d8f" stroke-width="3"/>${ray.map((r) => `<circle cx="${r[0]}" cy="${r[1]}" r="2.5" fill="#e33" opacity=".5"/><line x1="${r[0]}" y1="${r[1]}" x2="${C2[0]}" y2="${C2[1]}" stroke="#2a9d8f" stroke-width=".5" opacity=".5"/>`).join('')}<circle cx="${Px}" cy="${Py}" r="5" fill="#e33"/><text x="${Px + 6}" y="${Py}" font-size="11">P</text><circle cx="${x1[0]}" cy="${x1[1]}" r="4" fill="#3563e9"/><text x="${x1[0] - 18}" y="${x1[1] - 4}" font-size="11" fill="#3563e9">x</text><circle cx="${x2[0]}" cy="${x2[1]}" r="4" fill="#3563e9"/><text x="${x2[0] + 5}" y="${x2[1] - 4}" font-size="11" fill="#3563e9">x′</text><circle cx="${C1[0]}" cy="${C1[1]}" r="4"/><circle cx="${C2[0]}" cy="${C2[1]}" r="4"/><text x="${C1[0] - 10}" y="230" font-size="10">左カメラ中心</text><text x="${C2[0] - 30}" y="230" font-size="10">右カメラ中心</text><text x="190" y="140" font-size="10" fill="#2a9d8f">エピポーラ線</text><text x="6" y="14" font-size="10">青い三角＝エピポーラ平面、破線＝基線</text></svg></div>`;
      ui.appendChild(note('左画像の点 x に写る3次元点 P は、左カメラ中心から x を通る<b>光線（赤）上のどこか</b>にある（奥行き不明）。その光線を右カメラで見ると<b>1本の直線＝エピポーラ線（緑）</b>になる。だから<b>対応点 x′ はエピポーラ線上だけを探せばよい</b>（2次元探索→1次元探索）。奥行きスライダーを動かすと P と x′ がエピポーラ線上を移動する。数式では <b>x′ᵀ F x = 0</b>（F: 基礎行列、3×3・ランク2・自由度7、8点アルゴリズムで推定）。両カメラ中心を結ぶ基線が画像面と交わる点が<b>エピポール</b>で、全エピポーラ線が通る。対応が分かれば2本の光線の交点として P を<b>三角測量</b>できる。'));
    }
    draw();
    el.appendChild(code(`import cv2, numpy as np
F, mask = cv2.findFundamentalMat(pts1, pts2, cv2.FM_RANSAC)   # 8点以上の対応から
lines2 = cv2.computeCorrespondEpilines(pts1.reshape(-1,1,2), 1, F)   # 右画像のエピポーラ線 ax+by+c=0
# 拘束: x2^T F x1 = 0 （同次座標）
X = cv2.triangulatePoints(P1, P2, pts1.T, pts2.T)          # 三角測量 → 同次座標の3D点`));
  });
  reg(['d3-lambert', 'd3-specular', 'd3-phong', 'd3-brdf'], '反射モデル：拡散反射と鏡面反射', (el) => {
    let kd = 0.7, ks = 0.5, sh = 20, la = 30; const n = 96, ui = h('div');
    el.appendChild(control('拡散反射 kd', 0, 1, 0.05, kd, null, (v) => { kd = v; draw(); })); el.appendChild(control('鏡面反射 ks', 0, 1, 0.05, ks, null, (v) => { ks = v; draw(); })); el.appendChild(control('光沢の鋭さ n', 1, 100, 1, sh, null, (v) => { sh = v; draw(); })); el.appendChild(control('光源の向き', -80, 80, 5, la, (v) => v + '°', (v) => { la = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const L = [Math.sin((la * Math.PI) / 180) * 0.8, -0.5, Math.cos((la * Math.PI) / 180)]; const ln = Math.hypot(...L); L.forEach((v, i) => (L[i] = v / ln)); const Vv = [0, 0, 1]; const out = img(n, n, 40), dif = img(n, n, 40), spe = img(n, n, 40);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - n / 2) / (n * 0.42), v = (y - n / 2) / (n * 0.42), r2 = u * u + v * v; if (r2 >= 1) continue; const N = [u, v, Math.sqrt(1 - r2)]; const nl = N[0] * L[0] + N[1] * L[1] + N[2] * L[2]; const Rr = N.map((c, i) => 2 * nl * c - L[i]); const rv = Math.max(0, Rr[2]); const d = kd * Math.max(0, nl), s = nl > 0 ? ks * rv ** sh : 0; const i = y * n + x; dif.d[i] = 255 * d; spe.d[i] = 255 * s; out.d[i] = clamp(255 * (0.05 + d + s)); }
      ui.appendChild(rowOf([fig(toCanvas(dif, { size: 80 }), '拡散反射（ランバート）'), fig(toCanvas(spe, { size: 80 }), '鏡面反射'), fig(toCanvas(out, { size: 110 }), 'フォンモデル（合計）')]));
      ui.appendChild(note('<b>ランバート反射（完全拡散）</b>：明るさ = kd·cosθ（θ: 法線と光源方向の角）。<b>どの方向から見ても同じ明るさ</b>（視点に依存しない）。<b>鏡面反射</b>：正反射方向 R の近くだけ強く光る（ハイライト）。<b>フォンモデル</b> = 環境光 + kd(N·L) + ks(R·V)ⁿ。n が大きいほどハイライトが小さく鋭い（つるつるの面）。現実の物体の反射特性を一般的に表すのが <b>BRDF</b>（入射方向と出射方向の関数）。照度差ステレオはランバート反射を仮定し、鏡面反射の画素では成り立たない。'));
    }
    draw();
  });
  reg(['d3-tof'], 'ToF：光の往復時間（位相差）で距離を測る', (el) => {
    let dist = 2, fm = 20; const ui = h('div'); el.appendChild(control('物体までの距離', 0.2, 12, 0.1, dist, (v) => v.toFixed(1) + ' m', (v) => { dist = v; draw(); })); el.appendChild(control('変調周波数', 5, 100, 5, fm, (v) => v + ' MHz', (v) => { fm = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const c = 3e8, t = (2 * dist) / c, phi = (2 * Math.PI * fm * 1e6 * t) % (2 * Math.PI), amb = c / (2 * fm * 1e6); const tx = [], rx = []; for (let k = 0; k <= 200; k++) { const tt = k / 200 * 2; tx.push([tt, Math.sin(2 * Math.PI * tt)]); rx.push([tt, 0.6 * Math.sin(2 * Math.PI * tt - phi)]); }
      ui.appendChild(svgPlot([{ pts: tx, color: '#3563e9' }, { pts: rx, color: '#e33' }], { w: 290, h: 110, x0: 0, x1: 2, y0: -1.1, y1: 1.1, xl: '時間（周期単位）　青=発光、赤=受光' }));
      ui.appendChild(note(`光の往復時間 t = 2d/c = <b>${(t * 1e9).toFixed(2)} ns</b>。直接計測は難しいので、<b>間接ToF</b>は光を周波数 f で強度変調し、反射光の<b>位相のずれ φ</b> から d = cφ/(4πf) を求める → 今 φ = ${((phi * 180) / Math.PI).toFixed(0)}°。ただし位相は 2π で折り返すので、測れる最大距離（あいまいさ距離）は <b>c/(2f) = ${amb.toFixed(2)} m</b>：これを超えると近くの距離と区別できない（${dist > amb ? '<b style="color:#e33">今まさに超えている！</b>' : '範囲内'}）。周波数を上げると精度は上がるが範囲が狭まる → 複数周波数を併用。<b>直接ToF</b>（LiDARなど）はパルスの往復時間を直接測る。`));
    }
    draw();
  });
  reg(['d3-icp'], 'ICP：2つの点群を反復で重ね合わせる', (el) => {
    const A = []; for (let i = 0; i < 40; i++) { const t = (i / 40) * Math.PI * 1.5; A.push([Math.cos(t) * 0.7 + 0.1 * Math.cos(3 * t), Math.sin(t) * 0.5]); } const th0 = 0.6, T0 = [0.35, -0.25]; let B0 = A.map(([x, y]) => [Math.cos(th0) * x - Math.sin(th0) * y + T0[0] + randn() * 0.01, Math.sin(th0) * x + Math.cos(th0) * y + T0[1] + randn() * 0.01]);
    const steps = [B0]; let B = B0; for (let it = 0; it < 12; it++) { const pr = B.map((b) => { let best = 0, bd = 1e9; A.forEach((a, j) => { const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; if (d < bd) { bd = d; best = j; } }); return A[best]; }); const mb = [0, 0], ma = [0, 0]; B.forEach((b, i) => { mb[0] += b[0]; mb[1] += b[1]; ma[0] += pr[i][0]; ma[1] += pr[i][1]; }); mb.forEach((v, k) => (mb[k] /= B.length)); ma.forEach((v, k) => (ma[k] /= B.length)); let sxx = 0, sxy = 0; B.forEach((b, i) => { const p = [b[0] - mb[0], b[1] - mb[1]], q = [pr[i][0] - ma[0], pr[i][1] - ma[1]]; sxx += p[0] * q[0] + p[1] * q[1]; sxy += p[0] * q[1] - p[1] * q[0]; }); const th = Math.atan2(sxy, sxx); B = B.map(([x, y]) => { const px0 = x - mb[0], py0 = y - mb[1]; return [Math.cos(th) * px0 - Math.sin(th) * py0 + ma[0], Math.sin(th) * px0 + Math.cos(th) * py0 + ma[1]]; }); steps.push(B); }
    let it = 0; const ui = h('div'); el.appendChild(control('反復回数', 0, steps.length - 1, 1, 0, null, (v) => { it = v; draw(); })); el.appendChild(ui);
    function draw() { let g = svgOpen(220); A.forEach(([x, y]) => (g += `<circle cx="${X(x)}" cy="${110 - y * 120}" r="3" fill="#3563e9"/>`)); steps[it].forEach(([x, y]) => (g += `<circle cx="${X(x)}" cy="${110 - y * 120}" r="3" fill="#e33"/>`)); g += `<text x="6" y="14" font-size="11">青=基準の点群、赤=合わせる点群（${it}回目）</text></svg>`; ui.innerHTML = `<div class="figs">${g}</div>`; ui.appendChild(note('①赤の各点について<b>最も近い青の点</b>を仮の対応とする → ②その対応で誤差が最小になる<b>回転・平行移動</b>を求めて（SVDで閉形式に解ける）赤を動かす → ①②を収束まで繰り返す（Besl–McKay 1992）。3Dスキャンの複数視点の点群の位置合わせに使う。初期位置が大きくずれていると、間違った対応のまま<b>局所解</b>に落ちる。スライダーで反復の様子を見よう。')); }
    draw();
    el.appendChild(code(`import numpy as np
def best_rigid(P, Q):                       # P を Q に合わせる R, t（SVD）
    mp, mq = P.mean(0), Q.mean(0)
    U, _, Vt = np.linalg.svd((P - mp).T @ (Q - mq))
    R = Vt.T @ U.T
    if np.linalg.det(R) < 0: Vt[-1] *= -1; R = Vt.T @ U.T
    return R, mq - R @ mp
for _ in range(30):
    idx = np.argmin(((P[:, None] - Q[None]) ** 2).sum(-1), 1)   # 最近傍点 = 仮の対応
    R, t = best_rigid(P, Q[idx]); P = P @ R.T + t`));
  });
  reg(['d3-visual-hull'], '視体積交差法：シルエットを重ねて形を削り出す', (el) => {
    let nv = 3; const ui = h('div'); el.appendChild(control('使う視点の数', 1, 8, 1, nv, null, (v) => { nv = v; draw(); })); el.appendChild(ui);
    const G = 80, obj = (x, y) => (x - 40) ** 2 / 500 + (y - 40) ** 2 / 200 < 1 || ((x - 52) ** 2 + (y - 52) ** 2 < 90);
    function draw() {
      ui.innerHTML = ''; const hull = img(G, G, 255); const angs = Array.from({ length: nv }, (_, i) => (i * Math.PI) / nv);
      const sil = angs.map((a) => { const c = Math.cos(a), s = Math.sin(a), set = new Set(); for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (obj(x, y)) set.add(Math.round((x - 40) * c + (y - 40) * s)); return set; });
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { let ok = true; angs.forEach((a, k) => { if (!sil[k].has(Math.round((x - 40) * Math.cos(a) + (y - 40) * Math.sin(a)))) ok = false; }); const i = y * G + x; hull.d[i] = obj(x, y) ? 30 : ok ? 150 : 255; }
      ui.appendChild(rowOf([fig(toCanvas(hull, { size: 160 }), `黒=本当の物体、灰=${nv}方向のシルエットから推定した余分な部分`)]));
      ui.appendChild(note('複数の方向から撮った<b>シルエット（物体の輪郭の内側）</b>を空間に逆投影すると、それぞれ錐体（ここでは2次元断面なので帯）になる。その<b>共通部分</b>に物体は必ず含まれる → 視体積（visual hull）。視点を増やすほど本物に近づくが、<b>へこみ（凹部）はどの方向のシルエットにも現れないので復元できない</b>。シルエットだけで良いので処理が簡単・高速。'));
    }
    draw();
  });

  // ======================= 符号化 =======================
  reg(['code-zigzag'], 'ジグザグスキャン：低周波から順に並べる', (el) => {
    const ord = []; for (let s = 0; s < 15; s++) { const cells = []; for (let i = 0; i <= s; i++) { const j = s - i; if (i < 8 && j < 8) cells.push([i, j]); } if (s % 2 === 0) cells.reverse(); ord.push(...cells); }
    const idx = {}; ord.forEach(([i, j], k) => (idx[i * 8 + j] = k));
    const vals = Array.from({ length: 64 }, (_, k) => 0); [[0, 0, -26], [0, 1, -3], [1, 0, 1], [2, 0, -3], [1, 1, -2], [0, 2, -6], [0, 3, 2], [1, 2, -4], [2, 1, 1], [3, 0, -4], [4, 0, 1], [3, 1, 1], [2, 2, 5], [1, 3, 1], [0, 4, 2]].forEach(([i, j, v]) => (vals[i * 8 + j] = v));
    const pts = ord.map(([i, j]) => `${j * 30 + 15},${i * 30 + 15}`).join(' ');
    el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 240 240" width="240" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="240" fill="#fff"/>${Array.from({ length: 64 }, (_, k) => { const i = (k / 8) | 0, j = k % 8; return `<rect x="${j * 30}" y="${i * 30}" width="30" height="30" fill="${vals[k] ? '#dce6fd' : '#fff'}" stroke="#ccc"/><text x="${j * 30 + 15}" y="${i * 30 + 19}" font-size="10" text-anchor="middle">${vals[k]}</text>`; }).join('')}<polyline points="${pts}" fill="none" stroke="#e33" stroke-width="1.5" opacity=".7"/></svg>`));
    const seq = ord.map(([i, j]) => vals[i * 8 + j]); let last = seq.length - 1; while (last > 0 && !seq[last]) last--;
    el.appendChild(note(`量子化後の8×8 DCT係数を、左上（直流・低周波）から右下（高周波）へ<b>ジグザグ</b>に読む：<b>${seq.slice(0, last + 1).join(', ')}, EOB</b>。高周波側は0ばかりなので後ろに<b>0がまとまり</b>、「直前の0の数（ラン）と値」の組でランレングス化し、残りは EOB（ブロック終わり）1つで済む。それをハフマン符号化する。`));
  });
  reg(['code-chroma-subsampling'], 'クロマサブサンプリング：色だけ解像度を落とす', (el) => {
    let mode = '420'; const cs = colorScene(64), ui = h('div'); el.appendChild(select('方式', [['444', '4:4:4（間引きなし）'], ['422', '4:2:2（横1/2）'], ['420', '4:2:0（縦横1/2）'], ['411', '強い間引き（4×4）']], mode, (v) => { mode = v; draw(); })); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; const n = 64, fx = { 444: 1, 422: 2, 420: 2, 411: 4 }[mode], fy = { 444: 1, 422: 1, 420: 2, 411: 4 }[mode]; const Y = [], Cb = [], Cr = []; for (let i = 0; i < n * n; i++) { const r = cs.r.d[i], g = cs.g.d[i], b = cs.b.d[i]; Y.push(0.299 * r + 0.587 * g + 0.114 * b); Cb.push(128 - 0.1687 * r - 0.3313 * g + 0.5 * b); Cr.push(128 + 0.5 * r - 0.4187 * g - 0.0813 * b); }
      const out = { r: img(n, n), g: img(n, n), b: img(n, n), w: n, h: n }; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x, j = (y - (y % fy)) * n + (x - (x % fx)); const yy = Y[i], cb = Cb[j] - 128, cr = Cr[j] - 128; out.r.d[i] = yy + 1.402 * cr; out.g.d[i] = yy - 0.344 * cb - 0.714 * cr; out.b.d[i] = yy + 1.772 * cb; }
      const ratio = (1 + 2 / (fx * fy)) / 3;
      ui.appendChild(rowOf([fig(toCanvas(cs, { size: 120 }), '元'), fig(toCanvas(out, { size: 120 }), `${mode === '411' ? '4×4' : mode.split('').join(':')} データ量 ${(ratio * 100).toFixed(0)}%`)]));
      ui.appendChild(note('YCbCr に変換し、人の目が敏感な<b>輝度 Y は全画素</b>、鈍い<b>色差 Cb・Cr は間引いて</b>保存する。<b>4:2:2</b>：色差を横1/2（データ量2/3）。<b>4:2:0</b>：縦横とも1/2（色差は4画素に1組 → 1画素あたり平均 1+0.25+0.25=1.5 サンプル＝<b>データ量1/2</b>）。JPEG・地デジ・ほとんどの動画配信が 4:2:0。普通の画像では見分けにくいが、赤い家の縁など色の境界がわずかににじむ。'));
    }
    draw();
  });
  reg(['code-dpcm', 'code-entropy'], '予測符号化：差分にするとエントロピーが下がる', (el) => {
    const n = 64, a = IP.map(scene(n), (v) => Math.round(v)); const d = IP.map(a, (v, i) => (i % n ? v - a.d[i - 1] : v - 128));
    const ent = (arr, off) => { const hst = {}; arr.forEach((v) => (hst[v] = (hst[v] || 0) + 1)); let e = 0; Object.values(hst).forEach((c) => { const p = c / arr.length; e -= p * Math.log2(p); }); return e; };
    const ha = IP.hist(a, 64), hd = new Array(64).fill(0); d.d.forEach((v) => hd[Math.min(63, Math.max(0, Math.round(v / 8) + 32))]++);
    el.appendChild(rowOf([fig(toCanvas(a, { size: 100 }), '原画像'), fig(toCanvas(IP.map(d, (v) => clamp(128 + v * 2)), { size: 100 }), '左隣との差分（灰=0）')]));
    el.appendChild(rowOf([fig(svgPlot([{ pts: ha.map((v, i) => [i, v]), color: '#334', bars: 1 }], { w: 140, h: 90, x0: 0, x1: 64 }), `原画像の分布 H=${ent([...a.d]).toFixed(2)} bit`), fig(svgPlot([{ pts: hd.map((v, i) => [i, v]), color: '#e33', bars: 1 }], { w: 140, h: 90, x0: 0, x1: 64 }), `差分の分布 H=${ent([...d.d]).toFixed(2)} bit`)]));
    el.appendChild(note('<b>エントロピー</b> H = −Σ p log₂p は、1画素あたりに最低限必要な平均ビット数（可逆圧縮の限界）。隣り合う画素はよく似ているので、<b>予測値（ここでは左隣）との差</b>にすると値が0付近に集中し、分布がとがって<b>エントロピーが大きく下がる</b> → ハフマン符号などで短く符号化できる。これが <b>DPCM（予測符号化）</b>で、PNG の行フィルタや可逆JPEGで使われる。差分から元に完全に戻せるので可逆。'));
  });
  reg(['code-lzw', 'code-arithmetic'], 'LZW：出てきた文字列を辞書に登録して番号で送る', (el) => {
    const s = 'ABABABA'; const dict = { A: 0, B: 1 }; let w = '', out = [], rows = [], next = 2;
    for (const c of s) { if (dict[w + c] !== undefined) w += c; else { out.push(dict[w]); rows.push(`<tr><td>${w}</td><td>${dict[w]}</td><td>${w + c} → ${next}</td></tr>`); dict[w + c] = next++; w = c; } } out.push(dict[w]); rows.push(`<tr><td>${w}</td><td>${dict[w]}</td><td>（終わり）</td></tr>`);
    el.appendChild(h('div', { className: 'tblwrap' }, `<table class="tb"><tr><th>読んだ最長一致</th><th>出力</th><th>辞書に追加</th></tr>${rows.join('')}</table>`));
    el.appendChild(note(`入力「${s}」→ 出力 <b>${out.join(', ')}</b>（7文字が${out.length}個の番号に）。辞書にある最長の文字列を読み、その番号を出力し、「その文字列＋次の1文字」を新しい番号で辞書に登録する。辞書は送らなくても、<b>復号側も同じ手順で同じ辞書を作れる</b>。繰り返しの多いデータほど長い文字列が1つの番号になって縮む。GIF・TIFF で使われる可逆圧縮。`));
  });

  // ======================= システム（照明） =======================
  reg(['sys-machine-vision', 'sys-ring-light', 'sys-coaxial-light', 'sys-backlight', 'sys-dome-light', 'sys-low-angle-light'], '照明方式で傷・形の見え方が変わる', (el) => {
    let mode = 'coax'; const n = 96, ui = h('div'); el.appendChild(select('照明', [['coax', '同軸落射照明'], ['low', 'ローアングル照明（暗視野）'], ['back', 'バックライト（透過）'], ['dome', 'ドーム照明（拡散）'], ['ring', 'リング照明']], mode, (v) => { mode = v; draw(); })); el.appendChild(ui);
    // 鏡面のような金属板（中央に穴、上に傷、右下に凹凸の刻印）
    function draw() {
      ui.innerHTML = ''; const a = img(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const inPlate = x > 8 && x < 88 && y > 8 && y < 88, hole = (x - 30) ** 2 + (y - 60) ** 2 < 100, scratch = Math.abs(y - (20 + (x - 20) * 0.3)) < 0.8 && x > 20 && x < 70, emb = x > 56 && x < 80 && y > 56 && y < 80 && ((x - 56) % 8 < 2 || (y - 56) % 8 < 2); let v;
        if (mode === 'back') v = !inPlate || hole ? 250 : 15;
        else if (!inPlate) v = 20; else if (hole) v = mode === 'coax' ? 10 : 30;
        else if (mode === 'coax') v = scratch || emb ? 60 : 225; else if (mode === 'low') v = scratch || emb ? 235 : 25; else if (mode === 'dome') v = scratch ? 175 : emb ? 170 : 180; else v = (scratch || emb ? 140 : 120) + 60 * Math.exp(-(((x - 48) ** 2 + (y - 48) ** 2) / 800));
        a.d[y * n + x] = v; }
      ui.appendChild(rowOf([fig(toCanvas(a, { size: 170 }), '金属板（穴・細い傷・刻印）')]));
      ui.appendChild(note({ coax: '<b>同軸落射照明</b>：ハーフミラーでカメラと同じ軸から光を当てる。平らな鏡面は光をそのままカメラに返して<b>明るく</b>、傷や凹凸は光をよそへ散らすので<b>暗く</b>写る。光沢面の傷・印字検査向き。', low: '<b>ローアングル照明（暗視野）</b>：ほぼ真横から光を当てる。平らな面の正反射はカメラに入らず<b>暗い</b>まま、<b>傷・凹凸・ほこりの縁だけが光る</b>。微細な傷や刻印の検出向き。', back: '<b>バックライト（透過照明）</b>：対象の裏から照らすので、<b>シルエット（外形・穴）がくっきり</b>した白黒画像になる。寸法計測・穴の有無向き。表面の模様や傷は見えない。', dome: '<b>ドーム照明</b>：半球状のドームの内側で光を拡散させ、あらゆる方向から均一に当てる。<b>光沢・凹凸の影響が消え</b>、模様や色・印刷をむらなく見られる。逆に凹凸の検査には向かない。', ring: '<b>リング照明</b>：レンズの周りの輪から斜め上に当てる。手軽で影が出にくいが、光沢面ではリングの<b>映り込み（ハイライト）</b>が出る。' }[mode]));
    }
    draw();
  });

  // ======================= 知財 =======================
  reg(['ip-term', 'ip-term-extension-2018'], '保護期間計算機', (el) => {
    let kind = 'person', year = 1975; const ui = h('div');
    el.appendChild(select('著作物の種類', [['person', '個人の実名の著作物'], ['corp', '団体名義（職務著作など）'], ['anon', '無名・変名'], ['film', '映画の著作物']], kind, (v) => { kind = v; draw(); }));
    el.appendChild(control('著作者の死亡年／公表年', 1930, 2025, 1, year, (v) => v + '年', (v) => { year = v; draw(); })); el.appendChild(ui);
    function draw() {
      const base = year; let end = base + 70, note2 = '';
      if (kind === 'person') { const old = base + 50; if (old < 2018) { end = old; note2 = `旧法の死後50年で <b>${old}年12月31日</b> に既に満了していた（2018年12月30日時点で満了済みのものは<b>延長されない</b>）。`; } }
      else if (kind !== 'film') { const old = base + 50; if (old < 2018) { end = old; note2 = '旧法の公表後50年で延長前に満了。'; } }
      else { if (base + 70 < 2018 && base + 50 < 2018) note2 = '映画は2004年施行の改正で既に公表後70年。'; }
      const alive = end >= 2026;
      ui.innerHTML = `<div class="explain">${kind === 'person' ? '死亡' : '公表'}：${year}年 → 起算は<b>翌年1月1日</b>（暦年主義） → 保護期間は <b>${end}年12月31日まで</b>。<br>2026年11月現在：<b style="color:${alive ? '#d0383b' : '#14915a'}">${alive ? '保護期間中（許諾が必要）' : '満了＝パブリックドメイン（自由に利用可）'}</b><br>${note2}</div>`;
      ui.appendChild(note('原則は<b>著作者の死後70年</b>、団体名義・無名変名・映画は<b>公表後70年</b>。2018年12月30日（TPP整備法の施行）に50年→70年に延長されたが、<b>その時点ですでに切れていたものは復活しない</b>。期間は死亡・公表の翌年の1月1日から数える。著作者人格権は一身専属で死後は消えるが、死後も人格権の侵害となるべき行為は原則禁止。'));
    }
    draw();
  });
  reg(['ip-quotation'], '引用チェッカー（32条）', (el) => {
    const items = [['公表された著作物である', true], ['自分の著作物が「主」、引用部分が「従」（主従関係）', true], ['引用部分がかぎ括弧などで明瞭に区別されている', true], ['引用する必然性がある（報道・批評・研究など正当な目的の範囲内）', true], ['出所（著作者名・題名など）を明示している', true], ['引用部分を改変していない', true]];
    const st = items.map(() => true); const ui = h('div'); el.appendChild(ui);
    function draw() {
      ui.innerHTML = ''; items.forEach(([t], i) => { const l = h('label', { className: 'row', style: 'gap:8px;padding:6px 0;font-size:14px' }); const c = h('input', { type: 'checkbox', checked: st[i] }); c.addEventListener('change', () => { st[i] = c.checked; draw(); }); l.appendChild(c); l.appendChild(h('span', {}, t)); ui.appendChild(l); });
      const ng = items.filter((_, i) => !st[i]).map(([t]) => t); const ok = ng.length === 0;
      ui.appendChild(h('div', { className: 'explain', style: `border-color:${ok ? 'var(--ok)' : 'var(--ng)'}` }, ok ? '<b style="color:var(--ok)">✔ 適法な引用として許諾なく利用できる可能性が高い</b>' : `<b style="color:var(--ng)">✘ 引用に当たらない可能性が高い</b><br>欠けている要件：${ng.join('／')}`));
      ui.appendChild(note('32条の引用は「公正な慣行に合致し、正当な範囲内」で認められる。判例・通説では<b>明瞭区別性・主従関係</b>が中心的な要件で、<b>出所明示</b>は48条の義務（怠ると罰則あり）。<b>未公表の著作物は引用できない</b>。画像を丸ごと使う場合も、本文の論評に必要な範囲なら引用になりうるが、「飾り」として使うと主従関係を満たさない。'));
    }
    draw();
  });
  reg(['ip-non-enjoyment', 'ip-incidental'], 'AI学習・写り込みの判定フロー', (el) => {
    el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 320 300" width="320" xmlns="http://www.w3.org/2000/svg" font-size="10"><rect width="320" height="300" fill="#fff"/>
<rect x="60" y="8" width="200" height="34" rx="6" fill="#e8eefc" stroke="#3563e9"/><text x="160" y="22" text-anchor="middle">著作物を AI の学習・解析に使う</text><text x="160" y="35" text-anchor="middle">（複製・データ化）</text>
<line x1="160" y1="42" x2="160" y2="58" stroke="#333"/>
<rect x="30" y="58" width="260" height="40" rx="6" fill="#fff" stroke="#333"/><text x="160" y="74" text-anchor="middle">目的は「思想・感情を享受」しないこと？</text><text x="160" y="88" text-anchor="middle">（情報解析・学習のみ、表現を味わわせない）</text>
<line x1="90" y1="98" x2="60" y2="120" stroke="#333"/><text x="56" y="113">いいえ</text><line x1="230" y1="98" x2="250" y2="120" stroke="#333"/><text x="246" y="113">はい</text>
<rect x="4" y="120" width="120" height="50" rx="6" fill="#fde9e9" stroke="#d0383b"/><text x="64" y="138" text-anchor="middle">30条の4 の対象外</text><text x="64" y="152" text-anchor="middle">例：特定作家の作風を</text><text x="64" y="164" text-anchor="middle">出力させる追加学習等</text>
<rect x="170" y="120" width="146" height="50" rx="6" fill="#fff" stroke="#333"/><text x="243" y="138" text-anchor="middle">著作権者の利益を</text><text x="243" y="152" text-anchor="middle">不当に害する場合？</text><text x="243" y="164" text-anchor="middle">（ただし書）</text>
<line x1="200" y1="170" x2="170" y2="200" stroke="#333"/><text x="168" y="190">はい</text><line x1="290" y1="170" x2="290" y2="200" stroke="#333"/><text x="294" y="190">いいえ</text>
<rect x="90" y="200" width="130" height="50" rx="6" fill="#fde9e9" stroke="#d0383b"/><text x="155" y="218" text-anchor="middle">許諾が必要</text><text x="155" y="232" text-anchor="middle">例：学習用として販売</text><text x="155" y="244" text-anchor="middle">されたDBの無断複製</text>
<rect x="228" y="200" width="88" height="50" rx="6" fill="#e3f6ec" stroke="#14915a"/><text x="272" y="220" text-anchor="middle">許諾なく</text><text x="272" y="234" text-anchor="middle">利用できる</text>
<text x="6" y="280" font-size="9">※生成・利用段階で既存作品に類似（類似性）＋依拠していれば、通常の著作権侵害の問題になる</text></svg>`));
    el.appendChild(note('<b>30条の4</b>（2018年改正）：著作物に表現された思想・感情を<b>自ら享受し又は他人に享受させることを目的としない</b>利用（情報解析・AI学習・技術開発の試験など）は、原則として許諾不要。ただし<b>著作権者の利益を不当に害する場合</b>は除かれる。<b>30条の2（写り込み）</b>：写真撮影・録画・配信などで、メインの被写体に<b>付随して</b>他人の著作物（背景のポスター、流れていたBGM等）が<b>軽微に</b>写り込んでも侵害にならない。'));
  });
  reg(['ip-work-for-hire'], '職務著作：著作者が会社になる条件', (el) => {
    const conds = ['法人等の発意に基づく', '法人等の業務に従事する者が作成', '職務上作成する', '法人等の名義で公表する（プログラムは不要）', '契約・勤務規則に別段の定めがない'];
    el.appendChild(h('div', { className: 'figs' }, `<svg viewBox="0 0 320 ${conds.length * 34 + 60}" width="320" xmlns="http://www.w3.org/2000/svg" font-size="11"><rect width="320" height="${conds.length * 34 + 60}" fill="#fff"/>${conds.map((c, i) => `<rect x="20" y="${10 + i * 34}" width="280" height="26" rx="5" fill="#e8eefc" stroke="#3563e9"/><text x="30" y="${27 + i * 34}">${i + 1}. ${c}</text>`).join('')}<rect x="60" y="${14 + conds.length * 34}" width="200" height="34" rx="6" fill="#e3f6ec" stroke="#14915a"/><text x="160" y="${29 + conds.length * 34}" text-anchor="middle">すべて満たす → 著作者＝法人</text><text x="160" y="${42 + conds.length * 34}" text-anchor="middle">（著作権も著作者人格権も法人）</text></svg>`));
    el.appendChild(note('15条：5つの要件を<b>すべて</b>満たすと、実際に作った社員ではなく<b>会社が著作者</b>になる（著作者人格権も会社に帰属）。<b>プログラム</b>は社内でのみ使うことも多いため「法人名義での公表」が要件にない。外部の<b>フリーランス・委託先</b>が作ったものは職務著作にならず、作成者が著作者 → 契約で著作権を譲渡してもらう必要がある（翻案権等は特掲が必要、著作者人格権は譲渡できないので不行使特約を結ぶ）。'));
  });
})();
