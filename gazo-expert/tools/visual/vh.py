# 処理イメージ（content/visual/*.json）生成用のSVGヘルパ
import json, math, os, subprocess, sys, tempfile
import numpy as np

PAL = ['#ffffff', '#e4572e', '#3a86ff', '#2a9d8f', '#f4a261', '#9b5de5', '#f15bb5', '#8ac926', '#ffca3a', '#6a4c93', '#1982c4']
BLUE, RED, GREEN, ORANGE, GRAY = '#3563e9', '#e4572e', '#2a9d8f', '#f4a261', '#999999'


def f(v, d=2):
    """数値を見やすく文字列化"""
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    v = float(v)
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return f"{v:.{d}f}".rstrip('0').rstrip('.')


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def svg(w, h, body):
    return f"<svg viewBox='0 0 {w} {h}' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'>{body}</svg>"


def T(x, y, s, size=10, anchor='middle', fill='#222', weight=None, rot=None):
    wt = f" font-weight='{weight}'" if weight else ''
    tr = f" transform='rotate({rot} {f(x)} {f(y)})'" if rot is not None else ''
    return f"<text x='{f(x)}' y='{f(y)}' font-size='{size}' text-anchor='{anchor}' fill='{fill}'{wt}{tr}>{esc(s)}</text>"


def L(x1, y1, x2, y2, stroke='#333', w=1, dash=None, extra=''):
    d = f" stroke-dasharray='{dash}'" if dash else ''
    return f"<line x1='{f(x1)}' y1='{f(y1)}' x2='{f(x2)}' y2='{f(y2)}' stroke='{stroke}' stroke-width='{w}'{d}{extra}/>"


def R(x, y, w, h, fill='none', stroke='#333', sw=1, extra=''):
    return f"<rect x='{f(x)}' y='{f(y)}' width='{f(w)}' height='{f(h)}' fill='{fill}' stroke='{stroke}' stroke-width='{sw}'{extra}/>"


def C(x, y, r, fill='#333', stroke='none', sw=1):
    return f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(r)}' fill='{fill}' stroke='{stroke}' stroke-width='{sw}'/>"


def P(pts, fill='none', stroke='#333', sw=1.5, closed=True, dash=None, op=None):
    tag = 'polygon' if closed else 'polyline'
    d = f" stroke-dasharray='{dash}'" if dash else ''
    o = f" fill-opacity='{op}'" if op is not None else ''
    s = ' '.join(f"{f(x)},{f(y)}" for x, y in pts)
    return f"<{tag} points='{s}' fill='{fill}' stroke='{stroke}' stroke-width='{sw}'{d}{o}/>"


def arrow(x1, y1, x2, y2, label=None, color='#555', size=10, w=1.5):
    ang = math.atan2(y2 - y1, x2 - x1)
    a1 = (x2 - 6 * math.cos(ang - 0.45), y2 - 6 * math.sin(ang - 0.45))
    a2 = (x2 - 6 * math.cos(ang + 0.45), y2 - 6 * math.sin(ang + 0.45))
    s = L(x1, y1, x2, y2, color, w) + P([(x2, y2), a1, a2], fill=color, stroke=color, sw=1)
    if label:
        s += T((x1 + x2) / 2, min(y1, y2) - 4, label, size, fill=color)
    return s


def gray(v, mx=255):
    g = int(round(max(0, min(1, v / mx)) * 255))
    return f"rgb({g},{g},{g})", ('#fff' if g < 128 else '#000')


