// content/*.json を検証・統合して www/js/data.js を生成
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cats = [
  ['ip', '知的財産権', '⚖️', 8], ['cam', 'ディジタル画像の撮影', '📷', 7], ['color', '画像の性質と色空間・視覚', '🎨', 7],
  ['tone', '画素ごとの濃淡変換', '🌗', 6], ['filter', '空間フィルタリング', '🧮', 10], ['freq', '周波数領域の処理', '〰️', 7],
  ['restore', '画像の復元と生成', '🩹', 5], ['geo', '幾何学的変換', '📐', 8], ['binary', '2値画像処理', '⬛', 7],
  ['region', '領域処理', '🧩', 5], ['detect', '検出とマッチング', '🔍', 8], ['recog', 'パターン認識・深層学習', '🧠', 9],
  ['d3', '3次元復元・光学的解析', '🧊', 8], ['motion', '動画像処理', '🎞️', 5], ['code', '画像符号化・圧縮', '🗜️', 6], ['sys', '画像処理システム', '🖥️', 3],
];
const read = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().flatMap((f) => {
  try { const a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { console.error('JSON ERROR', f, e.message); return []; }
}) : [];
let terms = read(path.join(root, 'content/terms')), qs = read(path.join(root, 'content/questions'));
const ALIAS = {
  'tone-false-contour': ['擬似輪郭'], 'filter-canny': ['Canny法', 'キャニーのエッジ検出'], 'cam-distortion': ['樽型歪み', '樽型歪曲', '糸巻き型歪曲', 'たる型歪曲', '糸巻き型歪み'],
  'detect-scale-space': ['スケールスペース'], 'recog-pca': ['KL変換', 'カルーネン・レーベ変換'], 'color-hsv': ['HSV色空間', 'HSV表色系'], 'color-lab': ['L*a*b*表色系', 'CIELAB'],
  'color-display-gamma': ['ガンマ特性'], 'detect-cascade': ['カスケード識別器'], 'recog-kmeans': ['k平均法'], 'geo-scaling': ['画像の縮小', '画像の拡大'],
  'cam-fisheye': ['全方位カメラ'], 'tone-pseudo-color': ['フォールスカラー'], 'cam-mtf': ['周波数特性'], 'ip-typeface': ['アウトラインフォント'],
};
const errs = [];
const tid = new Set(); terms = terms.filter((t) => { if (!t.id || !t.term || !t.short) { errs.push('term missing field ' + (t.id || t.term)); return false; } if (tid.has(t.id)) { errs.push('dup term ' + t.id); return false; } tid.add(t.id); return true; });
// 処理イメージ（content/visual）を用語に合流
const vis = read(path.join(root, 'content/visual')); const tmap = Object.fromEntries(terms.map((t) => [t.id, t])); let vOK = 0;
vis.forEach((v) => { const t = tmap[v.id]; if (!t) { errs.push('visual unknown id ' + v.id); return; } t.vis = { steps: v.steps, figures: v.figures, example: v.example, code: v.code }; vOK++; });
console.log('visual entries', vOK);
terms.forEach((t) => { if (ALIAS[t.id]) t.aliases = [...(t.aliases || []), ...ALIAS[t.id]]; });
const qid = new Set(); qs = qs.filter((q) => {
  if (!q.id || !q.stem || !Array.isArray(q.choices) || q.choices.length < 2) { errs.push('q bad ' + q.id); return false; }
  if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length)) { errs.push('q answer ' + q.id); return false; }
  if (qid.has(q.id)) { errs.push('dup q ' + q.id); return false; } qid.add(q.id); return true;
});
// 参照解決の簡易チェック
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・･\-‐–ー—（）()「」『』、,.。:：/]/g, '');
const names = new Map(); terms.forEach((t) => { names.set(norm(t.term), t.id); names.set(norm(t.term.replace(/[（(][^）)]*[）)]/g, '')), t.id); (t.term.match(/[（(]([^）)]*)[）)]/g) || []).forEach((m) => names.set(norm(m.slice(1, -1)), t.id)); if (t.en) names.set(norm(t.en), t.id); (t.aliases || []).forEach((a) => names.set(norm(a), t.id)); });
const res = (r) => tid.has(r) || names.has(norm(r)) || [...names.keys()].some((n) => n.length >= 3 && (n.includes(norm(r)) || norm(r).includes(n)));
let unres = new Map(); const bump = (r) => unres.set(r, (unres.get(r) || 0) + 1);
terms.forEach((t) => (t.related || []).forEach((r) => !res(r) && bump(r)));
qs.forEach((q) => (q.terms || []).forEach((r) => !res(r) && bump(r)));
const data = { version: new Date().toISOString().slice(0, 10), cats: cats.map(([id, name, icon]) => ({ id, name, icon })), weights: Object.fromEntries(cats.map(([id, , , w]) => [id, w])), terms, questions: qs };
fs.writeFileSync(path.join(root, 'www/js/data.js'), 'window.DATA=' + JSON.stringify(data) + ';\n');
const by = (arr) => Object.fromEntries(cats.map(([c]) => [c, arr.filter((x) => x.cat === c).length]));
console.log('terms', terms.length, by(terms)); console.log('questions', qs.length, by(qs));
console.log('errors', errs.length, errs.slice(0, 30));
console.log('unresolved refs', unres.size, [...unres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => k + '×' + v).join(', '));
