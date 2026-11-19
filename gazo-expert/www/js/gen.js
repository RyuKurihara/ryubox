// 自動生成問題（毎回数値・図が変わる）
'use strict';
const GEN = (() => {
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmt = (v, d = 2) => { const s = Number(v).toFixed(d); return s.replace(/\.?0+$/, '') || '0'; };
  function build(correct, wrongs, n = 4) {
    const key = (c) => (typeof c === 'string' ? c : c.key || c.text);
    const seen = new Set([key(correct)]), ws = [];
    for (const w of shuffle(wrongs)) { if (ws.length >= n - 1) break; const k = key(w); if (!seen.has(k)) { seen.add(k); ws.push(w); } }
    const all = shuffle([correct, ...ws]);
    return { choices: all, answer: all.indexOf(correct) };
  }
  function numChoices(correct, cands, unit = '', d = 2) {
    const c = fmt(correct, d) + unit;
    const w = cands.filter((x) => isFinite(x) && fmt(x, d) !== fmt(correct, d)).map((x) => fmt(x, d) + unit);
    let k = 1; while (w.length < 6) { w.push(fmt(correct === 0 ? k : correct * (1 + 0.37 * k * (k % 2 ? 1 : -1)), d) + unit); k++; }
    return build(c, w);
  }
  const I = (img, cap) => ({ type: 'img', img, caption: cap });
  const IC = (img, key) => ({ text: '', key, figure: { type: 'img', img } });

  const G = {};

  // ===== 空間フィルタ =====
  const FILTERS = {
    '平均化フィルタ(3×3)': (a) => IP.conv(a, IP.K.mean3),
    '平均化フィルタ(7×7)': (a) => IP.conv(a, IP.meanN(7)),
    'メディアンフィルタ(3×3)': (a) => IP.median(a, 1),
    '最大値フィルタ(5×5)': (a) => IP.maxf(a, 2),
    '最小値フィルタ(5×5)': (a) => IP.minf(a, 2),
    'ソーベルフィルタ(横方向微分・絶対値)': (a) => IP.conv(a, IP.K.sobelX, { abs: true, gain: 0.5 }),
    'ソーベルフィルタ(縦方向微分・絶対値)': (a) => IP.conv(a, IP.K.sobelY, { abs: true, gain: 0.5 }),
    'ラプラシアンフィルタ(絶対値)': (a) => IP.conv(a, IP.K.lap8, { abs: true, gain: 0.7 }),
    '鮮鋭化フィルタ': (a) => IP.conv(a, IP.K.sharpen),
    'エンボスフィルタ': (a) => IP.conv(a, IP.K.emboss, { offset: 128 }),
  };
  const FTERMS = { '平均化': '平均化フィルタ', 'メディアン': 'メディアンフィルタ', '最大値': '最大値フィルタ', '最小値': '最小値フィルタ', 'ソーベル': 'ソーベルフィルタ', 'ラプラシアン': 'ラプラシアンフィルタ', '鮮鋭化': '鮮鋭化', 'エンボス': 'エンボス' };
  const termsFor = (name) => Object.keys(FTERMS).filter((k) => name.includes(k)).map((k) => FTERMS[k]);
  const FEX = {
    '平均化': '平均化は近傍の平均値で置き換えるため全体がぼけ、エッジもなまる（窓が大きいほど強くぼける）。',
    'メディアン': 'メディアンは近傍の中央値で置換。ごま塩ノイズを除去しつつエッジを比較的保存する。',
    '最大値': '最大値フィルタは明るい領域が膨張し、暗い細部（細線・小領域）が消える。',
    '最小値': '最小値フィルタは暗い領域が膨張し、明るい細線や小領域が消える。',
    'ソーベル': 'ソーベルは平滑化を伴う1次微分。横方向微分は縦エッジ、縦方向微分は横エッジに強く反応する。',
    'ラプラシアン': 'ラプラシアンは2次微分。方向によらずエッジの両側に応答し、ノイズにも敏感。',
    '鮮鋭化': '鮮鋭化（原画像−ラプラシアン）はエッジ部のコントラストが強調され、輪郭がくっきりする（オーバーシュート）。',
    'エンボス': 'エンボスは斜め方向の差分＋オフセット128。平坦部は灰色、エッジが浮き彫り状になる。',
  };
  const exFor = (name) => Object.keys(FEX).filter((k) => name.includes(k)).map((k) => FEX[k]).join('');
  G.filterOut = {
    cat: 'filter', title: 'フィルタ適用結果を選ぶ',
    make() {
      const noisy = Math.random() < 0.35;
      const src = noisy ? IP.addSaltPepper(IP.scene(64), 0.08) : IP.scene(64);
      const names = Object.keys(FILTERS);
      const ans = noisy && Math.random() < 0.6 ? 'メディアンフィルタ(3×3)' : pick(names);
      const others = shuffle(names.filter((n) => n !== ans)).filter((n) => !(n.includes('ソーベル') && ans.includes('ソーベル'))).slice(0, 3);
      const items = [ans, ...others].map((n) => ({ text: '', key: n, figure: { type: 'img', img: FILTERS[n](src) }, _n: n }));
      const ch = shuffle(items);
      return {
        style: 'figure', stem: `左の入力画像に **${ans}** を適用した結果として最も適切なものを選べ。${noisy ? '（入力にはごま塩ノイズが含まれる）' : ''}`,
        figure: I(src, '入力画像'), choices: ch, answer: ch.findIndex((c) => c._n === ans),
        explain: `正解は ${ans} の結果。` + exFor(ans) + ' 他の選択肢は ' + ch.filter((c) => c._n !== ans).map((c) => c._n).join('、') + ' の結果である。',
        terms: termsFor(ans),
      };
    },
  };
  G.filterWhich = {
    cat: 'filter', title: '使われたフィルタを当てる',
    make() {
      const noisy = Math.random() < 0.3;
      const src = noisy ? IP.addSaltPepper(IP.scene(64), 0.08) : IP.scene(64);
      const names = Object.keys(FILTERS), ans = pick(names);
      const b = build(ans, names.filter((n) => n !== ans));
      return { style: 'figure', stem: '入力画像（左）にある処理をしたところ右の画像が得られた。用いた処理として最も適切なものを選べ。', figures: [I(src, '入力'), I(FILTERS[ans](src), '出力')], ...b, explain: exFor(ans), terms: termsFor(ans) };
    },
  };
  const KERNELS = [
    { n: '平均化(3×3)', k: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], div: 9, t: '平均化フィルタ' },
    { n: '加重平均(ガウシアン近似)', k: [[1, 2, 1], [2, 4, 2], [1, 2, 1]], div: 16, t: 'ガウシアンフィルタ' },
    { n: 'ソーベル(横方向微分)', k: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], div: 1, t: 'ソーベルフィルタ' },
    { n: 'ソーベル(縦方向微分)', k: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], div: 1, t: 'ソーベルフィルタ' },
    { n: 'プリューウィット(横方向微分)', k: [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]], div: 1, t: 'プリューウィットフィルタ' },
    { n: 'ラプラシアン(4近傍)', k: [[0, 1, 0], [1, -4, 1], [0, 1, 0]], div: 1, t: 'ラプラシアンフィルタ' },
    { n: 'ラプラシアン(8近傍)', k: [[1, 1, 1], [1, -8, 1], [1, 1, 1]], div: 1, t: 'ラプラシアンフィルタ' },
    { n: '鮮鋭化', k: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]], div: 1, t: '鮮鋭化' },
  ];
  G.convCalc = {
    cat: 'filter', title: '3×3フィルタの出力値計算',
    make() {
      const P = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => R(1, 9) * 10));
      const mode = Math.random();
      if (mode < 0.25) {
        const kind = pick(['メディアン', '最大値', '最小値']);
        const flat = P.flat().sort((a, b) => a - b);
        const val = kind === 'メディアン' ? flat[4] : kind === '最大値' ? flat[8] : flat[0];
        const mean = flat.reduce((a, b) => a + b) / 9;
        const b = numChoices(val, [flat[3], flat[5], mean, flat[0], flat[8], P[1][1]], '', 1);
        return { style: 'calc', stem: `図の3×3画素に **${kind}フィルタ(3×3)** を適用したとき、中央画素の出力値はいくらか。`, figure: { type: 'grid', data: P, max: 100, values: true, caption: '入力画素値' }, ...b, explain: `9画素を昇順に並べると ${flat.join(', ')}。${kind}は ${val}。`, terms: [kind + 'フィルタ'] };
      }
      const K = pick(KERNELS);
      let s = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) s += K.k[j][i] * P[j][i];
      const val = s / K.div;
      // 誤答：畳み込み(カーネル反転)、除算忘れ、中心のみ等
      let sf = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) sf += K.k[2 - j][2 - i] * P[j][i];
      const cands = [sf / K.div, s, val + 10, val - 10, -val, P[1][1], val * 2];
      const b = numChoices(val, cands, '', 2);
      return {
        style: 'calc', stem: `図の画素値に、カーネル（係数${K.div > 1 ? '×1/' + K.div : ''}）を**相関演算**（カーネルを反転せずに重ね合わせ、積和をとる）で適用したときの中央画素の出力値を求めよ。（${K.n}）`,
        figures: [{ type: 'grid', data: P, max: 100, values: true, caption: '入力画素値' }, { type: 'matrix', data: K.k, label: (K.div > 1 ? `1/${K.div} ×` : '') }],
        ...b, explain: `対応する画素と係数の積和: ${K.k.flat().map((k, i) => `${k}×${P.flat()[i]}`).join(' + ')} = ${s}${K.div > 1 ? ` を ${K.div} で割って ${fmt(val)}` : ''}。カーネルを180°回転させる畳み込みとして計算すると ${fmt(sf / K.div)} になる（係数が点対称でない微分フィルタで差が出る）。`,
        terms: [K.t, '畳み込み'],
      };
    },
  };

  // ===== 濃淡変換 =====
  const TONES = {
    negative: ['ネガポジ反転', 'ネガポジ反転'], gamma05: ['ガンマ変換(γ=0.5：暗部を持ち上げる)', 'ガンマ変換'], gamma2: ['ガンマ変換(γ=2：暗部を沈める)', 'ガンマ変換'],
    scurve: ['S字トーンカーブ(コントラスト強調)', 'トーンカーブ'], posterize: ['ポスタリゼーション(4階調)', 'ポスタリゼーション'], solarize: ['ソラリゼーション', 'ソラリゼーション'],
    binarize: ['2値化(しきい値128)', '2値化'], stretch: ['線形コントラスト伸張', 'コントラスト'], flatten: ['コントラスト低減', 'トーンカーブ'],
  };
  G.toneOut = {
    cat: 'tone', title: 'トーンカーブと出力画像',
    make() {
      const src = IP.scene(64); const keys = Object.keys(TONES); const ans = pick(keys);
      if (Math.random() < 0.5) {
        const others = shuffle(keys.filter((k) => k !== ans)).slice(0, 3);
        const ch = shuffle([ans, ...others].map((k) => ({ text: '', key: k, _k: k, figure: { type: 'img', img: IP.map(src, IP.tone[k]) } })));
        return { style: 'figure', stem: '入力画像に、図のトーンカーブ（横軸：入力値、縦軸：出力値）による濃淡変換を施した結果を選べ。', figures: [I(src, '入力'), { type: 'curve', f: IP.tone[ans], caption: 'トーンカーブ' }], choices: ch, answer: ch.findIndex((c) => c._k === ans), explain: `このカーブは「${TONES[ans][0]}」。` + ch.filter((c) => c._k !== ans).map((c) => `他は${TONES[c._k][0]}`).join('、') + 'の結果。', terms: [TONES[ans][1], 'トーンカーブ'] };
      }
      const others = shuffle(keys.filter((k) => k !== ans)).slice(0, 3);
      const ch = shuffle([ans, ...others].map((k) => ({ text: '', key: k, _k: k, figure: { type: 'curve', f: IP.tone[k] } })));
      return { style: 'figure', stem: '左の入力画像を右の出力画像に変換したトーンカーブ（横軸：入力、縦軸：出力）として適切なものを選べ。', figures: [I(src, '入力'), I(IP.map(src, IP.tone[ans]), '出力')], choices: ch, answer: ch.findIndex((c) => c._k === ans), explain: `出力は「${TONES[ans][0]}」の特徴を示す。`, terms: [TONES[ans][1], 'トーンカーブ'] };
    },
  };
  G.histWhich = {
    cat: 'tone', title: '処理後のヒストグラム',
    make() {
      const src = IP.scene(64);
      const ops = { 'ネガポジ反転': IP.tone.negative, '線形コントラスト伸張': IP.tone.stretch, 'コントラスト低減': IP.tone.flatten, 'ヒストグラム平坦化': null, '2値化(しきい値128)': IP.tone.binarize };
      const names = Object.keys(ops); const ans = pick(names);
      const res = (n) => (n === 'ヒストグラム平坦化' ? IP.equalize(src) : IP.map(src, ops[n]));
      const others = shuffle(names.filter((n) => n !== ans)).slice(0, 3);
      const ch = shuffle([ans, ...others].map((n) => ({ text: '', key: n, _n: n, figure: { type: 'hist', h: IP.hist(res(n), 64) } })));
      return { style: 'figure', stem: `入力画像とそのヒストグラムを示す。この画像に **${ans}** を施した後のヒストグラムとして適切なものを選べ。`, figures: [I(src, '入力'), { type: 'hist', h: IP.hist(src, 64), caption: '入力のヒストグラム' }], choices: ch, answer: ch.findIndex((c) => c._n === ans), explain: { 'ネガポジ反転': '反転は v→255−v なのでヒストグラムが左右反転する。', '線形コントラスト伸張': '伸張は分布を横に引き伸ばし、端は飽和（0/255に集中）する。', 'コントラスト低減': '分布が中央付近に圧縮される。', 'ヒストグラム平坦化': '累積分布を用いて濃度を再配置し、分布が全域に広がる（ビンの間隔が空くことがある）。', '2値化(しきい値128)': '0と255の2本のみになる。' }[ans], terms: [ans.includes('平坦化') ? 'ヒストグラム平坦化' : 'ヒストグラム'] };
    },
  };
  G.equalizeCalc = {
    cat: 'tone', title: 'ヒストグラム平坦化の計算',
    make() {
      const L = 8; let h; do { h = Array.from({ length: L }, () => R(0, 6)); } while (h.reduce((a, b) => a + b) < 12);
      const N = h.reduce((a, b) => a + b); const lv = R(1, 6); let c = 0; for (let i = 0; i <= lv; i++) c += h[i];
      const val = Math.round((c / N) * (L - 1)); const cprev = c - h[lv];
      const b = numChoices(val, [Math.round((cprev / N) * (L - 1)), Math.floor((c / N) * (L - 1)), lv, val + 1, val - 1, Math.round((h[lv] / N) * (L - 1))].filter((x) => x >= 0 && x < L), '', 0);
      return { style: 'calc', stem: `濃度0〜${L - 1}の8階調画像（総画素数${N}）のヒストグラムを表に示す。変換式 g = round( (累積度数/総画素数) × ${L - 1} ) でヒストグラム平坦化を行うとき、濃度 **${lv}** の画素は何に変換されるか。`, figure: { type: 'table', head: ['濃度', ...h.map((_, i) => i)], rows: [['度数', ...h]] }, ...b, explain: `濃度0〜${lv}の累積度数 = ${h.slice(0, lv + 1).join('+')} = ${c}。${c}/${N}×${L - 1} = ${fmt((c / N) * (L - 1), 3)} → 四捨五入で ${val}。`, terms: ['ヒストグラム平坦化', '累積ヒストグラム'] };
    },
  };

  // ===== 幾何学的変換 =====
  const GEO = [
    { n: '反時計回りに90°回転', M: [[0, -1, 0], [1, 0, 0]] }, { n: '時計回りに90°回転', M: [[0, 1, 0], [-1, 0, 0]] },
    { n: '180°回転', M: [[-1, 0, 0], [0, -1, 0]] }, { n: '左右反転(y軸に関する鏡映)', M: [[-1, 0, 0], [0, 1, 0]] },
    { n: '上下反転(x軸に関する鏡映)', M: [[1, 0, 0], [0, -1, 0]] }, { n: 'x方向へのせん断(スキュー)', M: [[1, 0.6, 0], [0, 1, 0]] },
    { n: 'y方向へのせん断(スキュー)', M: [[1, 0, 0], [0.6, 1, 0]] }, { n: 'x方向に0.5倍の縮小', M: [[0.5, 0, 0], [0, 1, 0]] },
    { n: 'y=x に関する鏡映', M: [[0, 1, 0], [1, 0, 0]] }, { n: '反時計回りに45°回転', M: [[0.7071, -0.7071, 0], [0.7071, 0.7071, 0]] },
    { n: '右に8画素の平行移動', M: [[1, 0, 8], [0, 1, 0]] }, { n: '拡大(1.4倍)', M: [[1.4, 0, 0], [0, 1.4, 0]] },
  ];
  const mtx = (M) => [[M[0][0], M[0][1], M[0][2]], [M[1][0], M[1][1], M[1][2]], [0, 0, 1]].map((r) => r.map((v) => (Math.abs(v - 0.7071) < 1e-3 ? '1/√2' : Math.abs(v + 0.7071) < 1e-3 ? '−1/√2' : v)));
  G.affineOut = {
    cat: 'geo', title: 'アフィン変換の結果を選ぶ',
    make() {
      const src = IP.glyphF(48); const A = pick(GEO);
      const others = shuffle(GEO.filter((g) => g !== A)).slice(0, 3);
      const ch = shuffle([A, ...others].map((g) => ({ text: '', key: g.n, _g: g, figure: { type: 'img', img: IP.warp(src, g.M) } })));
      return { style: 'figure', stem: '座標の原点を画像中心、x軸を右向き、y軸を上向きとする。入力画像の各点 (x, y) を、同次座標で表した変換行列 A により (x′, y′) に移す。出力画像として正しいものを選べ。', figures: [I(src, '入力'), { type: 'matrix', data: mtx(A.M), label: 'A =' }], choices: ch, answer: ch.findIndex((c) => c._g === A), explain: `A は「${A.n}」を表す。点(1,0)→(${fmt(A.M[0][0])}, ${fmt(A.M[1][0])})、点(0,1)→(${fmt(A.M[0][1])}, ${fmt(A.M[1][1])}) と基底ベクトルの行き先を確かめると判別しやすい（行列の第1列・第2列がそれぞれの行き先）。`, terms: ['アフィン変換', '同次座標'] };
    },
  };
  G.affineWhich = {
    cat: 'geo', title: '変換行列を当てる',
    make() {
      const src = IP.glyphF(48); const A = pick(GEO);
      const others = shuffle(GEO.filter((g) => g !== A)).slice(0, 3);
      const ch = shuffle([A, ...others].map((g) => ({ text: '', key: g.n, _g: g, figure: { type: 'matrix', data: mtx(g.M) } })));
      return { style: 'figure', stem: '原点は画像中心、x軸右向き・y軸上向き。入力画像を出力画像に移す同次座標の変換行列として正しいものを選べ。', figures: [I(src, '入力'), I(IP.warp(src, A.M), '出力')], choices: ch, answer: ch.findIndex((c) => c._g === A), explain: `出力は「${A.n}」。行列の第1列は x 方向単位ベクトル、第2列は y 方向単位ベクトルの移り先、第3列は平行移動量。`, terms: ['アフィン変換', '同次座標'] };
    },
  };
  G.compose = {
    cat: 'geo', title: '合成変換の行列',
    make() {
      const tx = R(1, 5), ty = R(1, 5);
      const rots = [{ n: '反時計回りに90°回転', M: [[0, -1], [1, 0]] }, { n: '時計回りに90°回転', M: [[0, 1], [-1, 0]] }, { n: '2倍の拡大', M: [[2, 0], [0, 2]] }, { n: 'x軸に関する鏡映', M: [[1, 0], [0, -1]] }];
      const Rm = pick(rots); const first = Math.random() < 0.5 ? 'R' : 'T';
      const RT = (Rm, t) => [[Rm[0][0], Rm[0][1], t[0]], [Rm[1][0], Rm[1][1], t[1]], [0, 0, 1]];
      const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
      const Rh = RT(Rm.M, [0, 0]), Th = [[1, 0, tx], [0, 1, ty], [0, 0, 1]];
      const correct = first === 'R' ? mul(Th, Rh) : mul(Rh, Th);
      const wrong = first === 'R' ? mul(Rh, Th) : mul(Th, Rh);
      const wrong2 = RT(Rm.M, [-tx, -ty]), wrong3 = RT([[Rm.M[0][0], Rm.M[1][0]], [Rm.M[0][1], Rm.M[1][1]]], [tx, ty]);
      const mk = (M) => ({ text: '', key: JSON.stringify(M), figure: { type: 'matrix', data: M } });
      const c = mk(correct); const b = build(c, [mk(wrong), mk(wrong2), mk(wrong3), mk(RT(Rm.M, [ty, tx]))]);
      const stepTxt = first === 'R' ? `まず原点まわりに「${Rm.n}」を行い、次に (${tx}, ${ty}) だけ平行移動する` : `まず (${tx}, ${ty}) だけ平行移動し、次に原点まわりに「${Rm.n}」を行う`;
      return { style: 'calc', stem: `点を列ベクトル (x, y, 1)ᵀ で表す（x右・y上）。${stepTxt}合成変換の同次座標行列を選べ。`, ...b, explain: `列ベクトル表現では後に行う変換を左から掛ける。${first === 'R' ? 'T·R' : 'R·T'} を計算する。順序を入れ替えた行列（${first === 'R' ? 'R·T' : 'T·R'}）とは平行移動成分が異なり、合成変換は一般に可換でない。`, terms: ['合成変換', '同次座標', 'アフィン変換'] };
    },
  };
  G.interp = {
    cat: 'geo', title: '補間（最近傍・双線形）の計算',
    make() {
      const v = [R(1, 20) * 10, R(1, 20) * 10, R(1, 20) * 10, R(1, 20) * 10]; // f(0,0) f(1,0) f(0,1) f(1,1)
      const dx = pick([0.25, 0.5, 0.75, 0.2, 0.4, 0.6]), dy = pick([0.25, 0.5, 0.75, 0.3, 0.6]);
      const bil = (1 - dx) * (1 - dy) * v[0] + dx * (1 - dy) * v[1] + (1 - dx) * dy * v[2] + dx * dy * v[3];
      const nn = v[(dy >= 0.5 ? 2 : 0) + (dx >= 0.5 ? 1 : 0)];
      const isNN = Math.random() < 0.3;
      const val = isNN ? nn : bil;
      const b = numChoices(val, [bil, nn, (v[0] + v[1] + v[2] + v[3]) / 4, (1 - dy) * (1 - dx) * v[0] + dy * dx * v[3], dx * (1 - dy) * v[0] + (1 - dx) * (1 - dy) * v[1] + dx * dy * v[2] + (1 - dx) * dy * v[3], ...v], '', 2);
      return { style: 'calc', stem: `格子点の画素値が f(0,0)=${v[0]}, f(1,0)=${v[1]}, f(0,1)=${v[2]}, f(1,1)=${v[3]} のとき、点 (x, y)=(${dx}, ${dy}) の値を **${isNN ? '最近傍補間' : '双線形補間'}** で求めよ。`, figure: { type: 'grid', data: [[v[0], v[1]], [v[2], v[3]]], max: 200, values: true, caption: '上段 y=0（左 x=0, 右 x=1）、下段 y=1' }, ...b, explain: isNN ? `最も近い格子点の値をそのまま使う → ${nn}` : `f = (1−x)(1−y)f00 + x(1−y)f10 + (1−x)y f01 + xy f11 = ${fmt((1 - dx) * (1 - dy), 4)}×${v[0]} + ${fmt(dx * (1 - dy), 4)}×${v[1]} + ${fmt((1 - dx) * dy, 4)}×${v[2]} + ${fmt(dx * dy, 4)}×${v[3]} = ${fmt(bil)}`, terms: [isNN ? '最近傍補間' : '双線形補間'] };
    },
  };

  // ===== 2値画像処理 =====
  function randBinary(H = 8, W = 8) {
    const G0 = Array.from({ length: H }, () => Array(W).fill(0));
    const nb = R(2, 4);
    for (let k = 0; k < nb; k++) { const x0 = R(0, W - 3), y0 = R(0, H - 3), w = R(1, 4), h = R(1, 4); for (let y = y0; y < Math.min(H, y0 + h); y++) for (let x = x0; x < Math.min(W, x0 + w); x++) G0[y][x] = 1; }
    for (let k = 0; k < R(1, 3); k++) G0[R(0, H - 1)][R(0, W - 1)] = 1;
    return G0;
  }
  const BG = (data, cap) => ({ type: 'grid', data, max: 1, values: false, caption: cap });
  G.morph = {
    cat: 'binary', title: 'モルフォロジー演算の結果',
    make() {
      const se = pick([[[1, 1, 1], [1, 1, 1], [1, 1, 1]], [[0, 1, 0], [1, 1, 1], [0, 1, 0]]]);
      const seName = se[0][0] ? '3×3の正方形（8近傍）' : '十字形（4近傍）';
      let src, ops = { '膨張(ダイレーション)': IP.dilate, '収縮(エロージョン)': IP.erode, 'オープニング': IP.opening, 'クロージング': IP.closing }, res, names = Object.keys(ops), ans;
      for (let t = 0; t < 30; t++) {
        src = randBinary(); ans = pick(names);
        res = names.map((n) => JSON.stringify(ops[n](src, se)));
        if (new Set([...res, JSON.stringify(src)]).size === 5) break;
      }
      const ch = shuffle(names.map((n) => ({ text: '', key: n, _n: n, figure: BG(ops[n](src, se)) })));
      return { style: 'figure', stem: `2値画像（黒=1：図形）に構造要素 **${seName}** で **${ans}** を施した結果を選べ。画像外は0とする。`, figures: [BG(src, '入力'), BG(se, '構造要素')], choices: ch, answer: ch.findIndex((c) => c._n === ans), explain: '膨張は図形が太り、収縮は細る。オープニング（収縮→膨張）は構造要素より小さい突起・孤立点を除去し、クロージング（膨張→収縮）は小さな穴・すき間を埋める。選択肢はそれぞれ ' + ch.map((c) => c._n).join('／') + ' の結果。', terms: ['膨張', '収縮', 'オープニング', 'クロージング', '構造要素'] };
    },
  };
  G.labelCount = {
    cat: 'binary', title: '連結成分数・オイラー数',
    make() {
      let src, n4, n8;
      for (let t = 0; t < 50; t++) { src = randBinary(7, 7); n4 = IP.label(src, 4).n; n8 = IP.label(src, 8).n; if (n4 !== n8) break; }
      const kind = pick(['n4', 'n8', 'euler8']);
      if (kind === 'euler8') {
        const h = IP.holes(src, 8), e = n8 - h;
        const b = numChoices(e, [n8, n4, n4 - IP.holes(src, 4), n8 + h, -h, e + 1, e - 1], '', 0);
        return { style: 'calc', stem: '図の2値画像（黒=図形）について、図形を**8連結**（背景は4連結）とみなしたときのオイラー数（連結成分数 − 穴の数）を求めよ。', figure: BG(src), ...b, explain: `8連結の連結成分数 ${n8}、穴の数 ${h} → オイラー数 ${e}。`, terms: ['オイラー数', '8連結'] };
      }
      const c = kind === 'n4' ? n4 : n8;
      const b = numChoices(c, [n4, n8, n4 + 1, n8 - 1, n4 + 2], '', 0);
      return { style: 'calc', stem: `図の2値画像（黒=図形）を **${kind === 'n4' ? '4連結' : '8連結'}** でラベリングしたときのラベル（連結成分）数を求めよ。`, figure: BG(src), ...b, explain: `4連結では上下左右のみ、8連結では斜めも連結とみなす。4連結: ${n4}個、8連結: ${n8}個。`, terms: ['ラベリング', kind === 'n4' ? '4連結' : '8連結'] };
    },
  };
  G.dist = {
    cat: 'binary', title: '距離尺度（市街地・チェス盤・ユークリッド）',
    make() {
      const p = [R(0, 9), R(0, 9)], q = [R(0, 9), R(0, 9)]; const dx = Math.abs(p[0] - q[0]), dy = Math.abs(p[1] - q[1]);
      if (dx === 0 && dy === 0) q[0] += 3;
      const d4 = dx + dy, d8 = Math.max(dx, dy), de = Math.hypot(dx, dy);
      const kind = pick(['市街地距離(4近傍距離)', 'チェス盤距離(8近傍距離)', 'ユークリッド距離']);
      const val = kind[0] === '市' ? d4 : kind[0] === 'チ' ? d8 : de;
      const b = numChoices(val, [d4, d8, de, Math.min(dx, dy), d4 + 1, d8 + 1], '', 2);
      return { style: 'calc', stem: `画素 P(${p[0]}, ${p[1]}) と Q(${q[0]}, ${q[1]}) の **${kind}** を求めよ。`, ...b, explain: `|Δx|=${dx}, |Δy|=${dy}。市街地距離 = |Δx|+|Δy| = ${d4}、チェス盤距離 = max(|Δx|,|Δy|) = ${d8}、ユークリッド距離 = √(Δx²+Δy²) = ${fmt(de)}。`, terms: ['距離変換', '市街地距離', 'チェス盤距離'] };
    },
  };

  // ===== 周波数 =====
  G.fourier = {
    cat: 'freq', title: '縞画像とフーリエスペクトル',
    make() {
      const n = 32;
      const cfgs = [[2, 0], [6, 0], [0, 3], [0, 7], [3, 3], [4, -4], [1, 5], [5, 1]];
      const pickc = shuffle(cfgs).slice(0, 4); const ans = pickc[0];
      const src = IP.stripes(n, ans[0], ans[1]);
      if (Math.random() < 0.5) {
        const ch = shuffle(pickc.map((c) => ({ text: '', key: c.join(','), _c: c, figure: { type: 'img', img: IP.spectrum(IP.stripes(n, c[0], c[1])).mag } })));
        return { style: 'figure', stem: '左の正弦波縞画像の2次元フーリエ変換の振幅スペクトル（中心が直流成分、対数表示）として正しいものを選べ。', figure: I(src, '入力'), choices: ch, answer: ch.findIndex((c) => c._c === ans), explain: '正弦波縞のスペクトルは直流成分（中心）に対して点対称な2点となる。点は**縞と直交する方向**に並び、縞が細かい（周波数が高い）ほど中心から遠くなる。', terms: ['フーリエ変換', '振幅スペクトル', '空間周波数'] };
      }
      const ch = shuffle(pickc.map((c) => ({ text: '', key: c.join(','), _c: c, figure: { type: 'img', img: IP.stripes(n, c[0], c[1]) } })));
      return { style: 'figure', stem: '図は、ある画像の振幅スペクトル（中心が直流成分）である。元の画像として正しいものを選べ。', figure: I(IP.spectrum(src).mag, 'スペクトル'), choices: ch, answer: ch.findIndex((c) => c._c === ans), explain: 'スペクトルの2点を結ぶ方向が縞の法線方向（縞の並ぶ方向）、中心からの距離が空間周波数（縞の細かさ）を表す。', terms: ['フーリエ変換', '振幅スペクトル', '空間周波数'] };
    },
  };
  G.freqFilter = {
    cat: 'freq', title: '周波数領域フィルタの結果',
    make() {
      const src = IP.scene(32);
      const ops = { '理想低域通過フィルタ': ['ilpf', 4], 'ガウシアン低域通過フィルタ': ['glpf', 3], '理想高域通過フィルタ': ['ihpf', 4], 'ガウシアン高域通過フィルタ': ['ghpf', 3] };
      const names = Object.keys(ops); const ans = pick(names);
      const ch = shuffle(names.map((n) => ({ text: '', key: n, _n: n, figure: { type: 'img', img: IP.freqFilter(src, ...ops[n]) } })));
      return { style: 'figure', stem: `入力画像に周波数領域で **${ans}** を適用した結果を選べ（高域通過の結果は 128 を 0 として表示）。`, figure: I(src, '入力'), choices: ch, answer: ch.findIndex((c) => c._n === ans), explain: '低域通過はぼけ、高域通過はエッジ（輪郭）が残る。**理想**フィルタは周波数で急峻に遮断するため、空間領域でリンギング（波紋状の偽輪郭）が生じる。ガウシアンは遮断が滑らかでリンギングが生じない。', terms: ['ローパスフィルタ', 'ハイパスフィルタ', 'リンギング', '理想フィルタ'] };
    },
  };

  // ===== 撮影・3次元 =====
  G.stereo = {
    cat: 'd3', title: '平行ステレオの奥行き計算',
    make() {
      const f = pick([800, 1000, 1200, 1500, 600]), B = pick([0.06, 0.1, 0.12, 0.2, 0.3]), d = pick([10, 12, 15, 20, 24, 30, 40, 50]);
      const mode = Math.random();
      if (mode < 0.6) {
        const Z = (f * B) / d;
        const b = numChoices(Z, [(f * d) / B / 1000, (B * d) / f, (f * B) / (2 * d), Z * 2, (f / d) * B * 10, Z / 10], ' m', 3);
        return { style: 'calc', stem: `平行ステレオカメラで、焦点距離 f = ${f} 画素、基線長 B = ${B} m のとき、ある点の視差が d = ${d} 画素であった。この点までの奥行き Z を求めよ。`, ...b, explain: `Z = fB / d = ${f}×${B} / ${d} = ${fmt(Z, 3)} m。視差は奥行きに反比例する。`, terms: ['平行ステレオ', '視差', '基線長'] };
      }
      const Z = (f * B) / d; const dZ = (Z * Z) / (f * B);
      const b = numChoices(dZ, [Z / d, dZ * 2, dZ / 2, Z / f, (Z * Z) / f], ' m', 3);
      return { style: 'calc', stem: `焦点距離 f = ${f} 画素、基線長 B = ${B} m の平行ステレオで、奥行き Z = ${fmt(Z, 3)} m の点について、視差が1画素変化したときの奥行きの変化量（距離分解能の目安 ΔZ ≈ Z²/(fB)）を求めよ。`, ...b, explain: `ΔZ ≈ Z²/(fB) = ${fmt(Z, 3)}² / (${f}×${B}) = ${fmt(dZ, 3)} m。遠いほど（Zの2乗に比例して）分解能が悪化し、基線長や焦点距離を大きくすると改善する。`, terms: ['平行ステレオ', '視差'] };
    },
  };
  G.perspective = {
    cat: 'cam', title: '透視投影の座標計算',
    make() {
      const f = pick([10, 20, 35, 50]), X = R(-20, 20) * 10, Y = R(-20, 20) * 10, Z = pick([500, 1000, 2000, 2500, 4000]);
      const x = (f * X) / Z, y = (f * Y) / Z;
      const c = `(${fmt(x, 3)}, ${fmt(y, 3)})`;
      const w = [`(${fmt((Z * X) / f / 1000, 3)}, ${fmt((Z * Y) / f / 1000, 3)})`, `(${fmt(X / f, 3)}, ${fmt(Y / f, 3)})`, `(${fmt(y, 3)}, ${fmt(x, 3)})`, `(${fmt(-x, 3)}, ${fmt(-y, 3)})`, `(${fmt(x * 2, 3)}, ${fmt(y * 2, 3)})`, `(${fmt(X, 3)}, ${fmt(Y, 3)})`];
      const b = build(c, w);
      return { style: 'calc', stem: `ピンホールカメラモデルで、カメラ座標系の点 (X, Y, Z) = (${X}, ${Y}, ${Z}) [mm] を、焦点距離 f = ${f} mm の画像面（カメラ前方に置いた正立の仮想画像面）に透視投影したときの画像座標 (x, y) [mm] を求めよ。`, ...b, explain: `透視投影 x = fX/Z, y = fY/Z。x = ${f}×${X}/${Z} = ${fmt(x, 3)}, y = ${f}×${Y}/${Z} = ${fmt(y, 3)}。`, terms: ['透視投影', 'ピンホールカメラモデル', '焦点距離'] };
    },
  };
  G.thinlens = {
    cat: 'cam', title: '薄レンズの公式',
    make() {
      const f = pick([25, 35, 50, 80, 100]), a = pick([2, 3, 4, 5, 6]) * f;
      const b0 = (a * f) / (a - f); const m = b0 / a;
      if (Math.random() < 0.6) {
        const b = numChoices(b0, [(a * f) / (a + f), a - f, a + f, f * f / a, b0 * 2], ' mm', 2);
        return { style: 'calc', stem: `焦点距離 f = ${f} mm の薄レンズから a = ${a} mm 離れた物体の像は、レンズからどれだけ離れた位置にできるか（1/a + 1/b = 1/f）。`, ...b, explain: `1/b = 1/f − 1/a = 1/${f} − 1/${a} → b = af/(a−f) = ${fmt(b0)} mm。`, terms: ['薄レンズの公式', '焦点距離'] };
      }
      const b = numChoices(m, [a / b0, f / a, b0 / f, m * 2, 1 / (m * 4)], ' 倍', 3);
      return { style: 'calc', stem: `焦点距離 f = ${f} mm の薄レンズで、レンズから a = ${a} mm の物体を撮影した。像の倍率（像の大きさ／物体の大きさ = b/a）を求めよ。`, ...b, explain: `b = af/(a−f) = ${fmt(b0)} mm。倍率 m = b/a = ${fmt(m, 3)}。`, terms: ['薄レンズの公式'] };
    },
  };
  G.fnumber = {
    cat: 'cam', title: 'F値・露出の計算',
    make() {
      const seq = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
      const i = R(0, 4), k = R(1, 3), F1 = seq[i], F2 = seq[i + k];
      const ratio = Math.pow(2, k);
      const mode = Math.random();
      if (mode < 0.5) {
        const b = numChoices(ratio, [k, 1 / ratio, F2 / F1, ratio * 2, ratio / 2], ' 倍', 3);
        return { style: 'calc', stem: `絞りを F${F1} から F${F2} に絞ったとき、同じ明るさ（露光量）を得るにはシャッタースピード（露光時間）を何倍にすればよいか。`, ...b, explain: `像面照度は (1/F)² に比例。(${F2}/${F1})² ≈ 2^${k} = ${ratio} 倍の露光時間が必要（F値は√2倍ごとに1段＝光量1/2）。`, terms: ['F値', '絞り', '露出'] };
      }
      const t = pick([1 / 125, 1 / 250, 1 / 60]);
      const b = build('被写界深度は深くなり、同じ露出には露光時間を長くする必要がある', ['被写界深度は浅くなり、露光時間を短くできる', '被写界深度は浅くなり、露光時間を長くする必要がある', '被写界深度は変化せず、露光時間のみ短くなる', '被写界深度は深くなり、露光時間を短くできる']);
      return { style: 'text', stem: `F${F1}・1/${Math.round(1 / t)}秒で適正露出の撮影条件から、絞りを F${F2} に変更した。正しい記述を選べ。`, ...b, explain: 'F値を大きくする（絞る）と開口が小さくなり、錯乱円が小さくなるため被写界深度は深くなる。一方、光量は減るため露光時間を長くするかISO感度を上げる必要がある。', terms: ['F値', '被写界深度', '絞り'] };
    },
  };
  G.dataSize = {
    cat: 'code', title: 'データ量・ビットレート計算',
    make() {
      const mode = Math.random();
      if (mode < 0.5) {
        const [W, H] = pick([[640, 480], [1280, 720], [1920, 1080], [800, 600], [1024, 768]]);
        const ch = pick([1, 3]), bits = pick([8, 16]);
        const bytes = (W * H * ch * bits) / 8, MB = bytes / 1e6;
        const b = numChoices(MB, [(W * H * ch * bits) / 1e6, (W * H * bits) / 8 / 1e6, MB * 3, MB / 3, MB / 2], ' MB', 3);
        return { style: 'calc', stem: `${W}×${H}画素、${ch === 1 ? 'グレースケール1チャネル' : 'RGB 3チャネル'}、1チャネルあたり${bits}ビットの非圧縮画像のデータ量はいくらか（1 MB = 10⁶ バイト）。`, ...b, explain: `${W}×${H}×${ch}×${bits}/8 = ${bytes.toLocaleString()} バイト ≈ ${fmt(MB, 3)} MB。`, terms: ['量子化'] };
      }
      const [W, H] = pick([[1920, 1080], [1280, 720], [3840, 2160]]), fps = pick([30, 60]);
      const sub = pick([['4:4:4', 3], ['4:2:2', 2], ['4:2:0', 1.5]]);
      const bps = W * H * sub[1] * 8 * fps, G = bps / 1e9;
      const b = numChoices(G, [W * H * 3 * 8 * fps / 1e9, W * H * 8 * fps / 1e9, G * 2, G / 8, W * H * sub[1] * fps / 1e9], ' Gbps', 3);
      return { style: 'calc', stem: `${W}×${H}画素、${fps}フレーム/秒、各成分8ビット、色差サンプリング ${sub[0]} の非圧縮動画のビットレートを求めよ（1 G = 10⁹）。`, ...b, explain: `${sub[0]} では1画素あたり平均 ${sub[1]} サンプル。${W}×${H}×${sub[1]}×8×${fps} = ${fmt(G, 3)} Gbps。`, terms: ['クロマサブサンプリング', 'ビットレート'] };
    },
  };
  G.entropy = {
    cat: 'code', title: 'エントロピー・ハフマン符号',
    make() {
      const sets = [[0.5, 0.25, 0.125, 0.125], [0.4, 0.3, 0.2, 0.1], [0.5, 0.2, 0.2, 0.1], [0.6, 0.2, 0.1, 0.1], [0.25, 0.25, 0.25, 0.25], [0.4, 0.2, 0.2, 0.1, 0.1]];
      const p = pick(sets); const H = -p.reduce((s, x) => s + x * Math.log2(x), 0);
      // ハフマン符号長
      let nodes = p.map((x, i) => ({ p: x, leaves: [i] })); const len = p.map(() => 0);
      while (nodes.length > 1) { nodes.sort((a, b) => a.p - b.p); const [a, b] = nodes.splice(0, 2); [...a.leaves, ...b.leaves].forEach((i) => len[i]++); nodes.push({ p: a.p + b.p, leaves: [...a.leaves, ...b.leaves] }); }
      const L = p.reduce((s, x, i) => s + x * len[i], 0);
      const sym = 'ABCDE'.slice(0, p.length).split('');
      const tbl = { type: 'table', head: ['記号', ...sym], rows: [['生起確率', ...p]] };
      if (Math.random() < 0.5) {
        const b = numChoices(H, [L, Math.log2(p.length), H + 0.25, H - 0.2, 1], ' ビット', 3);
        return { style: 'calc', stem: '表の生起確率をもつ情報源（各記号は独立）のエントロピー（1記号あたりの平均情報量）を求めよ。', figure: tbl, ...b, explain: `H = −Σ p log₂p = ${fmt(H, 3)} ビット。等確率なら log₂N が最大値。`, terms: ['エントロピー', '情報量'] };
      }
      const b = numChoices(L, [H, Math.log2(p.length), Math.ceil(Math.log2(p.length)), L + 0.3, L - 0.2], ' ビット', 3);
      return { style: 'calc', stem: '表の生起確率をもつ記号をハフマン符号化したときの平均符号長（1記号あたり）を求めよ。', figure: tbl, ...b, explain: `各記号の符号長は ${sym.map((s, i) => `${s}:${len[i]}`).join(', ')}。平均符号長 = Σ pᵢlᵢ = ${fmt(L, 3)} ビット（エントロピー ${fmt(H, 3)} 以上、H+1 未満）。`, terms: ['ハフマン符号', 'エントロピー'] };
    },
  };
  G.colorCalc = {
    cat: 'color', title: '色の計算（輝度・補色・CMY）',
    make() {
      const r = R(0, 25) * 10, g = R(0, 25) * 10, b0 = R(0, 25) * 10;
      const mode = pick(['Y', 'CMY', 'comp']);
      const sw = { type: 'svg', svg: `<svg viewBox='0 0 120 40' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='120' height='40' rx='6' fill='rgb(${r},${g},${b0})'/></svg>`, caption: `(R,G,B)=(${r},${g},${b0})` };
      if (mode === 'Y') {
        const Y = 0.299 * r + 0.587 * g + 0.114 * b0;
        const b = numChoices(Y, [(r + g + b0) / 3, 0.587 * r + 0.299 * g + 0.114 * b0, 0.114 * r + 0.587 * g + 0.299 * b0, Math.max(r, g, b0), Y + 20], '', 1);
        return { style: 'calc', stem: `8ビットRGB値 (R, G, B) = (${r}, ${g}, ${b0}) の輝度 Y を Y = 0.299R + 0.587G + 0.114B で求めよ。`, figure: sw, ...b, explain: `Y = 0.299×${r} + 0.587×${g} + 0.114×${b0} = ${fmt(Y, 1)}。人間の視覚は緑に最も感度が高いため G の重みが最大。`, terms: ['YCbCr', '輝度'] };
      }
      const c = `(${255 - r}, ${255 - g}, ${255 - b0})`;
      const w = [`(${r}, ${g}, ${b0})`, `(${255 - b0}, ${255 - g}, ${255 - r})`, `(${g}, ${b0}, ${r})`, `(${255 - g}, ${255 - b0}, ${255 - r})`, `(${Math.round(255 - (r + g + b0) / 3)}, ${Math.round(255 - (r + g + b0) / 3)}, ${Math.round(255 - (r + g + b0) / 3)})`];
      const bb = build(c, w);
      return mode === 'CMY'
        ? { style: 'calc', stem: `8ビットRGB値 (${r}, ${g}, ${b0}) を、C = 255−R, M = 255−G, Y = 255−B により CMY 値に変換した結果 (C, M, Y) を選べ。`, figure: sw, ...bb, explain: `CMYはRGBの補数。(${255 - r}, ${255 - g}, ${255 - b0})。`, terms: ['CMY', '減法混色'] }
        : { style: 'calc', stem: `RGB値 (${r}, ${g}, ${b0}) の色の補色を、各成分を 255 から引く方法で求めた (R, G, B) を選べ。`, figure: sw, ...bb, explain: `補色は 255 − 各成分 = (${255 - r}, ${255 - g}, ${255 - b0})。加法混色で元の色と足すと白 (255,255,255) になる。`, terms: ['補色', '加法混色'] };
    },
  };
  G.psnr = {
    cat: 'color', title: 'PSNR の計算',
    make() {
      const mse = pick([6.5025, 65.025, 16.256, 26.01, 4.064, 260.1]);
      const p = 10 * Math.log10((255 * 255) / mse);
      const b = numChoices(p, [20 * Math.log10(255 / mse), 10 * Math.log10(255 / mse), p + 3, p - 6, p * 2], ' dB', 1);
      return { style: 'calc', stem: `8ビット画像（最大値255）において、原画像と処理画像の平均二乗誤差 MSE が ${mse} であった。PSNR = 10 log₁₀(255²/MSE) を求めよ。`, ...b, explain: `255² = 65025。65025/${mse} = ${fmt(65025 / mse, 1)}。10log₁₀(…) = ${fmt(p, 1)} dB。MSEが1/10になるとPSNRは10dB上がる。`, terms: ['PSNR', 'MSE'] };
    },
  };
  G.hough = {
    cat: 'detect', title: 'ハフ変換（ρ,θ）',
    make() {
      const th = pick([0, 45, 90, 135]); const rho = th % 90 === 0 ? R(1, 8) : R(1, 6);
      let pts;
      if (th === 0) pts = [[rho, 1], [rho, 5]]; else if (th === 90) pts = [[1, rho], [6, rho]];
      else if (th === 45) { const s = rho * Math.SQRT2; pts = [[0, s], [s, 0]]; } else { const s = rho * Math.SQRT2; pts = [[-s, 0], [0, s]]; }
      const f = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : Math.abs(v / Math.SQRT2 - Math.round(v / Math.SQRT2)) < 1e-6 ? `${Math.round(v / Math.SQRT2)}√2` : fmt(v));
      const c = `ρ = ${rho}, θ = ${th}°`;
      const w = [0, 45, 90, 135].filter((t) => t !== th).map((t) => `ρ = ${rho}, θ = ${t}°`).concat([`ρ = ${rho * 2}, θ = ${th}°`, `ρ = −${rho}, θ = ${th}°`]);
      const b = build(c, w);
      return { style: 'calc', stem: `直線を ρ = x cosθ + y sinθ（0° ≤ θ < 180°）で表す。2点 (${f(pts[0][0])}, ${f(pts[0][1])}) と (${f(pts[1][0])}, ${f(pts[1][1])}) を通る直線のハフ空間上のパラメータを選べ。`, ...b, explain: `ρは原点から直線への垂線の長さ、θはその垂線とx軸のなす角。両点を代入して ${c} が成り立つ。画像空間の1点はハフ空間で正弦曲線になり、同一直線上の点の曲線は1点で交わる。`, terms: ['ハフ変換'] };
    },
  };
  G.match = {
    cat: 'detect', title: 'テンプレートマッチング（SSD/SAD/NCC）',
    make() {
      const T = [[R(1, 9), R(1, 9)], [R(1, 9), R(1, 9)]];
      const cands = [T.map((r) => r.map((v) => v + R(-2, 2))), T.map((r) => r.map((v) => v * 2)), T.map((r) => r.map((v) => v + 4)), T.map((r) => r.map(() => R(1, 9)))];
      const kind = pick(['SSD', 'SAD', 'ZNCC']);
      const flat = (M) => M.flat();
      const ssd = (A) => flat(A).reduce((s, v, i) => s + (v - flat(T)[i]) ** 2, 0);
      const sad = (A) => flat(A).reduce((s, v, i) => s + Math.abs(v - flat(T)[i]), 0);
      const zncc = (A) => { const a = flat(A), t = flat(T); const ma = a.reduce((p, q) => p + q) / 4, mt = t.reduce((p, q) => p + q) / 4; let n = 0, da = 0, dt = 0; for (let i = 0; i < 4; i++) { n += (a[i] - ma) * (t[i] - mt); da += (a[i] - ma) ** 2; dt += (t[i] - mt) ** 2; } return da && dt ? n / Math.sqrt(da * dt) : 0; };
      const sc = cands.map(kind === 'SSD' ? ssd : kind === 'SAD' ? sad : zncc);
      const best = kind === 'ZNCC' ? sc.indexOf(Math.max(...sc)) : sc.indexOf(Math.min(...sc));
      if (sc.filter((s) => Math.abs(s - sc[best]) < 1e-9).length > 1) return G.match.make();
      const names = ['ア', 'イ', 'ウ', 'エ'];
      const choices = names.map((n, i) => ({ text: `候補${i + 1}`, figure: { type: 'grid', data: cands[i], max: 20, values: true } }));
      return { style: 'calc', stem: `テンプレート T に最も類似する候補領域を **${kind}** で判定したとき、選ばれるものはどれか。${kind === 'ZNCC' ? '（ZNCCは値が大きいほど類似）' : '（値が小さいほど類似）'}`, figure: { type: 'grid', data: T, max: 20, values: true, caption: 'テンプレート T' }, choices, answer: best, explain: `各候補の${kind}: ${sc.map((s, i) => `候補${i + 1}=${fmt(s, 3)}`).join(', ')}。ZNCCは平均を引いて正規化するため、明るさの一様な加算（候補3）やコントラストの定数倍（候補2）に影響されず1となる。SSD/SADは画素値の差そのものを見るため明るさ変化に弱い。`, terms: ['テンプレートマッチング', 'SSD', 'SAD', 'ZNCC'] };
    },
  };
  G.cnnSize = {
    cat: 'recog', title: 'CNNの出力サイズ・パラメータ数',
    make() {
      const W = pick([28, 32, 64, 224, 96]), K = pick([3, 5, 7]), S = pick([1, 2]), P = pick([0, 1, 2, 3]);
      if ((W + 2 * P - K) % S !== 0) return G.cnnSize.make();
      const O = (W + 2 * P - K) / S + 1;
      if (Math.random() < 0.6) {
        const b = numChoices(O, [(W - K) / S + 1, (W + P - K) / S + 1, (W + 2 * P - K) / S, W - K + 1, O + 2], '', 0);
        return { style: 'calc', stem: `入力 ${W}×${W}、カーネル ${K}×${K}、ストライド ${S}、パディング ${P} の畳み込み層の出力特徴マップの一辺のサイズを求めよ。`, ...b, explain: `出力 = (W + 2P − K)/S + 1 = (${W} + ${2 * P} − ${K})/${S} + 1 = ${O}。`, terms: ['畳み込みニューラルネットワーク', 'ストライド', 'パディング'] };
      }
      const Cin = pick([1, 3, 16, 32]), Cout = pick([8, 16, 32, 64]);
      const params = K * K * Cin * Cout + Cout;
      const b = numChoices(params, [K * K * Cin * Cout, K * K * Cout + Cout, K * K * Cin + Cout, (K * K * Cin + 1) * Cout * 2, K * Cin * Cout + Cout], '', 0);
      return { style: 'calc', stem: `入力チャネル数 ${Cin}、出力チャネル数 ${Cout}、カーネル ${K}×${K} の畳み込み層（各出力チャネルにバイアス1つ）の学習パラメータ数を求めよ。`, ...b, explain: `重み ${K}×${K}×${Cin}×${Cout} = ${K * K * Cin * Cout}、バイアス ${Cout}。合計 ${params}。入力画像サイズには依存しない（重み共有）。`, terms: ['畳み込みニューラルネットワーク', '畳み込み層'] };
    },
  };
  G.prf = {
    cat: 'recog', title: '適合率・再現率・F値・IoU',
    make() {
      if (Math.random() < 0.3) {
        const a = [R(0, 3), R(0, 3)], A = [a[0], a[1], a[0] + R(3, 6), a[1] + R(3, 6)];
        const B = [A[0] + R(1, 2), A[1] + R(1, 2), 0, 0]; B[2] = B[0] + R(3, 6); B[3] = B[1] + R(3, 6);
        const iw = Math.max(0, Math.min(A[2], B[2]) - Math.max(A[0], B[0])), ih = Math.max(0, Math.min(A[3], B[3]) - Math.max(A[1], B[1]));
        const inter = iw * ih, sA = (A[2] - A[0]) * (A[3] - A[1]), sB = (B[2] - B[0]) * (B[3] - B[1]), uni = sA + sB - inter;
        const v = inter / uni;
        const b = numChoices(v, [inter / sA, inter / sB, inter / (sA + sB), (2 * inter) / (sA + sB)], '', 3);
        return { style: 'calc', stem: `正解矩形 A：左上(${A[0]},${A[1]})〜右下(${A[2]},${A[3]})、検出矩形 B：左上(${B[0]},${B[1]})〜右下(${B[2]},${B[3]})。IoU（共通部分/和集合の面積比）を求めよ。`, ...b, explain: `共通部分 ${iw}×${ih} = ${inter}、A=${sA}、B=${sB}、和集合 = ${sA}+${sB}−${inter} = ${uni}。IoU = ${inter}/${uni} = ${fmt(v, 3)}。（2×共通/(A+B) はDice係数）`, terms: ['IoU'] };
      }
      const TP = R(20, 80), FP = R(5, 40), FN = R(5, 40), TN = R(50, 200);
      const P = TP / (TP + FP), Rc = TP / (TP + FN), F = (2 * P * Rc) / (P + Rc), acc = (TP + TN) / (TP + FP + FN + TN);
      const kind = pick(['適合率', '再現率', 'F値']);
      const val = kind === '適合率' ? P : kind === '再現率' ? Rc : F;
      const b = numChoices(val, [P, Rc, F, acc, TP / (TP + FP + FN), FP / (FP + TN)], '', 3);
      return { style: 'calc', stem: `ある検出器の結果の混同行列を示す。**${kind}** を求めよ。`, figure: { type: 'table', head: ['', '予測:陽性', '予測:陰性'], rows: [['実際:陽性', `TP=${TP}`, `FN=${FN}`], ['実際:陰性', `FP=${FP}`, `TN=${TN}`]] }, ...b, explain: `適合率 = TP/(TP+FP) = ${fmt(P, 3)}、再現率 = TP/(TP+FN) = ${fmt(Rc, 3)}、F値 = 2PR/(P+R) = ${fmt(F, 3)}、正解率 = ${fmt(acc, 3)}。`, terms: ['適合率', '再現率', 'F値', '混同行列'] };
    },
  };
  G.sampling = {
    cat: 'cam', title: '標本化定理・エイリアシング',
    make() {
      const pitch = pick([2, 2.5, 4, 5, 8]); // μm
      const fs = 1000 / pitch; const ny = fs / 2;
      const b = numChoices(ny, [fs, fs / 4, ny * 2 / 3, 1000 / (2 * pitch * 2), pitch / 2], ' 本/mm', 2);
      return { style: 'calc', stem: `画素ピッチ ${pitch} μm のイメージセンサで再現できる最大の空間周波数（ナイキスト周波数）を [本/mm]（=周期/mm）で求めよ。`, ...b, explain: `標本化周波数 fs = 1/${pitch}μm = ${fmt(fs)} 本/mm。ナイキスト周波数は fs/2 = ${fmt(ny)} 本/mm。これを超える成分は折り返し（エイリアシング、モアレ）を生じる。`, terms: ['標本化定理', 'ナイキスト周波数', 'エイリアシング'] };
    },
  };

  const list = Object.entries(G).map(([k, g]) => ({ key: k, cat: g.cat, title: g.title }));
  function make(key) {
    const g = G[key]; const q = g.make();
    return Object.assign({ id: 'gen:' + key, gen: key, cat: g.cat, level: 2, title: g.title }, q);
  }
  return { list, make, keys: Object.keys(G) };
})();
if (typeof module !== 'undefined') module.exports = GEN;