def grid(a, x0, y0, cs, mode='bin', values=None, colors=None, hl=None, mx=255, size=None, border='#bbb', hlcolor='#e33', fmt=None):
    """2次元配列をセルとして描画。
    mode='bin': 1=黒, 0=白 / 'gray': 濃淡 / 'label': ラベル色 / 'val': 白地に数値のみ
    values: True なら値を表示、2次元配列なら任意の文字を表示
    hl: [(r,c),...] 赤枠"""
    a = np.asarray(a)
    H, W = a.shape[:2]
    s = []
    size = size or max(8, min(12, int(cs * 0.5)))
    for r in range(H):
        for c in range(W):
            v = a[r, c]
            fg = '#000'
            if colors is not None:
                fill = colors[r][c]
                if fill.startswith('rgb('):
                    rr, gg, bb = [int(t) for t in fill[4:-1].split(',')]
                    fg = '#fff' if 0.299 * rr + 0.587 * gg + 0.114 * bb < 128 else '#000'
                elif fill.startswith('#') and len(fill) == 7:
                    rr, gg, bb = int(fill[1:3], 16), int(fill[3:5], 16), int(fill[5:7], 16)
                    fg = '#fff' if 0.299 * rr + 0.587 * gg + 0.114 * bb < 128 else '#000'
            elif mode == 'bin':
                fill = '#222' if v else '#fff'; fg = '#fff' if v else '#000'
            elif mode == 'gray':
                fill, fg = gray(float(v), mx)
            elif mode == 'label':
                fill = PAL[int(v) % len(PAL)] if v else '#fff'; fg = '#fff' if v else '#999'
            else:
                fill = '#fff'
            s.append(R(x0 + c * cs, y0 + r * cs, cs, cs, fill, border, 0.6))
            txt = None
            if values is True:
                txt = (fmt(v) if fmt else f(v))
                if mode == 'label' and v == 0:
                    txt = '0'
            elif values is not None and not isinstance(values, bool):
                txt = values[r][c]
            if txt not in (None, ''):
                s.append(T(x0 + c * cs + cs / 2, y0 + r * cs + cs / 2 + size * 0.36, txt, size, fill=fg))
    for (r, c) in (hl or []):
        s.append(R(x0 + c * cs + 1, y0 + r * cs + 1, cs - 2, cs - 2, 'none', hlcolor, 2))
    return ''.join(s)


def _tw(s, size):
    """文字列の概算幅（全角=1em, 半角=0.55em）"""
    return sum(size if ord(ch) > 255 else size * 0.55 for ch in str(s))


def panels(items, W=320, cs=None, gap=22, title_size=10, top=14, arrows=None, note=None):
    """items: list of dict(a=array, title=str, mode=..., values=..., hl=..., colors=...)
    横に並べて矢印で結ぶ（パネル幅は各配列の列数に合わせる）。"""
    n = len(items)
    shapes = [np.asarray(it['a']).shape for it in items]
    rows = max(sh[0] for sh in shapes)
    tws = [_tw(it.get('title', ''), title_size) for it in items]
    fixed = cs is not None
    cs = cs or 22.0
    for _ in range(60):
        pws = [max(sh[1] * cs, tw) for sh, tw in zip(shapes, tws)]
        total = sum(pws) + gap * (n - 1)
        if total <= W - 6 or fixed:
            break
        cs *= 0.96
    x = (W - total) / 2
    H = top + rows * cs + 6 + (14 if note else 0)
    body = []
    for i, it in enumerate(items):
        a = np.asarray(it['a'])
        pw = pws[i]
        ox = x + (pw - a.shape[1] * cs) / 2
        oy = top + (rows - a.shape[0]) * cs / 2
        body.append(T(x + pw / 2, oy - 4, it.get('title', ''), title_size))
        body.append(grid(a, ox, oy, cs, it.get('mode', 'bin'), it.get('values'), it.get('colors'), it.get('hl'), it.get('mx', 255), it.get('size')))
        if i < n - 1 and arrows is not False:
            ay = top + rows * cs / 2
            lab = arrows[i] if arrows else None
            body.append(arrow(x + pw + 3, ay, x + pw + gap - 3, ay, None))
            if lab:
                body.append(T(x + pw + gap / 2, ay - 6, lab, 9, fill='#555'))
        x += pw + gap
    if note:
        body.append(T(W / 2, H - 4, note, 10, fill='#444'))
    return svg(W, f(H), ''.join(body))


