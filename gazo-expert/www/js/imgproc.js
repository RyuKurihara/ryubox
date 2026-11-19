// 画像処理エンジン（グレースケール Float32、値域0..255）
'use strict';
const IP = (() => {
  const img = (w, h, fill = 0) => ({ w, h, d: new Float32Array(w * h).fill(fill) });
  const clone = (a) => ({ w: a.w, h: a.h, d: new Float32Array(a.d) });
  const clamp = (v, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);
  const at = (a, x, y) => {
    // 端画素複製
    x = x < 0 ? 0 : x >= a.w ? a.w - 1 : x;
    y = y < 0 ? 0 : y >= a.h ? a.h - 1 : y;
    return a.d[y * a.w + x];
  };
  const map = (a, f) => { const b = clone(a); for (let i = 0; i < b.d.length; i++) b.d[i] = f(b.d[i], i); return b; };

  // ---------- テスト画像 ----------
  function scene(n = 64) {
    const a = img(n, n);
    const s = n / 64;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 60 + (x / n) * 70; // 横グラデーション背景
      // 明るい円
      if ((x - 20 * s) ** 2 + (y - 22 * s) ** 2 < (12 * s) ** 2) v = 225;
      // 暗い矩形
      if (x > 36 * s && x < 58 * s && y > 10 * s && y < 30 * s) v = 25;
      // 中間の三角形
      if (y > 38 * s && y < 60 * s && Math.abs(x - 44 * s) < (y - 38 * s) * 0.6) v = 170;
      // 細い縦線
      if (x >= 8 * s && x < 10 * s && y > 36 * s && y < 60 * s) v = 250;
      a.d[y * n + x] = v;
    }
    return a;
  }
  function addSaltPepper(a, p = 0.06) { return map(a, (v) => { const r = Math.random(); return r < p / 2 ? 0 : r < p ? 255 : v; }); }
  function addGauss(a, sd = 18) {
    return map(a, (v) => { const u = Math.random() || 1e-9, w = Math.random(); return clamp(v + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w)); });
  }
  // 非対称図形「F」（幾何変換用）。背景0、図形255。中心原点。
  function glyphF(n = 48) {
    const a = img(n, n, 245);
    const c = n / 2, u = n / 16;
    const inR = (x, y, x0, y0, x1, y1) => x >= c + x0 * u && x < c + x1 * u && y >= c + y0 * u && y < c + y1 * u;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (inR(x, y, -3, -5, -1, 5) || inR(x, y, -1, -5, 4, -3) || inR(x, y, -1, -1, 2.5, 1)) a.d[y * n + x] = 20;
    }
    // 軸（薄く）
    for (let i = 0; i < n; i++) { if (a.d[c * n + i] > 200) a.d[c * n + i] = 205; if (a.d[i * n + c] > 200) a.d[i * n + c] = 205; }
    return a;
  }
  function stripes(n, fx, fy, phase = 0) {
    // 正弦波縞 fx,fy: 画像全体での周期数
    const a = img(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a.d[y * n + x] = 128 + 110 * Math.cos(2 * Math.PI * (fx * x + fy * y) / n + phase);
    return a;
  }

  // ---------- 空間フィルタ ----------
  function conv(a, k, opts = {}) {
    // 相関として適用（画像処理慣例）。k: 2次元配列
    const kh = k.length, kw = k[0].length, oy = kh >> 1, ox = kw >> 1;
    const b = img(a.w, a.h);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      let s = 0;
      for (let j = 0; j < kh; j++) for (let i = 0; i < kw; i++) s += k[j][i] * at(a, x + i - ox, y + j - oy);
      if (opts.abs) s = Math.abs(s);
      b.d[y * a.w + x] = s * (opts.gain || 1) + (opts.offset || 0);
    }
    if (!opts.raw) b.d.forEach((v, i) => (b.d[i] = clamp(v)));
    return b;
  }
  function rank(a, r, fn) {
    const b = img(a.w, a.h), buf = [];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      buf.length = 0;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) buf.push(at(a, x + i, y + j));
      b.d[y * a.w + x] = fn(buf);
    }
    return b;
  }
  const median = (a, r = 1) => rank(a, r, (v) => { v.sort((p, q) => p - q); return v[v.length >> 1]; });
  const maxf = (a, r = 1) => rank(a, r, (v) => Math.max(...v));
  const minf = (a, r = 1) => rank(a, r, (v) => Math.min(...v));
  const K = {
    mean3: [[1, 1, 1], [1, 1, 1], [1, 1, 1]].map((r) => r.map((v) => v / 9)),
    gauss3: [[1, 2, 1], [2, 4, 2], [1, 2, 1]].map((r) => r.map((v) => v / 16)),
    sobelX: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
    sobelY: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
    prewittX: [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]],
    lap4: [[0, 1, 0], [1, -4, 1], [0, 1, 0]],
    lap8: [[1, 1, 1], [1, -8, 1], [1, 1, 1]],
    sharpen: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
    emboss: [[-1, 0, 0], [0, 0, 0], [0, 0, 1]],
  };
  function meanN(n) { const v = 1 / (n * n); return Array.from({ length: n }, () => Array(n).fill(v)); }
  function sobelMag(a) {
    const gx = conv(a, K.sobelX, { raw: true }), gy = conv(a, K.sobelY, { raw: true });
    const b = img(a.w, a.h);
    for (let i = 0; i < b.d.length; i++) b.d[i] = clamp(Math.hypot(gx.d[i], gy.d[i]) / 4);
    return b;
  }

  // ---------- 濃淡変換 ----------
  const tone = {
    negative: (v) => 255 - v,
    gamma05: (v) => 255 * Math.pow(v / 255, 0.5),
    gamma2: (v) => 255 * Math.pow(v / 255, 2),
    scurve: (v) => 255 / (1 + Math.exp(-(v - 128) / 22)),
    posterize: (v) => Math.min(3, Math.floor(v / 64)) * 85,
    solarize: (v) => (v < 128 ? v * 2 : (255 - v) * 2),
    binarize: (v) => (v >= 128 ? 255 : 0),
    stretch: (v) => clamp((v - 64) * 2),
    flatten: (v) => clamp(64 + v * 0.5),
  };
  function hist(a, bins = 256) {
    const h = new Array(bins).fill(0);
    for (const v of a.d) h[Math.min(bins - 1, Math.floor((clamp(v) / 256) * bins))]++;
    return h;
  }
  function equalize(a) {
    const h = hist(a), N = a.d.length, lut = []; let c = 0;
    for (let i = 0; i < 256; i++) { c += h[i]; lut[i] = Math.round((c / N) * 255); }
    return map(a, (v) => lut[Math.round(clamp(v))]);
  }

  // ---------- 幾何変換（逆写像） ----------
  // M: 2x3 [[a,b,tx],[c,d,ty]] 中心原点・x右・y上 の座標系（単位: 画素）
  function warp(a, M, bg = 245) {
    const n = a.w, c = n / 2, b = img(n, n, bg);
    const [[p, q, tx], [r, s, ty]] = M;
    const det = p * s - q * r;
    if (Math.abs(det) < 1e-9) return b;
    for (let yi = 0; yi < n; yi++) for (let xi = 0; xi < n; xi++) {
      const X = xi + 0.5 - c, Y = c - (yi + 0.5);
      const u = X - tx, v = Y - ty;
      const x0 = (s * u - q * v) / det, y0 = (-r * u + p * v) / det;
      const sx = Math.floor(x0 + c), sy = Math.floor(c - y0);
      if (sx >= 0 && sy >= 0 && sx < n && sy < n) b.d[yi * n + xi] = a.d[sy * n + sx];
    }
    return b;
  }

  // ---------- 2値・モルフォロジー（配列の配列, 0/1） ----------
  const g2 = (G, x, y) => (y >= 0 && y < G.length && x >= 0 && x < G[0].length ? G[y][x] : 0);
  function dilate(G, se) {
    const H = G.length, W = G[0].length, r = se.length >> 1;
    return G.map((row, y) => row.map((_, x) => {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (se[j + r][i + r] && g2(G, x - i, y - j)) return 1;
      return 0;
    }));
  }
  function erode(G, se) {
    const r = se.length >> 1;
    return G.map((row, y) => row.map((_, x) => {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (se[j + r][i + r] && !g2(G, x + i, y + j)) return 0;
      return 1;
    }));
  }
  const opening = (G, se) => dilate(erode(G, se), se);
  const closing = (G, se) => erode(dilate(G, se), se);
  function label(G, conn = 8) {
    const H = G.length, W = G[0].length, L = G.map((r) => r.map(() => 0));
    let n = 0;
    const nb = conn === 4 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (G[y][x] && !L[y][x]) {
      n++; const st = [[x, y]]; L[y][x] = n;
      while (st.length) {
        const [cx, cy] = st.pop();
        for (const [dx, dy] of nb) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && G[Y][X] && !L[Y][X]) { L[Y][X] = n; st.push([X, Y]); } }
      }
    }
    return { n, L };
  }
  function holes(G, fgConn = 8) {
    // 背景成分のうち外周に接しないもの（背景は前景と逆の連結性）
    const H = G.length, W = G[0].length;
    const P = [Array(W + 2).fill(0), ...G.map((r) => [0, ...r, 0]), Array(W + 2).fill(0)];
    const inv = P.map((r) => r.map((v) => 1 - v));
    return label(inv, fgConn === 8 ? 4 : 8).n - 1;
  }
  const euler = (G, conn = 8) => label(G, conn).n - holes(G, conn);

  // ---------- DFT（振幅スペクトル, 中心化, 対数） ----------
  function spectrum(a) {
    const n = a.w, re = new Float64Array(n * n), im = new Float64Array(n * n);
    const cs = [], sn = [];
    for (let k = 0; k < n; k++) { cs[k] = Math.cos((2 * Math.PI * k) / n); sn[k] = Math.sin((2 * Math.PI * k) / n); }
    const mean = a.d.reduce((p, q) => p + q, 0) / (n * n);
    // 行方向
    const tr = new Float64Array(n * n), ti = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let u = 0; u < n; u++) {
      let sr = 0, si = 0;
      for (let x = 0; x < n; x++) { const v = a.d[y * n + x] - mean * 0.9, k = (u * x) % n; sr += v * cs[k]; si -= v * sn[k]; }
      tr[y * n + u] = sr; ti[y * n + u] = si;
    }
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
      let sr = 0, si = 0;
      for (let y = 0; y < n; y++) { const k = (v * y) % n, r = tr[y * n + u], i = ti[y * n + u]; sr += r * cs[k] + i * sn[k]; si += i * cs[k] - r * sn[k]; }
      re[v * n + u] = sr; im[v * n + u] = si;
    }
    const b = img(n, n); let mx = 0;
    const tmp = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) { tmp[i] = Math.log(1 + Math.hypot(re[i], im[i])); if (tmp[i] > mx) mx = tmp[i]; }
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
      const su = (u + n / 2) % n, sv = (v + n / 2) % n;
      b.d[sv * n + su] = mx ? Math.pow(tmp[v * n + u] / mx, 3) * 255 : 0;
    }
    return { mag: b, re, im };
  }
  function freqFilter(a, kind, cutoff) {
    // 理想/ガウシアンの低域・高域通過（DFT→マスク→逆DFT）。小画像専用（naive）
    const n = a.w; const { re, im } = spectrum2(a);
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
      const fu = u < n / 2 ? u : u - n, fv = v < n / 2 ? v : v - n, D = Math.hypot(fu, fv);
      let H = 1;
      if (kind === 'ilpf') H = D <= cutoff ? 1 : 0;
      if (kind === 'ihpf') H = D <= cutoff ? 0 : 1;
      if (kind === 'glpf') H = Math.exp(-(D * D) / (2 * cutoff * cutoff));
      if (kind === 'ghpf') H = 1 - Math.exp(-(D * D) / (2 * cutoff * cutoff));
      re[v * n + u] *= H; im[v * n + u] *= H;
    }
    return idft(re, im, n, kind.includes('hpf'));
  }
  function spectrum2(a) {
    const n = a.w, re = new Float64Array(n * n), im = new Float64Array(n * n);
    const tr = new Float64Array(n * n), ti = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let u = 0; u < n; u++) { let sr = 0, si = 0; for (let x = 0; x < n; x++) { const t = (-2 * Math.PI * u * x) / n, v = a.d[y * n + x]; sr += v * Math.cos(t); si += v * Math.sin(t); } tr[y * n + u] = sr; ti[y * n + u] = si; }
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) { let sr = 0, si = 0; for (let y = 0; y < n; y++) { const t = (-2 * Math.PI * v * y) / n, c = Math.cos(t), s = Math.sin(t), r = tr[y * n + u], i = ti[y * n + u]; sr += r * c - i * s; si += r * s + i * c; } re[v * n + u] = sr; im[v * n + u] = si; }
    return { re, im };
  }
  function idft(re, im, n, hp) {
    const tr = new Float64Array(n * n), ti = new Float64Array(n * n), b = img(n, n);
    for (let v = 0; v < n; v++) for (let x = 0; x < n; x++) { let sr = 0, si = 0; for (let u = 0; u < n; u++) { const t = (2 * Math.PI * u * x) / n, c = Math.cos(t), s = Math.sin(t), r = re[v * n + u], i = im[v * n + u]; sr += r * c - i * s; si += r * s + i * c; } tr[v * n + x] = sr; ti[v * n + x] = si; }
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { let sr = 0; for (let v = 0; v < n; v++) { const t = (2 * Math.PI * v * y) / n; sr += tr[v * n + x] * Math.cos(t) - ti[v * n + x] * Math.sin(t); } const val = sr / (n * n); b.d[y * n + x] = clamp(hp ? 128 + val * 1.5 : val); }
    return b;
  }

  return { img, clone, clamp, map, scene, addSaltPepper, addGauss, glyphF, stripes, conv, median, maxf, minf, K, meanN, sobelMag, tone, hist, equalize, warp, dilate, erode, opening, closing, label, holes, euler, spectrum, freqFilter };
})();
if (typeof module !== 'undefined') module.exports = IP;
