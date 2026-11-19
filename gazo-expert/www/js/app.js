'use strict';
(() => {
  const D = window.DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const now = () => Date.now();
  const LBL = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク'];
  const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
  const INTERVALS = [0, 10 * MIN, 6 * HOUR, DAY, 2 * DAY, 4 * DAY, 7 * DAY];
  const MASTER_BOX = 3;

  // ---------- データ索引 ----------
  const CAT = Object.fromEntries(D.cats.map((c) => [c.id, c]));
  const TERM = Object.fromEntries(D.terms.map((t) => [t.id, t]));
  const QS = D.questions; const QMAP = Object.fromEntries(QS.map((q) => [q.id, q]));
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・･\-‐–ー—（）()「」『』、,.。:：/]/g, '');
  const NAME = new Map();
  const addName = (n, id, force) => { const k = norm(n); if (k.length >= 2 && (force || !NAME.has(k))) NAME.set(k, id); };
  for (const t of D.terms) {
    addName(t.term, t.id, true);
    const base = t.term.replace(/[（(][^）)]*[）)]/g, ''); addName(base, t.id);
    (t.term.match(/[（(]([^）)]*)[）)]/g) || []).forEach((m) => m.slice(1, -1).split(/[、,／/]/).forEach((x) => addName(x, t.id)));
    if (t.en) addName(t.en, t.id);
    (t.aliases || []).forEach((a) => addName(a, t.id));
  }
  const resCache = new Map();
  function resolve(ref) {
    if (!ref) return null; if (TERM[ref]) return ref;
    if (resCache.has(ref)) return resCache.get(ref);
    const k = norm(ref); let id = NAME.get(k) || null;
    if (!id && k.length >= 3) {
      let best = null, bl = 1e9;
      for (const [n, tid] of NAME) { if ((n.includes(k) || k.includes(n)) && n.length >= 3) { const d = Math.abs(n.length - k.length); if (d < bl) { bl = d; best = tid; } } }
      if (best && bl <= Math.max(3, k.length)) id = best;
    }
    resCache.set(ref, id); return id;
  }
  // 自動リンク用の正規表現（長い順）
  const LINKNAMES = [...new Set(D.terms.flatMap((t) => [t.term, t.term.replace(/[（(][^）)]*[）)]/g, '')]).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  const LINKRE = LINKNAMES.length ? new RegExp(LINKNAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const LINKID = new Map(); D.terms.forEach((t) => { LINKID.set(t.term, t.id); const b = t.term.replace(/[（(][^）)]*[）)]/g, ''); if (!LINKID.has(b)) LINKID.set(b, t.id); });
  function md(s, link = false, self = null) {
    let h = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    if (link && LINKRE) {
      const used = new Set(); if (self) used.add(self);
      h = h.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(LINKRE, (m) => { const id = LINKID.get(m); if (!id || used.has(id)) return m; used.add(id); return `<span class="tl" data-term="${id}">${m}</span>`; }))).join('');
    }
    return h;
  }

  // ---------- 永続化 ----------
  const KEY = 'gx-expert-v1';
  let S = load();
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) {} return { v: 1, q: {}, t: {}, g: {}, log: {}, bm: {}, set: { size: 10, examDate: '' }, hist: [] }; }
  let saveT = 0; function save() { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(S)), 50); }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- SRS ----------
  function rec(store, id) { return store[id] || (store[id] = { n: 0, ok: 0, ng: 0, box: 0, due: 0, last: 0, lastOk: null, mx: 0, lapse: 0 }); }
  function grade(r, correct, sure) {
    r.n++; r.last = now(); r.lastOk = correct;
    if (correct) { r.ok++; if (sure) r.box = Math.min(INTERVALS.length - 1, r.box + 1); else r.box = Math.max(1, Math.min(r.box, 2)); }
    else { r.ng++; if (r.mx >= MASTER_BOX) r.lapse++; r.box = 0; }
    r.mx = Math.max(r.mx, r.box);
    r.due = now() + INTERVALS[r.box];
  }
  function status(r) {
    if (!r || !r.n) return 'new';
    if (r.box >= MASTER_BOX) return r.due < now() ? 'due' : 'mastered';
    if (r.lapse > 0 && r.mx >= MASTER_BOX) return 'forgot';
    if (r.lastOk === false || (r.ng > r.ok)) return 'weak';
    return 'learning';
  }
  const STLABEL = { new: '未学習', weak: '苦手', learning: '学習中', mastered: '習得', forgot: '忘れかけ', due: '要復習' };
  const STPILL = { new: 'gray', weak: 'ng', learning: 'warn', mastered: 'ok', forgot: 'ng', due: '' };
  const tStatus = (id) => status(S.t[id]);
  function logAnswer(correct, cat) {
    const d = today(); const L = S.log[d] || (S.log[d] = { n: 0, ok: 0 }); L.n++; if (correct) L.ok++;
    S.hist.push([now(), cat, correct ? 1 : 0]); if (S.hist.length > 4000) S.hist.splice(0, S.hist.length - 4000);
  }
  function recordTermFromQuestion(ids, correct, sure) {
    for (const id of ids) { const r = rec(S.t, id); if (correct) { r.ok++; r.last = now(); r.lastOk = true; if (sure && r.box < MASTER_BOX - 1) { r.box++; r.mx = Math.max(r.mx, r.box); r.due = now() + INTERVALS[r.box]; } r.n++; } else { grade(r, false, false); } }
  }

  // ---------- 出題アイテム ----------
  // ref: {k:'q',id} | {k:'g',key} | {k:'t2d',id} | {k:'d2t',id}
  function materialize(ref) {
    if (ref.k === 'q') { const q = QMAP[ref.id]; return q ? { ...q, ref } : null; }
    if (ref.k === 'g') { try { return { ...GEN.make(ref.key), ref }; } catch (e) { console.error(e); return null; } }
    const t = TERM[ref.id]; if (!t) return null;
    let pool = D.terms.filter((x) => x.cat === t.cat && x.id !== t.id);
    const rel = (t.related || []).map((r) => TERM[r]).filter((x) => x && x.id !== t.id);
    pool = shuffle([...new Set([...shuffle(rel).slice(0, 2), ...shuffle(pool)])]).slice(0, 3);
    if (pool.length < 3) pool = pool.concat(shuffle(D.terms.filter((x) => x.id !== t.id && !pool.includes(x))).slice(0, 3 - pool.length));
    const all = shuffle([t, ...pool]);
    if (ref.k === 't2d') return { ref, id: 'card:' + t.id, cat: t.cat, style: 'term2def', stem: `「**${t.term}**」の説明として最も適切なものを選べ。`, choices: all.map((x) => x.short), answer: all.indexOf(t), explain: t.short + '\n' + (t.points || []).map((p) => '・' + p).join('\n'), terms: [t.id, ...pool.map((x) => x.id)], termCard: t.id };
    const mask = (s, x) => { let r = s; [x.term, x.term.replace(/[（(][^）)]*[）)]/g, ''), ...(x.term.match(/[（(]([^）)]*)[）)]/g) || []).map((m) => m.slice(1, -1))].filter((n) => n.length >= 2).forEach((n) => { r = r.split(n).join('＿＿'); }); return r; };
    return { ref, id: 'card:' + t.id, cat: t.cat, style: 'def2term', stem: `次の説明に当てはまる用語を選べ。\n「${mask(t.short, t)}」`, choices: all.map((x) => x.term), answer: all.indexOf(t), explain: t.short, terms: [t.id, ...pool.map((x) => x.id)], termCard: t.id };
  }
  const refKey = (ref) => ref.k === 'q' ? 'q:' + ref.id : ref.k === 'g' ? 'g:' + ref.key : 't:' + ref.id;

  // ---------- セッション構築 ----------
  const W = D.weights || {};
  function weightedCats() { return D.cats.map((c) => c.id); }
  function pickN(arr, n) { return shuffle(arr).slice(0, n); }
  function buildSmart(size, cats) {
    const inCat = (c) => !cats || cats.includes(c);
    const t = now(), out = [];
    const qDue = QS.filter((q) => inCat(q.cat) && S.q[q.id] && S.q[q.id].due <= t).sort((a, b) => S.q[a.id].box - S.q[b.id].box || S.q[a.id].due - S.q[b.id].due);
    const tDue = D.terms.filter((x) => inCat(x.cat) && S.t[x.id] && S.t[x.id].n && S.t[x.id].due <= t).sort((a, b) => S.t[a.id].box - S.t[b.id].box);
    const qNew = QS.filter((q) => inCat(q.cat) && !S.q[q.id]);
    const tNew = D.terms.filter((x) => inCat(x.cat) && !(S.t[x.id] && S.t[x.id].n));
    const gens = GEN.list.filter((g) => inCat(g.cat));
    const nGen = gens.length ? Math.max(1, Math.round(size * 0.2)) : 0;
    const nCard = Math.round(size * 0.25);
    const due = [...qDue.slice(0, Math.ceil(size * 0.45)).map((q) => ({ k: 'q', id: q.id })), ...tDue.slice(0, Math.ceil(size * 0.2)).map((x) => ({ k: Math.random() < 0.5 ? 't2d' : 'd2t', id: x.id }))];
    out.push(...due.slice(0, size - nGen));
    // 新規問題は試験配点で重み付け
    const byCat = {}; qNew.forEach((q) => (byCat[q.cat] = byCat[q.cat] || []).push(q));
    const wsum = Object.keys(byCat).reduce((s, c) => s + (W[c] || 5), 0);
    let need = size - out.length - nGen - Math.min(nCard, tNew.length);
    const picks = [];
    while (need > 0 && Object.keys(byCat).length) {
      let r = Math.random() * Object.keys(byCat).reduce((s, c) => s + (W[c] || 5), 0);
      for (const c of Object.keys(byCat)) { r -= W[c] || 5; if (r <= 0) { const arr = byCat[c]; picks.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]); if (!arr.length) delete byCat[c]; break; } }
      need--;
    }
    out.push(...picks.map((q) => ({ k: 'q', id: q.id })));
    out.push(...pickN(tNew, size - out.length - nGen).map((x) => ({ k: Math.random() < 0.6 ? 't2d' : 'd2t', id: x.id })));
    out.push(...pickN(gens, nGen).map((g) => ({ k: 'g', key: g.key })));
    // まだ足りなければ既習から復習
    if (out.length < size) { const rest = QS.filter((q) => inCat(q.cat) && !out.some((o) => o.id === q.id)); out.push(...pickN(rest, size - out.length).map((q) => ({ k: 'q', id: q.id }))); }
    return shuffle(out).slice(0, size);
  }
  function buildWeak(size) {
    const items = [];
    for (const q of QS) { const st = status(S.q[q.id]); if (st === 'weak' || st === 'forgot' || st === 'due') items.push({ k: 'q', id: q.id, p: st === 'forgot' ? 0 : st === 'weak' ? 1 : 2 }); }
    for (const x of D.terms) { const st = tStatus(x.id); if (st === 'weak' || st === 'forgot' || st === 'due') items.push({ k: Math.random() < 0.5 ? 't2d' : 'd2t', id: x.id, p: st === 'forgot' ? 0 : st === 'weak' ? 1 : 2 }); }
    for (const [k, g] of Object.entries(S.g)) if (g.n >= 2 && g.ok / g.n < 0.7) items.push({ k: 'g', key: k, p: 1 });
    return shuffle(items).sort((a, b) => a.p - b.p).slice(0, size);
  }
  const EXAM_SECTIONS = [['ip'], ['cam', 'sys'], ['color'], ['tone', 'filter'], ['filter', 'freq'], ['restore', 'geo'], ['binary', 'region'], ['detect'], ['recog', 'motion'], ['d3', 'code']];
  function buildExam() {
    const out = [];
    EXAM_SECTIONS.forEach((cats, si) => {
      const qs = QS.filter((q) => cats.includes(q.cat));
      const gens = GEN.list.filter((g) => cats.includes(g.cat));
      const nG = si === 0 ? 0 : Math.min(gens.length, 1 + (Math.random() < 0.5 ? 1 : 0));
      const unseenFirst = shuffle(qs).sort((a, b) => (S.q[a.id] ? 1 : 0) - (S.q[b.id] ? 1 : 0));
      const items = [...unseenFirst.slice(0, 5 - nG).map((q) => ({ k: 'q', id: q.id })), ...pickN(gens, nG).map((g) => ({ k: 'g', key: g.key }))];
      items.forEach((it) => (it.sec = si + 1));
      out.push(...items);
    });
    return out;
  }

  // ---------- 状態 ----------
  let SES = null; // {mode,title,queue:[ref],i,results:[],exam,deadline,cur}
  const sheetStack = [];

  // ---------- 図の描画 ----------
  function figHTML(f, cls = '') {
    if (!f) return '';
    const cap = f.caption ? `<div class="cap">${esc(f.caption)}</div>` : '';
    const id = 'f' + Math.random().toString(36).slice(2);
    if (f.type === 'img') { pendingCanvas.push([id, f]); return `<div class="fig ${cls}"><canvas class="pix" id="${id}"></canvas>${cap}</div>`; }
    if (f.type === 'hist') { pendingCanvas.push([id, f]); return `<div class="fig ${cls}"><canvas id="${id}" width="256" height="120" style="width:150px;height:72px;border:1px solid var(--line);border-radius:4px;background:#fff"></canvas>${cap}</div>`; }
    if (f.type === 'curve') {
      let pts = ''; for (let v = 0; v <= 255; v += 3) pts += `${10 + v / 255 * 100},${110 - f.f(v) / 255 * 100} `;
      return `<div class="fig ${cls}"><svg viewBox="0 0 120 120" width="120" height="120" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="100" height="100" fill="#fff" stroke="#999"/><line x1="10" y1="110" x2="110" y2="10" stroke="#ccc" stroke-dasharray="3 3"/><polyline points="${pts}" fill="none" stroke="#3563e9" stroke-width="2.5"/><text x="60" y="119" font-size="8" text-anchor="middle" fill="#666">入力</text><text x="5" y="60" font-size="8" fill="#666" transform="rotate(-90 5 60)" text-anchor="middle">出力</text></svg>${cap}</div>`;
    }
    if (f.type === 'grid') {
      const mx = f.max || 255, bin = mx === 1;
      const rows = (f.data || []).map((r, y) => '<tr>' + r.map((v, x) => {
        let g = bin ? (v ? 30 : 255) : Math.round((Number(v) / mx) * 255); if (!isFinite(g)) g = 255;
        const hl = (f.highlight || []).some(([hy, hx]) => hy === y && hx === x);
        const fg = g < 128 ? '#fff' : '#000';
        return `<td style="background:rgb(${g},${g},${g});color:${fg};${hl ? 'outline:3px solid #e33;outline-offset:-3px' : ''}">${f.values === false || (bin && !f.values) ? '' : esc(v)}</td>`;
      }).join('') + '</tr>').join('');
      return `<div class="fig ${cls}"><table class="gt ${bin ? 'bin' : ''}">${rows}</table>${cap}</div>`;
    }
    if (f.type === 'matrix') {
      const rows = (f.data || []).map((r) => '<tr>' + r.map((v) => `<td>${esc(v)}</td>`).join('') + '</tr>').join('');
      return `<div class="fig ${cls}"><span class="mtxwrap">${f.label ? `<span>${esc(f.label)}</span>` : ''}<span class="br l"></span><table class="mtx">${rows}</table><span class="br r"></span></span>${cap}</div>`;
    }
    if (f.type === 'table') {
      const head = f.head ? '<tr>' + f.head.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr>' : '';
      const rows = (f.rows || []).map((r) => '<tr>' + r.map((v) => `<td>${esc(v)}</td>`).join('') + '</tr>').join('');
      return `<div class="fig ${cls}"><div class="tblwrap"><table class="tb">${head}${rows}</table></div>${cap}</div>`;
    }
    if (f.type === 'svg') {
      const svg = String(f.svg || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
      return `<div class="fig ${cls}">${svg}${cap}</div>`;
    }
    return '';
  }
  let pendingCanvas = [];
  function flushCanvas() {
    for (const [id, f] of pendingCanvas) {
      const c = document.getElementById(id); if (!c) continue;
      if (f.type === 'img') {
        const { w, h, d } = f.img; c.width = w; c.height = h; const ctx = c.getContext('2d'); const im = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, d[i])); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
        ctx.putImageData(im, 0, 0);
      } else if (f.type === 'hist') {
        const ctx = c.getContext('2d'), h = f.h, mx = Math.max(...h) || 1, bw = 256 / h.length;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 120); ctx.fillStyle = '#334';
        h.forEach((v, i) => { const hh = (v / mx) * 112; ctx.fillRect(i * bw, 120 - hh, Math.max(1, bw - 0.5), hh); });
      }
    }
    pendingCanvas = [];
  }
  const figsHTML = (q) => { const fs = [...(q.figure ? [q.figure] : []), ...(q.figures || [])]; return fs.length ? `<div class="figs">${fs.map((f) => figHTML(f)).join('')}</div>` : ''; };

  // ---------- 画面共通 ----------
  const app = $('#app');
  function shell(title, body, opts = {}) {
    app.innerHTML = `<header class="top">${opts.back ? `<button class="icon" data-act="back">←</button>` : ''}<h1>${title}</h1>${opts.right || ''}</header><main>${body}</main>`;
    flushCanvas();
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.t === opts.tab));
    window.scrollTo(0, 0);
  }
  function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 1600); }

  // ---------- ホーム ----------
  function counts() {
    const c = { new: 0, weak: 0, learning: 0, mastered: 0, forgot: 0, due: 0 };
    D.terms.forEach((t) => c[tStatus(t.id)]++);
    const qc = { new: 0, weak: 0, learning: 0, mastered: 0, forgot: 0, due: 0 }; QS.forEach((q) => qc[status(S.q[q.id])]++);
    return { c, qc };
  }
  function dueCount() { const t = now(); return QS.filter((q) => S.q[q.id] && S.q[q.id].due <= t).length + D.terms.filter((x) => S.t[x.id] && S.t[x.id].n && S.t[x.id].due <= t).length; }
  function estScore() {
    // 分野ごと直近20回の正答率（事前分布 0.4 × 3回分）を配点で重み付け
    let tot = 0, ws = 0;
    const per = {};
    for (const c of D.cats) {
      const h = S.hist.filter((x) => x[1] === c.id).slice(-20); const ok = h.reduce((s, x) => s + x[2], 0);
      const acc = (ok + 0.4 * 3) / (h.length + 3); per[c.id] = { acc, n: h.length };
      tot += acc * (W[c.id] || 5); ws += W[c.id] || 5;
    }
    return { score: Math.round((tot / ws) * 100), per };
  }
  function viewHome() {
    const { c, qc } = counts(); const due = dueCount(); const es = estScore();
    const L = S.log[today()] || { n: 0, ok: 0 };
    let days = '';
    if (S.set.examDate) { const dd = Math.ceil((new Date(S.set.examDate) - new Date(today())) / DAY); if (!isNaN(dd)) days = `<div class="sub">試験まで <b style="font-size:18px;color:var(--acc)">${dd}</b> 日</div>`; }
    const weakN = c.weak + c.forgot + qc.weak + qc.forgot;
    shell('画像処理エキスパート特訓', `
      <div class="card"><div class="row"><div style="flex:1"><div class="sub">推定スコア（直近の正答率×配点）</div><div class="big">${es.score}<span style="font-size:15px"> / 100</span></div></div>
      <div style="text-align:right"><div class="sub">今日</div><div class="big" style="font-size:22px">${L.ok}/${L.n}</div>${days}</div></div>
      <div class="bar" style="margin-top:10px"><i style="width:${es.score}%;background:${es.score >= 70 ? 'var(--ok)' : 'var(--warn)'}"></i></div>
      <div class="sub" style="margin-top:4px">合格ライン70 ／ 目標95</div></div>
      <button class="mode" data-go="smart"><span class="ic">⚡</span><span><div class="t">おまかせ ${S.set.size}問</div><div class="d">復習期限・苦手・未習を自動配合（画像生成問題・用語カード込み）</div></span><span class="n">${due ? due + '件期限' : ''}</span></button>
      <button class="mode" data-go="weak"><span class="ic">🎯</span><span><div class="t">弱点・忘れかけ集中</div><div class="d">間違えた／一度覚えたのに忘れた項目だけ</div></span><span class="n">${weakN || ''}</span></button>
      <button class="mode" data-go="exam"><span class="ic">⏱️</span><span><div class="t">模擬試験（10大問・80分）</div><div class="d">本番形式。終了まで正誤を表示しない</div></span></button>
      <div class="grid2">
        <button class="mode" data-href="#/study" style="margin:0"><span class="ic">✏️</span><span><div class="t">分野別</div></span></button>
        <button class="mode" data-href="#/drill" style="margin:0"><span class="ic">🖼️</span><span><div class="t">画像ドリル</div></span></button>
        <button class="mode" data-href="#/cards" style="margin:0"><span class="ic">🃏</span><span><div class="t">用語カード</div></span></button>
        <button class="mode" data-href="#/timeline" style="margin:0"><span class="ic">🕰️</span><span><div class="t">歴史年表</div></span></button>
      </div>
      <div class="card" style="margin-top:12px"><div class="sub" style="margin-bottom:6px">用語 ${D.terms.length}語の理解度</div>${stackBar(c)}${legend(c)}
      <div class="sub" style="margin:10px 0 6px">問題 ${QS.length}問 ＋ 自動生成 ${GEN.list.length}種</div>${stackBar(qc)}${legend(qc)}</div>
      ${SES && !SES.done ? `<button class="btn ghost" data-act="resume">中断中のセッションを再開（${SES.i + 1}/${SES.queue.length}）</button>` : ''}
      <p class="sub" style="text-align:center;margin-top:16px"><a href="#/settings">設定・バックアップ</a></p>`, { tab: 'home' });
  }
  const COLORS = { mastered: 'var(--ok)', due: '#2aa7c9', learning: 'var(--warn)', forgot: '#a24bd6', weak: 'var(--ng)', new: 'var(--line)' };
  function stackBar(c) { const tot = Object.values(c).reduce((a, b) => a + b, 0) || 1; return `<div class="bar" style="height:12px">${['mastered', 'due', 'learning', 'forgot', 'weak', 'new'].map((k) => `<i style="width:${(c[k] / tot) * 100}%;background:${COLORS[k]}"></i>`).join('')}</div>`; }
  function legend(c) { return `<div style="margin-top:6px">${['mastered', 'due', 'learning', 'forgot', 'weak', 'new'].filter((k) => c[k]).map((k) => `<span class="pill ${STPILL[k]}" data-href="#/dict?st=${k}">${STLABEL[k]} ${c[k]}</span>`).join('')}</div>`; }

  // ---------- 演習メニュー ----------
  function viewStudy() {
    const rows = D.cats.map((c) => {
      const qs = QS.filter((q) => q.cat === c.id), seen = qs.filter((q) => S.q[q.id]).length, ms = qs.filter((q) => ['mastered', 'due'].includes(status(S.q[q.id]))).length;
      const ts = D.terms.filter((t) => t.cat === c.id);
      return `<button class="mode" data-go="cat:${c.id}"><span class="ic">${c.icon || '📘'}</span><span style="flex:1;min-width:0"><div class="t">${esc(c.name)}</div><div class="d">問題 ${qs.length}・用語 ${ts.length}・生成 ${GEN.list.filter((g) => g.cat === c.id).length}種</div><div class="bar" style="margin-top:6px"><i style="width:${qs.length ? (ms / qs.length) * 100 : 0}%;background:var(--ok)"></i><i style="width:${qs.length ? ((seen - ms) / qs.length) * 100 : 0}%;background:var(--warn)"></i></div></span></button>`;
    }).join('');
    shell('分野別演習', `<p class="sub">分野を選ぶと、その分野の問題・用語カード・画像生成問題を ${S.set.size} 問ずつ出題します（期限切れ・未習を優先）。</p>${rows}`, { tab: 'study' });
  }
  function viewDrill() {
    const rows = GEN.list.map((g) => { const r = S.g[g.key]; return `<button class="mode" data-go="gen:${g.key}"><span class="ic">${CAT[g.cat]?.icon || '🖼️'}</span><span><div class="t">${esc(g.title)}</div><div class="d">${esc(CAT[g.cat]?.name || '')}</div></span><span class="n">${r ? `${r.ok}/${r.n}` : ''}</span></button>`; }).join('');
    shell('画像処理ドリル', `<p class="sub">毎回数値・画像が変わる自動生成問題。実際に画素計算した結果から出題します。</p><button class="mode" data-go="genall"><span class="ic">🎲</span><span><div class="t">全種ミックス</div></span></button>${rows}`, { back: true, tab: 'study' });
  }
  function viewCards() {
    const rows = D.cats.map((c) => `<button class="mode" data-go="cards:${c.id}"><span class="ic">${c.icon || '📘'}</span><span><div class="t">${esc(c.name)}</div><div class="d">${D.terms.filter((t) => t.cat === c.id).length}語</div></span></button>`).join('');
    shell('用語カード', `<p class="sub">「用語→説明」「説明→用語」の両方向4択。間違えた用語は「苦手」、覚えた用語も期限が来ると再出題されます。</p><button class="mode" data-go="cards:all"><span class="ic">🎲</span><span><div class="t">全分野（未習・期限切れ優先）</div></span></button>${rows}`, { back: true, tab: 'study' });
  }

  // ---------- セッション開始 ----------
  function start(kind) {
    const n = S.set.size; let queue = [], title = '', exam = false;
    if (kind === 'smart') { queue = buildSmart(n); title = 'おまかせ'; }
    else if (kind === 'weak') { queue = buildWeak(Math.max(n, 15)); title = '弱点集中'; if (!queue.length) return toast('苦手な項目はまだありません'); }
    else if (kind === 'exam') { queue = buildExam(); title = '模擬試験'; exam = true; }
    else if (kind.startsWith('cat:')) { const c = kind.slice(4); queue = buildSmart(n, [c]); title = CAT[c].name; }
    else if (kind.startsWith('gen:')) { const k = kind.slice(4); queue = Array.from({ length: n }, () => ({ k: 'g', key: k })); title = '画像ドリル'; }
    else if (kind === 'genall') { queue = Array.from({ length: n }, () => ({ k: 'g', key: GEN.keys[Math.floor(Math.random() * GEN.keys.length)] })); title = '画像ドリル'; }
    else if (kind.startsWith('cards:')) {
      const c = kind.slice(6); const ts = D.terms.filter((t) => c === 'all' || t.cat === c);
      const t0 = now(); const pr = (t) => { const r = S.t[t.id]; if (!r || !r.n) return 1; if (r.due <= t0) return 0; return 2 + r.box; };
      queue = shuffle(ts).sort((a, b) => pr(a) - pr(b)).slice(0, n).map((t) => ({ k: Math.random() < 0.5 ? 't2d' : 'd2t', id: t.id })); title = '用語カード';
    }
    else if (kind.startsWith('term:')) { const id = kind.slice(5); const qs = QS.filter((q) => (q.terms || []).some((r) => resolve(r) === id)); queue = [{ k: 't2d', id }, { k: 'd2t', id }, ...shuffle(qs).slice(0, 8).map((q) => ({ k: 'q', id: q.id }))]; title = TERM[id].term; }
    else if (kind.startsWith('one:')) { queue = [{ k: 'q', id: kind.slice(4) }]; title = '1問'; }
    if (!queue.length) return toast('出題できる問題がありません');
    SES = { kind, title, queue, i: 0, results: [], exam, deadline: exam ? now() + 80 * MIN : 0, cur: null, answered: null, requeued: {} };
    location.hash = '#/quiz'; if (location.hash === '#/quiz') route();
  }

  // ---------- 出題画面 ----------
  let timerT = 0;
  function viewQuiz() {
    if (!SES) return (location.hash = '#/home');
    if (SES.i >= SES.queue.length) return viewResult();
    if (!SES.cur) { SES.cur = materialize(SES.queue[SES.i]); SES.answered = null; SES.sel = null; if (!SES.cur) { SES.i++; return viewQuiz(); } }
    const q = SES.cur, a = SES.answered, ex = SES.exam;
    const isFigChoice = q.choices.some((c) => c && typeof c === 'object' && c.figure);
    const choices = q.choices.map((c, i) => {
      const text = typeof c === 'string' ? c : c.text || '';
      const fig = typeof c === 'object' && c.figure ? figHTML(c.figure) : '';
      let cls = '';
      if (a !== null && !ex) { if (i === q.answer) cls = 'right'; else if (i === a) cls = 'wrong'; }
      else if (ex && SES.sel === i) cls = 'sel';
      return `<button class="choice ${cls}" data-ch="${i}" ${a !== null && !ex ? 'disabled' : ''}><span class="lb">${LBL[i]}</span>${fig}${text ? `<span>${md(text)}</span>` : ''}</button>`;
    }).join('');
    const sec = SES.queue[SES.i].sec;
    let fb = '';
    if (a !== null && !ex) {
      const ok = a === q.answer;
      const termIds = [...new Set((q.terms || []).map((r) => resolve(r)).filter(Boolean))];
      const unresolved = (q.terms || []).filter((r) => !resolve(r));
      fb = `<div class="verdict ${ok ? 'ok' : 'ng'}">${ok ? '◯ 正解' : a === -1 ? '？ わからない' : '× 不正解'}　<span class="sub">正答：${LBL[q.answer]}</span></div>
        <div class="explain">${md(q.explain || '', true)}</div>
        ${termIds.length || unresolved.length ? `<div class="chips"><div class="sub" style="margin-bottom:4px">関連用語（タップで辞書）</div>${termIds.map((id) => `<button class="chip" data-term="${id}"><span class="dot ${tStatus(id)}" style="display:inline-block;margin-right:5px;vertical-align:middle"></span>${esc(TERM[id].term)}</button>`).join('')}${unresolved.map((n) => `<button class="chip" data-search="${esc(n)}">🔍${esc(n)}</button>`).join('')}</div>` : ''}`;
    }
    const prog = `${SES.i + 1} / ${SES.queue.length}`;
    const right = ex ? `<span class="timer sub" id="timer"></span>` : `<button class="icon" data-act="quit" title="終了">✕</button>`;
    const starKey = q.ref.k === 'q' ? q.id : null;
    shell(esc(SES.title) + ' <span class="sub">' + prog + '</span>', `
      <div class="qhead"><span>${sec ? `第${sec}問　` : ''}<span class="pill">${esc(CAT[q.cat]?.name || q.cat)}</span>${q.gen ? '<span class="pill warn">自動生成</span>' : ''}${q.termCard ? '<span class="pill">用語</span>' : ''}${'★'.repeat(q.level || 0) ? `<span class="sub">${'★'.repeat(q.level || 1)}</span>` : ''}</span>${starKey ? `<button class="star" data-bm="${starKey}">${S.bm[starKey] ? '★' : '☆'}</button>` : ''}</div>
      ${q.lead ? `<div class="lead">${md(q.lead)}</div>` : ''}
      <p class="stem">${md(q.stem)}</p>
      ${figsHTML(q)}
      <div class="choices ${isFigChoice ? 'figgrid' : ''}">${choices}</div>
      ${fb}<div class="spacer"></div>`, { right });
    // アクションバー
    let bar = '';
    if (ex) bar = `<button class="btn ghost" data-act="prev" ${SES.i === 0 ? 'disabled' : ''}>← 前</button><button class="btn" data-act="exnext">${SES.i === SES.queue.length - 1 ? '採点する' : '次 →'}</button>`;
    else if (a === null) bar = `<button class="btn ghost" data-act="dunno">わからない（解説を見る）</button>`;
    else if (a !== null) bar = a === q.answer ? `<button class="btn warn" data-act="next:unsure">たまたま／あやふや</button><button class="btn ok" data-act="next:sure">確信あり → 次</button>` : `<button class="btn" data-act="next:wrong">次へ →</button>`;
    if (bar) { const d = document.createElement('div'); d.className = 'actionbar'; d.innerHTML = `<div class="in">${bar}</div>`; $('main').appendChild(d); }
    if (ex) tickTimer();
  }
  function tickTimer() {
    clearTimeout(timerT); const el = $('#timer'); if (!el || !SES || !SES.exam) return;
    const left = Math.max(0, SES.deadline - now()); const m = Math.floor(left / MIN), s = Math.floor((left % MIN) / 1000);
    el.textContent = `残り ${m}:${String(s).padStart(2, '0')}`; if (left <= 0) { finishExam(); return; }
    timerT = setTimeout(tickTimer, 1000);
  }
  function choose(i) {
    if (!SES || !SES.cur) return;
    if (SES.exam) { SES.sel = i; SES.results[SES.i] = { ref: SES.queue[SES.i], q: SES.cur, a: i, ok: i === SES.cur.answer }; viewQuiz(); return; }
    if (SES.answered !== null) return;
    SES.answered = i; viewQuiz();
    const ab = $('.verdict'); if (ab) ab.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function next(how) {
    const q = SES.cur, ok = SES.answered === q.answer, sure = how === 'sure';
    applyResult(q, ok, sure);
    SES.results.push({ ref: SES.queue[SES.i], q, a: SES.answered, ok, sure });
    // 間違えた静的問題・用語は少し後で再出題（1回だけ）
    if (!ok && q.ref.k !== 'g') { const k = refKey(q.ref); if (!SES.requeued[k]) { SES.requeued[k] = 1; const pos = Math.min(SES.queue.length, SES.i + 4); SES.queue.splice(pos, 0, { ...q.ref, k: q.ref.k === 't2d' ? 'd2t' : q.ref.k === 'd2t' ? 't2d' : q.ref.k }); } }
    SES.i++; SES.cur = null; save(); viewQuiz();
  }
  function applyResult(q, ok, sure) {
    const ids = [...new Set((q.terms || []).map((r) => resolve(r)).filter(Boolean))];
    if (q.ref.k === 'q') { grade(rec(S.q, q.id), ok, sure); recordTermFromQuestion(ids, ok, sure); }
    else if (q.ref.k === 'g') { const g = S.g[q.gen] || (S.g[q.gen] = { n: 0, ok: 0 }); g.n++; if (ok) g.ok++; recordTermFromQuestion(ids.slice(0, 2), ok, sure); }
    else { grade(rec(S.t, q.termCard), ok, sure); if (!ok) { const wrongId = ids.find((id) => id !== q.termCard && (q.choices[SES.answered] === TERM[id].short || q.choices[SES.answered] === TERM[id].term)); if (wrongId) { /* 取り違えた用語も弱化 */ const r = rec(S.t, wrongId); if (r.n) { r.box = Math.min(r.box, 1); r.due = now(); } } } }
    logAnswer(ok, q.cat);
  }
  function finishExam() {
    clearTimeout(timerT);
    SES.queue.forEach((ref, i) => { if (!SES.results[i]) SES.results[i] = { ref, q: SES.results[i]?.q || null, a: null, ok: false }; });
    SES.results.forEach((r) => { if (r.q) { SES.answered = r.a; applyResult(r.q, r.ok, r.ok); } });
    SES.i = SES.queue.length; SES.done = true; save(); viewQuiz();
  }
  function viewResult() {
    clearTimeout(timerT);
    const rs = SES.results.filter(Boolean); const ok = rs.filter((r) => r.ok).length; const sc = rs.length ? Math.round((ok / rs.length) * 100) : 0;
    SES.done = true;
    const bySec = {};
    if (SES.exam) rs.forEach((r) => { const s = r.ref.sec; bySec[s] = bySec[s] || [0, 0]; bySec[s][1]++; if (r.ok) bySec[s][0]++; });
    const list = rs.map((r, i) => r.q ? `<div class="termrow" data-review="${i}"><span class="dot ${r.ok ? 'mastered' : 'weak'}"></span><div class="grow"><div class="sh" style="color:var(--fg)">${esc((r.q.stem || '').replace(/\*\*/g, '').slice(0, 60))}</div><div class="sh">${esc(CAT[r.q.cat]?.name || '')}${r.ok && r.sure === false ? '・あやふや' : ''}</div></div><span>${r.ok ? '◯' : '×'}</span></div>` : '').join('');
    shell(SES.exam ? '模擬試験 結果' : '結果', `
      <div class="card" style="text-align:center"><div class="sub">${esc(SES.title)}</div><div class="big" style="font-size:44px;color:${sc >= 70 ? 'var(--ok)' : 'var(--ng)'}">${sc}<span style="font-size:18px">点</span></div><div class="sub">${ok} / ${rs.length} 正解${SES.exam ? (sc >= 70 ? '　合格ライン到達' : '　合格ライン70点') : ''}</div></div>
      ${SES.exam ? `<div class="card">${Object.entries(bySec).map(([s, [o, n]]) => `<div class="catrow"><div class="nm"><span>第${s}問 ${EXAM_SECTIONS[s - 1].map((c) => CAT[c]?.name.split('（')[0]).join('・')}</span><b>${o}/${n}</b></div><div class="bar"><i style="width:${(o / n) * 100}%;background:${o / n >= 0.7 ? 'var(--ok)' : 'var(--ng)'}"></i></div></div>`).join('')}</div>` : ''}
      <div class="grid2" style="margin-bottom:12px"><button class="btn ghost" data-href="#/home">ホーム</button><button class="btn" data-go="${SES.kind}">もう一度</button></div>
      <div class="card"><div class="sub">タップで解説を確認</div>${list}</div>`, {});
  }
  function viewReview(i) {
    const r = SES && SES.results[i]; if (!r || !r.q) return (location.hash = '#/home');
    const q = r.q;
    const choices = q.choices.map((c, j) => { const text = typeof c === 'string' ? c : c.text || ''; const fig = typeof c === 'object' && c.figure ? figHTML(c.figure) : ''; return `<button class="choice ${j === q.answer ? 'right' : j === r.a ? 'wrong' : ''}" disabled><span class="lb">${LBL[j]}</span>${fig}${text ? `<span>${md(text)}</span>` : ''}</button>`; }).join('');
    const termIds = [...new Set((q.terms || []).map((x) => resolve(x)).filter(Boolean))];
    shell('解説', `${q.lead ? `<div class="lead">${md(q.lead)}</div>` : ''}<p class="stem">${md(q.stem)}</p>${figsHTML(q)}<div class="choices ${q.choices.some((c) => c && c.figure) ? 'figgrid' : ''}">${choices}</div>
      <div class="verdict ${r.ok ? 'ok' : 'ng'}">${r.ok ? '◯ 正解' : r.a === null ? '未回答' : '× 不正解'}</div><div class="explain">${md(q.explain || '', true)}</div>
      <div class="chips">${termIds.map((id) => `<button class="chip" data-term="${id}">${esc(TERM[id].term)}</button>`).join('')}</div>`, { back: true });
  }

  // ---------- 辞書 ----------
  let dictState = { q: '', cat: '', st: '' };
  function viewDict(params) {
    if (params.st !== undefined) dictState.st = params.st; if (params.cat !== undefined) dictState.cat = params.cat; if (params.q !== undefined) dictState.q = params.q;
    shell('用語辞書', `
      <input class="search" id="dq" placeholder="用語・読み・英語・説明で検索" value="${esc(dictState.q)}" autocomplete="off">
      <div class="row" style="margin:10px 0;gap:8px">
        <select id="dcat"><option value="">全分野</option>${D.cats.map((c) => `<option value="${c.id}" ${dictState.cat === c.id ? 'selected' : ''}>${esc(c.name.split('（')[0])}</option>`).join('')}</select>
        <select id="dst"><option value="">全状態</option>${Object.entries(STLABEL).map(([k, v]) => `<option value="${k}" ${dictState.st === k ? 'selected' : ''}>${v}</option>`).join('')}<option value="bm" ${dictState.st === 'bm' ? 'selected' : ''}>★ブックマーク</option></select>
        <span class="sub" id="dn"></span>
      </div><div id="dlist"></div>`, { tab: 'dict' });
    const render = () => {
      const k = norm(dictState.q);
      let ts = D.terms.filter((t) => (!dictState.cat || t.cat === dictState.cat) && (!dictState.st || (dictState.st === 'bm' ? S.bm['t:' + t.id] : tStatus(t.id) === dictState.st)));
      if (k) ts = ts.map((t) => { const a = norm(t.term), b = norm(t.reading), c = norm(t.en); const s = a.startsWith(k) || b.startsWith(k) ? 0 : a.includes(k) || b.includes(k) || c.includes(k) ? 1 : norm(t.short + t.def).includes(k) ? 2 : 9; return [s, t]; }).filter(([s]) => s < 9).sort((x, y) => x[0] - y[0]).map(([, t]) => t);
      else ts = ts.slice().sort((a, b) => (a.reading || a.term).localeCompare(b.reading || b.term, 'ja'));
      $('#dn').textContent = ts.length + '語';
      $('#dlist').innerHTML = ts.slice(0, 400).map((t) => `<div class="termrow" data-term="${t.id}"><span class="dot ${tStatus(t.id)}"></span><div class="grow"><div class="nm">${esc(t.term)}</div><div class="sh">${esc(t.short)}</div></div><span class="pill gray">${esc((CAT[t.cat]?.name || '').split('（')[0].slice(0, 6))}</span></div>`).join('');
    };
    render();
    $('#dq').addEventListener('input', (e) => { dictState.q = e.target.value; render(); });
    $('#dcat').addEventListener('change', (e) => { dictState.cat = e.target.value; render(); });
    $('#dst').addEventListener('change', (e) => { dictState.st = e.target.value; render(); });
  }
  function termBody(t) {
    const r = S.t[t.id]; const st = tStatus(t.id);
    const rel = (t.related || []).map((x) => resolve(x)).filter((x) => x && x !== t.id);
    const back = D.terms.filter((x) => x.id !== t.id && (x.related || []).some((y) => resolve(y) === t.id) && !rel.includes(x.id)).slice(0, 12);
    const qn = QS.filter((q) => (q.terms || []).some((y) => resolve(y) === t.id)).length;
    return `
      <div style="margin-bottom:6px"><span class="pill">${esc(CAT[t.cat]?.name || '')}</span><span class="pill ${STPILL[st]}">${STLABEL[st]}</span>${r && r.n ? `<span class="sub">正解 ${r.ok}/${r.n}${r.lapse ? `・忘却 ${r.lapse}回` : ''}</span>` : ''}</div>
      <div class="sub">${esc(t.reading || '')}${t.en ? '　/　' + esc(t.en) : ''}</div>
      <p style="font-weight:700;margin:8px 0">${md(t.short)}</p>
      <div class="tdef sec">${String(t.def || '').split(/\n+/).map((p) => `<p>${md(p, true, t.id)}</p>`).join('')}</div>
      ${t.formula ? `<div class="sec"><h3>式</h3><div class="formula">${esc(t.formula)}</div></div>` : ''}
      ${t.points && t.points.length ? `<div class="sec"><h3>試験のポイント</h3><ul style="margin:0;padding-left:20px">${t.points.map((p) => `<li>${md(p, true, t.id)}</li>`).join('')}</ul></div>` : ''}
      ${t.confuse ? `<div class="sec"><h3>紛らわしい概念との違い</h3><p style="margin:0">${md(t.confuse, true, t.id)}</p></div>` : ''}
      ${t.history ? `<div class="sec"><h3>歴史・いきさつ${t.year ? `（${t.year}）` : ''}</h3><p style="margin:0">${md(t.history, true, t.id)}</p></div>` : ''}
      ${rel.length || back.length ? `<div class="sec"><h3>つながり</h3>${rel.map((id) => `<button class="chip" data-term="${id}"><span class="dot ${tStatus(id)}" style="display:inline-block;margin-right:5px;vertical-align:middle"></span>${esc(TERM[id].term)}</button>`).join('')}${back.map((x) => `<button class="chip" data-term="${x.id}" style="border-style:dashed">${esc(x.term)}</button>`).join('')}</div>` : ''}
      <div class="sec"><h3>自己評価（今この用語を説明できる？）</h3><div class="selfgrade"><button class="btn ng" data-sg="0:${t.id}">説明できない</button><button class="btn warn" data-sg="1:${t.id}">あやふや</button><button class="btn ok" data-sg="2:${t.id}">説明できる</button></div></div>
      <div class="grid2" style="margin-top:10px"><button class="btn ghost" data-go="term:${t.id}">この用語の問題を解く${qn ? `（${qn}）` : ''}</button><button class="btn ghost" data-bm="t:${t.id}">${S.bm['t:' + t.id] ? '★ 登録済み' : '☆ ブックマーク'}</button></div>`;
  }
  function viewTerm(id) {
    const t = TERM[id]; if (!t) return (location.hash = '#/dict');
    shell(esc(t.term), termBody(t), { back: true, tab: 'dict' });
  }
  // 出題中でも文脈を失わずに辞書を開くボトムシート
  function openSheet(id, push = true) {
    const t = TERM[id]; if (!t) return;
    if (push) sheetStack.push(id);
    let bg = $('.sheet-bg');
    if (!bg) { bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(true); }); document.body.appendChild(bg); history.pushState({ sheet: 1 }, ''); }
    bg.innerHTML = `<div class="sheet"><div class="grab"></div><div class="sh-top">${sheetStack.length > 1 ? '<button class="icon" data-act="sheetback" style="background:none;border:0;font-size:20px">←</button>' : ''}<h2>${esc(t.term)}</h2><button class="icon" data-act="sheetclose" style="background:none;border:0;font-size:20px">✕</button></div>${termBody(t)}</div>`;
    bg.querySelector('.sheet').scrollTop = 0;
  }
  function closeSheet(viaUser) { const bg = $('.sheet-bg'); if (bg) { bg.remove(); sheetStack.length = 0; if (viaUser && history.state && history.state.sheet) history.back(); } }

  // ---------- 進捗 ----------
  function viewProgress() {
    const es = estScore();
    const rows = D.cats.map((c) => {
      const ts = D.terms.filter((t) => t.cat === c.id); const cnt = { new: 0, weak: 0, learning: 0, mastered: 0, forgot: 0, due: 0 }; ts.forEach((t) => cnt[tStatus(t.id)]++);
      const p = es.per[c.id];
      return `<div class="catrow" data-href="#/dict?cat=${c.id}&st="><div class="nm"><span>${c.icon || ''} ${esc(c.name.split('（')[0])}</span><span class="sub">正答率 ${p.n ? Math.round(p.acc * 100) + '%' : '—'}（${p.n}回）・配点比 ${W[c.id] || 5}</span></div>${stackBar(cnt)}</div>`;
    }).join('');
    // 14日ヒートマップ
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(now() - i * DAY); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; days.push([k, S.log[k] || { n: 0, ok: 0 }]); }
    const mx = Math.max(1, ...days.map(([, l]) => l.n));
    const forgot = D.terms.filter((t) => tStatus(t.id) === 'forgot'); const weak = D.terms.filter((t) => tStatus(t.id) === 'weak');
    const gstats = Object.entries(S.g).map(([k, g]) => { const m = GEN.list.find((x) => x.key === k); return m ? `<div class="catrow"><div class="nm"><span>${esc(m.title)}</span><b>${g.ok}/${g.n}</b></div><div class="bar"><i style="width:${(g.ok / g.n) * 100}%;background:${g.ok / g.n >= 0.7 ? 'var(--ok)' : 'var(--ng)'}"></i></div></div>` : ''; }).join('');
    shell('進捗', `
      <div class="card"><div class="row"><div style="flex:1"><div class="sub">推定スコア</div><div class="big">${es.score}</div></div><div class="sub" style="text-align:right">総回答 ${S.hist.length}<br>用語習得 ${D.terms.filter((t) => ['mastered', 'due'].includes(tStatus(t.id))).length}/${D.terms.length}</div></div>
      <div class="hm" style="margin-top:10px">${days.map(([k, l]) => `<i title="${k} ${l.ok}/${l.n}" style="background:${l.n ? `rgba(53,99,233,${0.2 + (l.n / mx) * 0.8})` : ''}"></i>`).join('')}</div><div class="sub">直近14日の回答数</div></div>
      ${forgot.length ? `<div class="card"><b>🟣 忘れかけ（一度覚えたのに間違えた）${forgot.length}語</b><div class="chips">${forgot.map((t) => `<button class="chip" data-term="${t.id}">${esc(t.term)}</button>`).join('')}</div></div>` : ''}
      ${weak.length ? `<div class="card"><b>🔴 苦手 ${weak.length}語</b><div class="chips">${weak.slice(0, 60).map((t) => `<button class="chip" data-term="${t.id}">${esc(t.term)}</button>`).join('')}</div></div>` : ''}
      <div class="card"><b>分野別（用語の理解度・タップで一覧）</b>${rows}<div style="margin-top:8px">${legend({ mastered: 1, due: 1, learning: 1, forgot: 1, weak: 1, new: 1 }).replace(/ 1</g, '<')}</div></div>
      ${gstats ? `<div class="card"><b>画像ドリル正答率</b>${gstats}</div>` : ''}`, { tab: 'progress' });
  }
  function viewTimeline() {
    const ts = D.terms.filter((t) => t.year).sort((a, b) => a.year - b.year);
    shell('歴史年表', `<p class="sub">用語辞書から年代のあるものを時系列に。タップで詳細。</p>${ts.map((t) => `<div class="tlitem" data-term="${t.id}"><span class="yr">${t.year}</span><div><b>${esc(t.term)}</b><div class="sub">${esc((t.history || t.short).slice(0, 80))}</div></div></div>`).join('')}`, { back: true });
  }
  function viewSettings() {
    shell('設定・バックアップ', `
      <div class="card"><b>1セッションの問題数</b><div class="row" style="margin-top:8px">${[5, 10, 15, 20, 30].map((n) => `<button class="btn sm ${S.set.size === n ? '' : 'ghost'}" data-size="${n}">${n}</button>`).join('')}</div></div>
      <div class="card"><b>試験日</b><input type="date" id="exd" value="${esc(S.set.examDate || '')}" style="display:block;margin-top:8px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);font-size:16px"></div>
      <div class="card"><b>バックアップ</b><p class="sub">下の文字列をコピーして保存。復元は貼り付けて「読み込む」。</p><textarea id="bk"></textarea><div class="grid2" style="margin-top:8px"><button class="btn ghost" data-act="export">書き出す</button><button class="btn ghost" data-act="import">読み込む</button></div></div>
      <div class="card"><b>データ</b><p class="sub">用語 ${D.terms.length}・問題 ${QS.length}・生成 ${GEN.list.length}種・版 ${esc(D.version || '')}</p><button class="btn ng" data-act="reset">学習記録をリセット</button></div>
      <p class="sub">出典：CG-ARTS『ディジタル画像処理［改訂第二版］』準拠の出題範囲をもとにした独自問題です（過去問の転載ではありません）。</p>`, { back: true });
    $('#exd').addEventListener('change', (e) => { S.set.examDate = e.target.value; save(); toast('保存しました'); });
  }

  // ---------- ルーティング ----------
  function route() {
    const h = location.hash || '#/home';
    const [path, qs] = h.slice(1).split('?'); const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const seg = path.split('/').filter(Boolean);
    closeSheet(false);
    if (seg[0] !== 'quiz') clearTimeout(timerT);
    switch (seg[0]) {
      case 'study': return viewStudy();
      case 'drill': return viewDrill();
      case 'cards': return viewCards();
      case 'dict': return viewDict(params);
      case 'term': return viewTerm(decodeURIComponent(seg[1] || ''));
      case 'progress': return viewProgress();
      case 'timeline': return viewTimeline();
      case 'settings': return viewSettings();
      case 'quiz': return viewQuiz();
      case 'review': return viewReview(+seg[1]);
      case 'q': return start('one:' + decodeURIComponent(seg[1] || ''));
      default: return viewHome();
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', () => { if ($('.sheet-bg')) { const bg = $('.sheet-bg'); bg.remove(); sheetStack.length = 0; } });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-ch],[data-act],[data-go],[data-href],[data-term],[data-search],[data-sg],[data-bm],[data-size],[data-review]');
    if (!el) return;
    const inSheet = !!el.closest('.sheet');
    if (el.dataset.ch !== undefined) return choose(+el.dataset.ch);
    if (el.dataset.term) { e.preventDefault(); if (inSheet || location.hash.startsWith('#/quiz') || location.hash.startsWith('#/review')) return openSheet(el.dataset.term); location.hash = '#/term/' + el.dataset.term; return; }
    if (el.dataset.search) { closeSheet(true); dictState = { q: el.dataset.search, cat: '', st: '' }; location.hash = '#/dict'; return; }
    if (el.dataset.go) { closeSheet(true); return start(el.dataset.go); }
    if (el.dataset.href) { closeSheet(true); location.hash = el.dataset.href; if (el.dataset.href.startsWith('#/dict')) route(); return; }
    if (el.dataset.review !== undefined) { location.hash = '#/review/' + el.dataset.review; return; }
    if (el.dataset.size) { S.set.size = +el.dataset.size; save(); return viewSettings(); }
    if (el.dataset.bm) { const k = el.dataset.bm; S.bm[k] = !S.bm[k]; save(); el.textContent = k.startsWith('t:') ? (S.bm[k] ? '★ 登録済み' : '☆ ブックマーク') : S.bm[k] ? '★' : '☆'; return; }
    if (el.dataset.sg) {
      const [g, id] = el.dataset.sg.split(':'); const r = rec(S.t, id);
      if (g === '0') grade(r, false, false); else if (g === '1') grade(r, true, false); else grade(r, true, true);
      save(); toast(['苦手に登録', 'あやふや：近いうちに再出題', '習得度アップ'][+g]);
      if (inSheet) openSheet(id, false); else viewTerm(id); return;
    }
    const act = el.dataset.act;
    if (act === 'back') { if (history.length > 1) history.back(); else location.hash = '#/home'; }
    else if (act === 'sheetclose') closeSheet(true);
    else if (act === 'sheetback') { sheetStack.pop(); openSheet(sheetStack[sheetStack.length - 1], false); }
    else if (act === 'resume') { location.hash = '#/quiz'; }
    else if (act === 'quit') { if (SES && SES.results.length) { SES.queue = SES.queue.slice(0, SES.i); SES.cur = null; viewQuiz(); } else { SES = null; location.hash = '#/home'; } }
    else if (act && act.startsWith('next:')) next(act.slice(5));
    else if (act === 'dunno') choose(-1);
    else if (act === 'prev') { if (SES.i > 0) { SES.i--; const r = SES.results[SES.i]; SES.cur = r ? r.q : null; SES.sel = r ? r.a : null; viewQuiz(); } }
    else if (act === 'exnext') { if (!SES.results[SES.i]) SES.results[SES.i] = { ref: SES.queue[SES.i], q: SES.cur, a: null, ok: false }; if (SES.i >= SES.queue.length - 1) { if (confirm('採点しますか？')) finishExam(); return; } SES.i++; const r = SES.results[SES.i]; SES.cur = r ? r.q : null; SES.sel = r ? r.a : null; viewQuiz(); }
    else if (act === 'export') { $('#bk').value = JSON.stringify(S); $('#bk').select(); try { navigator.clipboard.writeText($('#bk').value); toast('コピーしました'); } catch (e) {} }
    else if (act === 'import') { try { const s = JSON.parse($('#bk').value); if (s.v !== 1) throw 0; S = s; save(); toast('読み込みました'); } catch (e) { toast('形式が正しくありません'); } }
    else if (act === 'reset') { if (confirm('学習記録をすべて消去します。よろしいですか？')) { localStorage.removeItem(KEY); S = load(); toast('リセットしました'); viewHome(); } }
  });

  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