class Plane:
    """y上向きの数学座標の平面（座標軸・格子付き）"""

    def __init__(self, xr, yr, W=300, H=None, pad=18, ydown=False):
        self.x0, self.x1 = xr
        self.y0, self.y1 = yr
        self.W = W
        self.pad = pad
        self.s = (W - 2 * pad) / (self.x1 - self.x0)
        self.H = H or (pad * 2 + (self.y1 - self.y0) * self.s)
        self.ydown = ydown
        self.b = []

    def X(self, x):
        return self.pad + (x - self.x0) * self.s

    def Y(self, y):
        if self.ydown:
            return self.pad + (y - self.y0) * self.s
        return self.H - self.pad - (y - self.y0) * self.s

    def pt(self, p):
        return (self.X(p[0]), self.Y(p[1]))

    def axes(self, step=1, labels=True, lab_every=1, xl='x', yl='y'):
        b = []
        xs = np.arange(math.ceil(self.x0 / step) * step, self.x1 + 1e-9, step)
        ys = np.arange(math.ceil(self.y0 / step) * step, self.y1 + 1e-9, step)
        for v in xs:
            b.append(L(self.X(v), self.Y(self.y0), self.X(v), self.Y(self.y1), '#e6e6e6', 0.7))
        for v in ys:
            b.append(L(self.X(self.x0), self.Y(v), self.X(self.x1), self.Y(v), '#e6e6e6', 0.7))
        ax0 = min(max(0, self.x0), self.x1)
        ay0 = min(max(0, self.y0), self.y1)
        if self.ydown:
            b.append(arrow(self.X(self.x0), self.Y(ay0), self.X(self.x1) + 6, self.Y(ay0), None, '#444', w=1))
            b.append(arrow(self.X(ax0), self.Y(self.y0), self.X(ax0), self.Y(self.y1) + 6, None, '#444', w=1))
            b.append(T(self.X(self.x1) + 8, self.Y(ay0) - 4, xl, 10, 'end'))
            b.append(T(self.X(ax0) + 8, self.Y(self.y1) + 4, yl, 10, 'start'))
        else:
            b.append(arrow(self.X(self.x0), self.Y(ay0), self.X(self.x1) + 6, self.Y(ay0), None, '#444', w=1))
            b.append(arrow(self.X(ax0), self.Y(self.y0), self.X(ax0), self.Y(self.y1) - 6, None, '#444', w=1))
            b.append(T(self.X(self.x1) + 2, self.Y(ay0) - 4, xl, 10, 'start'))
            b.append(T(self.X(ax0) + 6, self.Y(self.y1) - 2, yl, 10, 'start'))
        if labels:
            for i, v in enumerate(xs):
                if abs(v) > 1e-9 and i % lab_every == 0:
                    b.append(T(self.X(v), self.Y(ay0) + (11 if not self.ydown else -3), f(v), 9, fill='#777'))
            for i, v in enumerate(ys):
                if abs(v) > 1e-9 and i % lab_every == 0:
                    b.append(T(self.X(ax0) - 3, self.Y(v) + 3, f(v), 9, 'end', fill='#777'))
            b.append(T(self.X(ax0) - 3, self.Y(ay0) + 11, '0', 9, 'end', fill='#777'))
        self.b = b + self.b
        return self

    def poly(self, pts, fill='none', stroke=BLUE, sw=1.5, closed=True, dash=None, op=None):
        self.b.append(P([self.pt(p) for p in pts], fill, stroke, sw, closed, dash, op))
        return self

    def dot(self, p, r=2.8, color=RED, label=None, dx=4, dy=-4, size=9, anchor='start'):
        x, y = self.pt(p)
        self.b.append(C(x, y, r, color))
        if label:
            self.b.append(T(x + dx, y + dy, label, size, anchor, fill=color))
        return self

    def line(self, p, q, color='#555', w=1, dash=None):
        self.b.append(L(*self.pt(p), *self.pt(q), color, w, dash))
        return self

    def arrow(self, p, q, color='#555', label=None):
        self.b.append(arrow(*self.pt(p), *self.pt(q), label, color))
        return self

    def text(self, p, s, size=10, anchor='middle', fill='#222'):
        x, y = self.pt(p)
        self.b.append(T(x, y, s, size, anchor, fill))
        return self

    def raw(self, s):
        self.b.append(s)
        return self

    def svg(self):
        return svg(f(self.W), f(self.H), ''.join(self.b))


def chart(series, W=320, H=170, xr=None, yr=None, xlabel='', ylabel='', bars=None, vlines=None, title=None, xticks=None, yticks=None, legend=None, left=34, bottom=26, top=None, bar_colors=None):
    """折れ線/棒グラフ。series: [(xs, ys, color, dash, label)]、bars: (xs, ys, color)"""
    top = top if top is not None else (18 if title else 10)
    right = 10
    allx, ally = [], []
    for s in series:
        allx += list(s[0]); ally += list(s[1])
    if bars:
        allx += list(bars[0]); ally += list(bars[1])
    xr = xr or (min(allx), max(allx))
    yr = yr or (min(0, min(ally)), max(ally) * 1.08)
    pw, ph = W - left - right, H - top - bottom
    X = lambda x: left + (x - xr[0]) / (xr[1] - xr[0]) * pw
    Y = lambda y: top + ph - (y - yr[0]) / (yr[1] - yr[0]) * ph
    b = [R(left, top, pw, ph, '#fff', '#bbb', 0.8)]
    if bars:
        xs, ys = list(bars[0]), list(bars[1])
        bw = pw / ((xr[1] - xr[0]) / (xs[1] - xs[0]) if len(xs) > 1 else 10) * 0.8 if len(xs) > 1 else 10
        for i, (x, y) in enumerate(zip(xs, ys)):
            col = bar_colors[i] if bar_colors else bars[2]
            b.append(R(X(x) - bw / 2, Y(y), bw, Y(yr[0]) - Y(y), col, 'none', 0))
    for s in series:
        xs, ys, col = s[0], s[1], s[2]
        dash = s[3] if len(s) > 3 else None
        b.append(P([(X(x), Y(y)) for x, y in zip(xs, ys)], 'none', col, 1.8, False, dash))
    for v in (vlines or []):
        x, col, lab = v
        b.append(L(X(x), top, X(x), top + ph, col, 1.3, '4 3'))
        if lab:
            b.append(T(X(x) + 2, top + 11, lab, 10, 'start', fill=col))
    for t in (xticks or []):
        tv, tl = (t if isinstance(t, tuple) else (t, f(t)))
        b.append(L(X(tv), top + ph, X(tv), top + ph + 3, '#777'))
        b.append(T(X(tv), top + ph + 12, tl, 9, fill='#555'))
    for t in (yticks or []):
        tv, tl = (t if isinstance(t, tuple) else (t, f(t)))
        b.append(L(left - 3, Y(tv), left, Y(tv), '#777'))
        b.append(T(left - 5, Y(tv) + 3, tl, 9, 'end', fill='#555'))
    if xlabel:
        b.append(T(left + pw / 2, H - 3, xlabel, 10, fill='#444'))
    if ylabel:
        b.append(T(10, top + ph / 2, ylabel, 10, fill='#444', rot=-90))
    if title:
        b.append(T(W / 2, 12, title, 11, weight='bold'))
    if legend:
        lx = left + 6
        for (lab, col) in legend:
            b.append(L(lx, top + 9, lx + 14, top + 9, col, 2) + T(lx + 17, top + 12, lab, 9, 'start', fill='#333'))
            lx += 22 + len(lab) * 9
    return svg(W, H, ''.join(b))


def boxes(items, W=320, H=None, size=10):
    """フローチャート風: items=[(x,y,w,h,text,fill)], 文字は'\n'で改行"""
    b = []
    for (x, y, w, h, t, fill) in items:
        b.append(R(x, y, w, h, fill, '#555', 1, " rx='5'"))
        lines = t.split('\n')
        for i, ln in enumerate(lines):
            b.append(T(x + w / 2, y + h / 2 + (i - (len(lines) - 1) / 2) * (size + 2) + size * 0.35, ln, size))
    return ''.join(b)


# ---------- 検証・書き出し ----------
def run_code(code, timeout=60):
    with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False) as fp:
        fp.write(code)
        name = fp.name
    try:
        r = subprocess.run([sys.executable, name], capture_output=True, text=True, timeout=timeout, cwd=tempfile.gettempdir())
        return r.returncode, r.stdout, r.stderr
    finally:
        os.unlink(name)


def finalize(cat, entries, run=True, only=None):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    terms = json.load(open(os.path.join(root, 'content/terms', f'{cat}.json')))
    ids = [t['id'] for t in terms]
    got = [e['id'] for e in entries]
    bad = [i for i in got if i not in ids]
    missing = [i for i in ids if i not in got]
    dup = sorted({i for i in got if got.count(i) > 1})
    print(cat, 'entries', len(entries), '/', len(ids), 'bad', bad, 'missing', missing, 'dup', dup)
    for e in entries:
        assert 3 <= len(e['steps']) <= 6, (e['id'], len(e['steps']))
        assert 1 <= len(e['figures']) <= 2, (e['id'], len(e['figures']))
        for fg in e['figures']:
            if fg['type'] == 'svg':
                assert '"' not in fg['svg'], e['id']
                import re
                vb = re.search(r"viewBox='0 0 ([\d.]+) ([\d.]+)'", fg['svg'])
                assert vb and 240 <= float(vb.group(1)) <= 340, (e['id'], vb and vb.group(1))
        if run and e.get('code') and (only is None or e['id'] in only):
            n = e['code'].count('\n') + 1
            if not (6 <= n <= 30):
                print('  code lines', e['id'], n)
            rc, out, err = run_code(e['code'])
            if rc != 0:
                print('  CODE FAIL', e['id'], err.strip().splitlines()[-3:])
            elif os.environ.get('SHOW'):
                print('  ok', e['id'], out.strip()[:300].replace('\n', ' | '))
    order = {i: k for k, i in enumerate(ids)}
    entries = sorted(entries, key=lambda e: order.get(e['id'], 9999))
    out = os.path.join(root, 'content/visual', f'{cat}.json')
    with open(out, 'w', encoding='utf-8') as fp:
        json.dump(entries, fp, ensure_ascii=False, indent=1)
    print('wrote', out)
