import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
import cv2
from vh import *
from binlib import A, label, trace, moments, perim_chain, DIRS8, dil, ero

E = []


def gfig(s, cap):
    return {"type": "svg", "svg": s, "caption": cap}


def lcol(L):
    return [[(PAL[int(v) % len(PAL)] if v else '#fff') for v in r] for r in L]


# ---------------- 領域分割 ----------------
SEG = np.array([
    [20, 22, 25, 24, 120, 125, 122, 118],
    [21, 23, 26, 25, 121, 128, 124, 119],
    [22, 24, 27, 26, 123, 126, 127, 121],
    [24, 25, 28, 27, 124, 125, 126, 120],
    [200, 205, 202, 26, 25, 122, 124, 123],
    [204, 208, 206, 203, 24, 23, 121, 122],
    [201, 207, 209, 205, 200, 22, 20, 119],
    [203, 206, 204, 202, 201, 199, 21, 118]])
seg_lab = np.where(SEG < 70, 1, np.where(SEG < 160, 2, 3))
seg_cc = label(seg_lab == 1, 4)
E.append(dict(id='region-segmentation', steps=[
    "① 入力：濃淡画像（例：暗い 20 台・中間 120 台・明るい 200 台の3種類の部分からなる 8×8 画像）",
    "② 『同じ領域の画素は性質（濃度・色・テクスチャ）が似ていて、領域どうしは違う』という基準で画像を重なりのない領域に分ける",
    "③ 方法の例：しきい値処理、領域成長法、分割統合法、k-means などのクラスタリング、ウォーターシェッド、グラフカット",
    "④ 出力：各画素に領域番号を付けたラベル画像（右図：暗=1、中間=2、明=3）。濃度の近さだけでクラスタ分けすると、離れた場所にある同じ濃度の部分も同じ番号になる点に注意（空間的に連結な領域に分けるならラベリングを併用）",
    "⑤ 分割後は領域ごとに面積・形・平均濃度・テクスチャなどを計測して認識へ進む",
], example=f"しきい値 70 と 160 で3クラスに分類。暗いクラスの画素は4連結で {seg_cc.max()} つの連結成分（左上の塊と斜めの帯が (3,3)-(4,3) でつながっている）",
    figures=[gfig(panels([dict(a=SEG, title='入力（濃淡）', mode='gray', values=True, size=8), dict(a=seg_lab, title='領域分割（ラベル）', mode='val', values=True, colors=lcol(seg_lab))], W=320, arrows=['']), '濃度の似た画素ごとに番号（色）を付けた')],
    code=r'''import numpy as np
import cv2

img = np.array([[20,22,25,24,120,125,122,118],[21,23,26,25,121,128,124,119],
                [22,24,27,26,123,126,127,121],[24,25,28,27,124,125,126,120],
                [200,205,202,26,25,122,124,123],[204,208,206,203,24,23,121,122],
                [201,207,209,205,200,22,20,119],[203,206,204,202,201,199,21,118]], np.uint8)
lab = np.digitize(img, [70, 160]) + 1        # しきい値で 1,2,3 に分類
print(lab)
# 空間的に連結な領域に分けるには、クラスごとにラベリング
for k in (1, 2, 3):
    n, cc = cv2.connectedComponents((lab == k).astype(np.uint8), connectivity=4)
    print('クラス', k, '連結成分', n - 1)
'''))

# 領域成長
RG = np.array([
    [12, 14, 80, 82, 85, 90],
    [13, 15, 78, 30, 32, 88],
    [11, 16, 20, 28, 31, 86],
    [14, 18, 22, 25, 29, 84],
    [90, 88, 21, 24, 27, 83],
    [92, 91, 87, 85, 86, 82]])
seed = (3, 3)
TG = 12
reg = np.zeros_like(RG); reg[seed] = 1
stages = [reg.copy()]
while True:
    m = RG[reg == 1].mean()
    nb = dil(reg, np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) - reg
    add = (nb == 1) & (np.abs(RG - m) <= TG)
    if not add.any():
        break
    reg = reg | add.astype(int)
    stages.append(reg.copy())


def rg_cols(st, prev):
    return [[('#e4572e' if st[r, c] and not prev[r, c] else '#3a86ff' if st[r, c] else None) for c in range(6)] for r in range(6)]


def rg_panel(st, prev, title):
    cols = [[('#ffb59e' if st[r, c] and not prev[r, c] else '#9db8ff' if st[r, c] else gray(RG[r, c])[0]) for c in range(6)] for r in range(6)]
    return dict(a=RG, title=title, colors=cols, values=True, size=8)


sel = [0, 1, len(stages) - 1]
E.append(dict(id='region-growing', steps=[
    f"① 入力：濃淡画像と種（シード）画素。例：(行3, 列3) の値 {RG[seed]} を種にする",
    f"② 領域の4近傍の画素のうち、『領域の平均濃度との差 ≤ T（例 T = {TG}）』を満たすものを領域に加える",
    f"③ 加えるたびに領域の平均を更新し、条件を満たす画素がなくなるまで繰り返す。例：1回目に {int(stages[1].sum()) - 1} 画素、2回目に {int(stages[2].sum() - stages[1].sum())} 画素が加わる",
    f"④ 出力：種から広がった連結な領域（{int(reg.sum())} 画素、平均 {f(RG[reg == 1].mean(), 1)}）。周りの 80〜90 台の画素は入らない。平均が 25 → 21 と下がるにつれ、左上の 11〜18 の画素も条件を満たして取り込まれた（平均を更新する方式では、ゆるやかに変化する部分へ広がっていく）",
    "⑤ 種の位置と T の選び方で結果が変わる。T が大きすぎると隣の領域へ漏れ出し、小さすぎると途中で止まる",
], example=f"1回目：平均 {RG[seed]} との差が {TG} 以下の4近傍 → " + ', '.join(f'({r},{c})={RG[r, c]}' for r, c in np.argwhere(stages[1] - stages[0])) + f"。最終的な領域の平均 {f(RG[reg == 1].mean(), 1)}",
    figures=[gfig(panels([rg_panel(stages[i], stages[i - 1] if i else np.zeros_like(RG), t) for i, t in zip(sel, ['種', '1回目', f'完了（{len(stages) - 1}回）'])], W=320, gap=16, arrows=['', '…']), '赤＝その回に加わった画素、青＝それまでの領域')],
    code=r'''import numpy as np

img = np.array([[12,14,80,82,85,90],[13,15,78,30,32,88],[11,16,20,28,31,86],
                [14,18,22,25,29,84],[90,88,21,24,27,83],[92,91,87,85,86,82]])
seed, T = (3, 3), 12
region = np.zeros(img.shape, bool); region[seed] = True
it = 0
while True:
    mean = img[region].mean()                       # 現在の領域の平均
    p = np.pad(region, 1)
    nb = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~region   # 4近傍
    add = nb & (np.abs(img - mean) <= T)            # 平均との差が T 以下
    if not add.any(): break
    region |= add; it += 1
    print(f'{it}回目: +{add.sum()} 画素, 平均 {img[region].mean():.1f}')
print(region.astype(int))
# OpenCV では cv2.floodFill（loDiff/upDiff で隣接画素との差を指定）が近い処理
'''))

# 分割統合
SM = np.array([
    [10, 12, 11, 13, 200, 205, 60, 62],
    [12, 11, 13, 12, 202, 204, 61, 63],
    [11, 13, 12, 11, 60, 62, 61, 60],
    [13, 12, 11, 10, 61, 63, 62, 61],
    [200, 202, 201, 203, 60, 61, 63, 62],
    [201, 203, 200, 202, 62, 60, 61, 63],
    [202, 200, 203, 201, 61, 62, 60, 61],
    [203, 201, 202, 200, 63, 61, 62, 60]])
leaves = []


def split(y, x, s, depth=0, path='R'):
    blk = SM[y:y + s, x:x + s]
    if blk.max() - blk.min() <= 10 or s == 1:
        leaves.append((y, x, s, path, float(blk.mean())))
        return {'p': path, 'y': y, 'x': x, 's': s, 'leaf': True, 'm': blk.mean()}
    h = s // 2
    ch = [split(y, x, h, depth + 1, path + '0'), split(y, x + h, h, depth + 1, path + '1'), split(y + h, x, h, depth + 1, path + '2'), split(y + h, x + h, h, depth + 1, path + '3')]
    return {'p': path, 'y': y, 'x': x, 's': s, 'leaf': False, 'ch': ch}


tree = split(0, 0, 8)
# 統合：隣接する葉で平均の差が10以下ならまとめる（union-find）
par = list(range(len(leaves)))
def fnd(i):
    while par[i] != i:
        i = par[i]
    return i
def adj(a, b):
    ya, xa, sa = a[:3]; yb, xb, sb = b[:3]
    ov_y = min(ya + sa, yb + sb) - max(ya, yb); ov_x = min(xa + sa, xb + sb) - max(xa, xb)
    return (ov_y > 0 and (xa + sa == xb or xb + sb == xa)) or (ov_x > 0 and (ya + sa == yb or yb + sb == ya))
for i in range(len(leaves)):
    for j in range(i + 1, len(leaves)):
        if adj(leaves[i], leaves[j]) and abs(leaves[i][4] - leaves[j][4]) <= 10:
            par[fnd(j)] = fnd(i)
roots = sorted({fnd(i) for i in range(len(leaves))})
merged = np.zeros((8, 8), int)
for i, (y, x, s, p_, m) in enumerate(leaves):
    merged[y:y + s, x:x + s] = roots.index(fnd(i)) + 1


def split_svg():
    W = 320
    cs = 17
    b = [T(4 * cs + 10, 12, f'① 分割（葉 {len(leaves)} 個）', 10)]
    b.append(grid(SM, 10, 18, cs, 'gray', border='#ddd'))
    for (y, x, s, p_, m) in leaves:
        b.append(R(10 + x * cs, 18 + y * cs, s * cs, s * cs, 'none', RED, 1.6))
    b.append(arrow(150, 86, 172, 86))
    b.append(T(178 + 4 * cs - 10, 12, f'② 統合（{len(roots)} 領域）', 10))
    b.append(grid(merged, 178, 18, cs, colors=lcol(merged), border='#eee'))
    for (y, x, s, p_, m) in leaves:
        b.append(R(178 + x * cs, 18 + y * cs, s * cs, s * cs, 'none', '#999', 0.6, " stroke-dasharray='2 2'"))
    return svg(W, 18 + 8 * cs + 6, ''.join(b))


E.append(dict(id='region-split-merge', steps=[
    "① 画像全体を1つの領域とみなし、均一性の条件（例：最大値 − 最小値 ≤ 10）を調べる",
    "② 条件を満たさなければ4つの正方形に分割（四分木）。各ブロックについて再帰的に繰り返す",
    f"③ 例：8×8 画像 → 4×4 のブロック4つのうち右上だけが不均一なので、さらに 2×2 に分割。葉（均一なブロック）は {len(leaves)} 個",
    f"④ 統合：隣り合う葉どうしで平均濃度の差が 10 以下ならまとめる。分割の境界（四分木の切れ目）をまたいで同じ濃度の部分がつながり、{len(roots)} 領域になる",
    "⑤ 分割だけだと正方形のブロック状の境界が残るが、統合によって実際の形に沿った領域が得られる（Horowitz & Pavlidis 1974）",
], example="葉の平均：" + ', '.join(f"{p_}={f(m, 1)}" for (y, x, s, p_, m) in leaves[:6]) + " …（R=全体, 0=左上,1=右上,2=左下,3=右下）",
    figures=[gfig(split_svg(), '赤枠＝分割で得た均一ブロック、色＝統合後の領域')],
    code=r'''import numpy as np

img = np.array([[10,12,11,13,200,205,60,62],[12,11,13,12,202,204,61,63],[11,13,12,11,60,62,61,60],
                [13,12,11,10,61,63,62,61],[200,202,201,203,60,61,63,62],[201,203,200,202,62,60,61,63],
                [202,200,203,201,61,62,60,61],[203,201,202,200,63,61,62,60]])
leaves = []
def split(y, x, s):                         # ① 均一でなければ4分割（再帰）
    b = img[y:y + s, x:x + s]
    if b.max() - b.min() <= 10 or s == 1:
        leaves.append((y, x, s, b.mean())); return
    h = s // 2
    for dy, dx in [(0, 0), (0, h), (h, 0), (h, h)]: split(y + dy, x + dx, h)
split(0, 0, 8)
print(len(leaves), 'leaves')
lab = np.zeros(img.shape, int)              # ② 隣接して平均が近い葉を統合
for i, (y, x, s, m) in enumerate(leaves): lab[y:y + s, x:x + s] = i + 1
changed = True
while changed:
    changed = False
    for a, b in [(lab[:, :-1], lab[:, 1:]), (lab[:-1, :], lab[1:, :])]:   # 隣り合う画素のラベル対
        for la, lb in set(zip(a.ravel(), b.ravel())):
            if la != lb and abs(img[lab == la].mean() - img[lab == lb].mean()) <= 10:
                lab[lab == lb] = la; changed = True
print(len(np.unique(lab)), 'regions'); print(lab)
'''))


def qt_svg():
    W = 330
    b = []
    # 木を描く：深さごとに並べる
    levels = {}
    def walk(n, d):
        levels.setdefault(d, []).append(n)
        if not n['leaf']:
            for c in n['ch']:
                walk(c, d + 1)
    walk(tree, 0)
    pos = {}
    ys = {0: 20, 1: 70, 2: 125}
    for d, ns in levels.items():
        k = len(ns)
        for i, n in enumerate(ns):
            if d == 2:
                x = 150 + (i - 1.5) * 44
            else:
                x = W / 2 + (i - (k - 1) / 2) * (300 / max(k, 1)) * (0.9 if d == 1 else 1)
            pos[n['p']] = (x, ys[d])
    def edges(n):
        if not n['leaf']:
            for c in n['ch']:
                b.append(L(*pos[n['p']], *pos[c['p']], '#888', 1))
                edges(c)
    edges(tree)
    for d, ns in levels.items():
        for n in ns:
            x, y = pos[n['p']]
            if n['leaf']:
                g = int(n['m'])
                b.append(R(x - 17, y - 11, 34, 22, f"rgb({g},{g},{g})", '#333', 1))
                b.append(T(x, y + 4, f(n['m'], 0), 9, fill='#fff' if g < 128 else '#000'))
            else:
                b.append(C(x, y, 10, '#fff', RED, 1.5) + T(x, y + 4, '分', 9, fill=RED))
            b.append(T(x, y + 22 if n['leaf'] else y - 13, n['p'], 8, fill='#666'))
    return svg(W, 155, ''.join(b))


E.append(dict(id='region-quadtree', steps=[
    "① 画像（2ⁿ × 2ⁿ）を根ノードとし、条件（均一か）を満たさないノードを4つの子（左上0・右上1・左下2・右下3）に分ける",
    "② 子ノードについて同じ判定を繰り返し、均一なブロックを葉とする",
    f"③ 例（分割統合法と同じ 8×8 画像）：根 R → 4つの 4×4 のうち右上 R1 だけ不均一 → R1 を 2×2 の4つに分割。木の深さ2、葉 {len(leaves)} 個",
    "④ 葉ごとに『位置・大きさ・平均値』を持てば画像を表現できる。均一な部分が広い画像ほどノード数が少なくデータが小さい",
    "⑤ 用途：分割統合法の分割、領域の表現・圧縮、空間検索（点や物体の高速な探索）",
], example=f"葉の数 {len(leaves)}：深さ1の葉 3個（4×4 = 16画素ずつ）＋深さ2の葉 4個（2×2 = 4画素ずつ） → 3·16 + 4·4 = 64 画素",
    figures=[gfig(qt_svg(), '赤丸＝分割したノード、四角＝葉（数字は平均濃度、下の記号は位置）')],
    code=r'''import numpy as np

img = np.array([[10,12,11,13,200,205,60,62],[12,11,13,12,202,204,61,63],[11,13,12,11,60,62,61,60],
                [13,12,11,10,61,63,62,61],[200,202,201,203,60,61,63,62],[201,203,200,202,62,60,61,63],
                [202,200,203,201,61,62,60,61],[203,201,202,200,63,61,62,60]])
def build(y, x, s, name='R'):
    b = img[y:y + s, x:x + s]
    if b.max() - b.min() <= 10 or s == 1:              # 均一 → 葉
        return {'name': name, 'size': s, 'mean': float(b.mean())}
    h = s // 2                                         # 不均一 → 4つの子
    return {'name': name, 'children': [build(y + dy, x + dx, h, name + str(i))
            for i, (dy, dx) in enumerate([(0, 0), (0, h), (h, 0), (h, h)])]}
def show(n, d=0):
    if 'children' in n:
        print('  ' * d + n['name'] + ' (分割)')
        for c in n['children']: show(c, d + 1)
    else:
        print('  ' * d + f"{n['name']} 葉 {n['size']}x{n['size']} 平均 {n['mean']:.1f}")
show(build(0, 0, 8))
'''))

# k-means（2次元点）
rng = np.random.default_rng(5)
pts = np.vstack([rng.normal([2, 2], 0.6, (12, 2)), rng.normal([6, 3], 0.6, (12, 2)), rng.normal([4, 6.5], 0.6, (12, 2))])
cents = [np.array([[1.0, 4.5], [3.0, 0.5], [7.5, 5.5]])]
assigns = []
for it in range(10):
    c = cents[-1]
    a = np.argmin(((pts[:, None] - c[None]) ** 2).sum(-1), 1)
    assigns.append(a)
    nc = np.array([pts[a == k].mean(0) for k in range(3)])
    if np.allclose(nc, c):
        break
    cents.append(nc)
KC = [RED, BLUE, GREEN]


def km_svg(i, title):
    p = Plane((0, 8), (0, 8), W=160, pad=12).axes(2, labels=False)
    a = assigns[i]
    for q, k in zip(pts, a):
        p.dot(q, 2.6, KC[k])
    c = cents[i]
    for k in range(3):
        x, y = p.pt(c[k])
        p.raw(f"<path d='M {f(x - 6)} {f(y - 6)} L {f(x + 6)} {f(y + 6)} M {f(x + 6)} {f(y - 6)} L {f(x - 6)} {f(y + 6)}' stroke='{KC[k]}' stroke-width='3'/>")
        if i + 1 < len(cents):
            p.arrow(c[k], cents[i + 1][k], '#333')
    p.text((4, 7.6), title, 10)
    return p


def km_fig(i1, i2, t1, t2):
    p1 = km_svg(i1, t1); p2 = km_svg(i2, t2)
    return svg(320, f(p1.H), f"<g>{''.join(p1.b)}</g><g transform='translate(160,0)'>{''.join(p2.b)}</g>")


sse = [float(((pts - cents[i][assigns[i]]) ** 2).sum()) for i in range(len(assigns))]
E.append(dict(id='region-kmeans', steps=[
    "① 入力：データ点（例：画素の色 (R,G) や (濃度, x, y) の特徴ベクトル）36 個と、クラスタ数 k = 3",
    "② 初期化：k 個のクラスタ中心（×）を適当に置く（例：(1,4.5), (3,0.5), (7.5,5.5)）",
    "③ 割り当て：各点を最も近い中心のクラスタに入れる（色分け）",
    "④ 更新：各クラスタに属する点の平均を新しい中心にする（矢印の先へ移動）。③④を中心が動かなくなるまで繰り返す",
    f"⑤ この例では {len(cents)} 回目の更新で収束。誤差（各点と中心の距離²の和）は {f(sse[0], 1)} → {f(sse[-1], 1)} と単調に減る。結果は初期値に依存し、k は事前に決める必要がある",
], example=f"中心の推移：緑 {tuple(np.round(cents[0][2], 1))} → {tuple(np.round(cents[1][2], 1))} → … → {tuple(np.round(cents[-1][2], 1))}。画像に使うと『色の似た画素』が k 色に分かれる（減色・領域分割）",
    figures=[gfig(km_fig(0, 1, '反復1：割当→中心移動', '反復2'), '×＝クラスタ中心、点の色＝割り当て、矢印＝次の中心への移動'), gfig(km_fig(len(assigns) - 2 if len(assigns) > 2 else 0, len(assigns) - 1, f'反復{len(assigns) - 1}', f'反復{len(assigns)}（収束）'), '中心が動かなくなったら終了')],
    code=r'''import numpy as np
import cv2

rng = np.random.default_rng(5)
X = np.vstack([rng.normal([2, 2], .6, (12, 2)), rng.normal([6, 3], .6, (12, 2)), rng.normal([4, 6.5], .6, (12, 2))])
C = np.array([[1.0, 4.5], [3.0, 0.5], [7.5, 5.5]])         # 初期中心
for it in range(20):
    d = ((X[:, None, :] - C[None]) ** 2).sum(-1)           # 各点と各中心の距離²
    a = d.argmin(1)                                        # ③ 割り当て
    newC = np.array([X[a == k].mean(0) for k in range(3)]) # ④ 平均で更新
    print(it + 1, np.round(newC, 2).tolist(), round(d.min(1).sum(), 1))
    if np.allclose(newC, C): break
    C = newC
# OpenCV
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1e-4)
_, lab, cen = cv2.kmeans(X.astype(np.float32), 3, None, crit, 5, cv2.KMEANS_PP_CENTERS)
print(np.round(cen, 2))
'''))

# mean-shift 1D
data = np.r_[rng.normal(3, 0.7, 25), rng.normal(8, 1.0, 25)]
xs = np.linspace(0, 11, 221)
hb = 1.0
kde = np.array([np.exp(-((x - data) ** 2) / (2 * hb * hb)).sum() for x in xs])
traj = [1.0]
for _ in range(15):
    x = traj[-1]
    w = np.exp(-((x - data) ** 2) / (2 * hb * hb))
    traj.append(float((w * data).sum() / w.sum()))
traj2 = [6.0]
for _ in range(15):
    x = traj2[-1]
    w = np.exp(-((x - data) ** 2) / (2 * hb * hb))
    traj2.append(float((w * data).sum() / w.sum()))


def ms_svg():
    W, H = 320, 170
    left, top, pw, ph = 30, 12, 280, 120
    X = lambda x: left + x / 11 * pw
    Y = lambda y: top + ph - y / kde.max() / 1.1 * ph
    b = [R(left, top, pw, ph, '#fff', '#bbb', 0.8)]
    b.append(P([(X(x), Y(y)) for x, y in zip(xs, kde)], 'none', '#999', 1.5, False))
    for d in data:
        b.append(L(X(d), top + ph, X(d), top + ph - 6, '#555', 1))
    for tr, col, yy in [(traj, RED, 0.3), (traj2, BLUE, 0.5)]:
        for i in range(5):
            x1, x2 = tr[i], tr[i + 1]
            b.append(C(X(x1), Y(np.interp(x1, xs, kde)), 3.5, col))
            if abs(x2 - x1) > 0.05:
                b.append(arrow(X(x1), Y(np.interp(x1, xs, kde)) - 3, X(x2), Y(np.interp(x2, xs, kde)) - 3, None, col, w=1.3))
        b.append(C(X(tr[-1]), Y(np.interp(tr[-1], xs, kde)), 5, col))
        b.append(T(X(tr[-1]), Y(np.interp(tr[-1], xs, kde)) - 8, f"収束 {f(tr[-1], 2)}", 10, fill=col))
    for t_ in range(0, 12, 2):
        b.append(T(X(t_), top + ph + 12, str(t_), 9, fill='#555'))
    b.append(T(left + pw / 2, H - 4, '特徴量 x（例：濃度）　｜＝データ点、灰線＝密度', 9, fill='#444'))
    return svg(W, H, ''.join(b))


E.append(dict(id='region-mean-shift', steps=[
    "① 入力：データ点（例：画素の濃度や (色, 位置)）。窓の幅（バンド幅）h を決める（例 h = 1.0）。クラスタ数は決めなくてよい",
    "② ある点 x から出発し、x の周りの点を距離に応じた重み（ガウス核）で平均した位置 m(x) を求める",
    "③ x を m(x) に移す（平均シフト）。これを繰り返すと、データの密度が最も高い山（モード）に登っていく",
    f"④ 例：x = 1.0 から出発 → {f(traj[1], 2)} → {f(traj[2], 2)} → … → {f(traj[-1], 2)}（左の山）。x = 6.0 からは {f(traj2[-1], 2)}（右の山）に収束",
    "⑤ 全画素から出発し、同じモードに収束した画素を同じ領域とする → 領域分割・平滑化。h が大きいと山が少なく（領域数が少なく）なる",
], example=f"1回目：x=1.0 の近くの点ほど重みが大きく、重み付き平均は {f(traj[1], 2)}（右に移動）。移動量 m(x) − x は密度の勾配の方向を向く",
    figures=[gfig(ms_svg(), '赤・青の点が平均シフトで密度の山の頂上へ登る')],
    code=r'''import numpy as np
import cv2

rng = np.random.default_rng(5)
data = np.r_[rng.normal(3, .7, 25), rng.normal(8, 1.0, 25)]   # 2つの山があるデータ
h = 1.0
def mean_shift(x, n=30):
    for _ in range(n):
        w = np.exp(-(x - data) ** 2 / (2 * h * h))          # ガウス核の重み
        x_new = (w * data).sum() / w.sum()                   # 重み付き平均へ移動
        if abs(x_new - x) < 1e-5: break
        x = x_new
    return x
modes = np.array([mean_shift(x) for x in data])             # 全点から出発
print(np.unique(modes.round(2)))                             # 収束先 = クラスタ
# 画像：色＋位置の空間で平均シフトして平滑化（領域分割の前処理）
img = np.zeros((20, 20, 3), np.uint8); img[:, 10:] = (200, 50, 50)
img = np.clip(img + rng.normal(0, 20, img.shape), 0, 255).astype(np.uint8)
out = cv2.pyrMeanShiftFiltering(img, sp=5, sr=30)
print(len(np.unique(out.reshape(-1, 3), axis=0)), '色に減った')
'''))

# スーパーピクセル（簡易 SLIC）
H_, W_ = 24, 24
yy, xx = np.mgrid[0:H_, 0:W_]
simg = np.full((H_, W_), 60.0)
simg[((xx - 9) ** 2 + (yy - 10) ** 2) < 36] = 200
simg[(xx > 14) & (yy > 13)] = 130
simg += np.random.default_rng(2).normal(0, 6, simg.shape)


def slic_gray(img, S=6, m=20, iters=8):
    H, W = img.shape
    cs = [[float(img[y, x]), float(y), float(x)] for y in range(S // 2, H, S) for x in range(S // 2, W, S)]
    lab = np.zeros((H, W), int)
    for _ in range(iters):
        D = np.full((H, W), np.inf)
        for k, (g, cy, cx) in enumerate(cs):
            y0, y1 = int(max(0, cy - S)), int(min(H, cy + S + 1)); x0, x1 = int(max(0, cx - S)), int(min(W, cx + S + 1))
            pg = img[y0:y1, x0:x1]; py, px = np.mgrid[y0:y1, x0:x1]
            d = np.sqrt((pg - g) ** 2 + (((py - cy) ** 2 + (px - cx) ** 2) / S ** 2) * m ** 2)
            msk = d < D[y0:y1, x0:x1]
            D[y0:y1, x0:x1][msk] = d[msk]; lab[y0:y1, x0:x1][msk] = k
        for k in range(len(cs)):
            ys_, xs_ = np.nonzero(lab == k)
            if len(ys_):
                cs[k] = [float(img[ys_, xs_].mean()), ys_.mean(), xs_.mean()]
    return lab, cs


slab, scs = slic_gray(simg)


def sp_svg():
    W = 300
    cs = 5.5
    b = []
    for k_, (title, mean_img) in enumerate([('入力', simg), ('スーパーピクセル（境界＋平均値）', None)]):
        ox = 10 + k_ * 150
        b.append(T(ox + 12 * cs, 12, title, 10))
        for y in range(H_):
            for x in range(W_):
                v = simg[y, x] if k_ == 0 else simg[slab == slab[y, x]].mean()
                g = int(np.clip(v, 0, 255))
                b.append(f"<rect x='{f(ox + x * cs)}' y='{f(18 + y * cs)}' width='{f(cs + 0.2)}' height='{f(cs + 0.2)}' fill='rgb({g},{g},{g})'/>")
        if k_ == 1:
            for y in range(H_):
                for x in range(W_):
                    if x + 1 < W_ and slab[y, x] != slab[y, x + 1]:
                        b.append(L(ox + (x + 1) * cs, 18 + y * cs, ox + (x + 1) * cs, 18 + (y + 1) * cs, RED, 1))
                    if y + 1 < H_ and slab[y, x] != slab[y + 1, x]:
                        b.append(L(ox + x * cs, 18 + (y + 1) * cs, ox + (x + 1) * cs, 18 + (y + 1) * cs, RED, 1))
    return svg(W, 18 + H_ * cs + 6, ''.join(b))


E.append(dict(id='region-superpixel', steps=[
    "① 入力：画像（例 24×24、円と四角形がある）",
    "② 色と位置が近い画素をまとめて、大きさのそろった小領域（スーパーピクセル）に分ける。数は画素数よりずっと少ない（例：576画素 → 16個）",
    "③ 各スーパーピクセルは物体の境界をまたがないように作られる（境界に沿って曲がる）",
    "④ 出力：ラベル画像。スーパーピクセルごとの平均値で塗ると、形を保ったまま大幅に単純化された画像になる",
    "⑤ 以後の処理（グラフカット、領域分類、物体検出）の単位を画素からスーパーピクセルに変えると、計算量が大きく減る。代表的な手法：SLIC、Felzenszwalb のグラフ法、ウォーターシェッド",
], example=f"24×24 = 576 画素 → {len(np.unique(slab))} 個のスーパーピクセル。円の輪郭付近では境界（赤）が円に沿って曲がる",
    figures=[gfig(sp_svg(), '赤線＝スーパーピクセルの境界（簡易 SLIC、間隔 S=6）')],
    code=r'''import numpy as np

rng = np.random.default_rng(2)
yy, xx = np.mgrid[0:24, 0:24]
img = np.full((24, 24), 60.0); img[(xx - 9) ** 2 + (yy - 10) ** 2 < 36] = 200
img[(xx > 14) & (yy > 13)] = 130; img += rng.normal(0, 6, img.shape)
S, m = 6, 20                                          # 格子間隔、コンパクトさ
C = [[img[y, x], y, x] for y in range(3, 24, S) for x in range(3, 24, S)]   # 初期中心
for _ in range(5):
    D = np.full(img.shape, np.inf); lab = np.zeros(img.shape, int)
    for k, (g, cy, cx) in enumerate(C):              # 中心の周り 2S×2S だけ探す
        y0, y1, x0, x1 = int(max(cy - S, 0)), int(cy + S + 1), int(max(cx - S, 0)), int(cx + S + 1)
        py, px = np.mgrid[y0:min(y1, 24), x0:min(x1, 24)]
        d = np.sqrt((img[py, px] - g) ** 2 + ((py - cy) ** 2 + (px - cx) ** 2) / S ** 2 * m ** 2)
        upd = d < D[py, px]; D[py[upd], px[upd]] = d[upd]; lab[py[upd], px[upd]] = k
    C = [[img[lab == k].mean(), *np.argwhere(lab == k).mean(0)] for k in range(len(C))]
print(len(np.unique(lab)), 'superpixels')
print(lab[::3, ::3])
# opencv-contrib があれば cv2.ximgproc.createSuperpixelSLIC(img, region_size=6)
'''))

# SLIC 距離例
dc = math.dist((52, 10, 20), (48, 14, 25))
ds = math.dist((12, 30), (15, 34))
S0, m0 = 10, 10
Dslic = math.sqrt(dc ** 2 + (ds / S0) ** 2 * m0 ** 2)


def slic_svg():
    W = 300
    b = []
    cs = 6
    ox, oy = 60, 8
    for y in range(30):
        for x in range(30):
            b.append(R(ox + x * cs, oy + y * cs, cs, cs, '#fafafa', '#e6e6e6', 0.4))
    for cy in range(5, 30, 10):
        for cx in range(5, 30, 10):
            b.append(C(ox + cx * cs + cs / 2, oy + cy * cs + cs / 2, 3.5, RED))
    b.append(R(ox + 5 * cs + cs / 2, oy + 5 * cs + cs / 2, 20 * cs, 20 * cs, 'none', BLUE, 1.5, " stroke-dasharray='4 2'"))
    b.append(L(ox + 15 * cs + cs / 2, oy + 30 * cs + 4, ox + 25 * cs + cs / 2, oy + 30 * cs + 4, '#333', 1) + T(ox + 20 * cs, oy + 30 * cs + 15, 'S', 10))
    b.append(T(W / 2, oy + 30 * cs + 30, '赤＝初期中心（間隔 S）、青枠＝中央の中心の探索範囲 2S×2S', 9, fill='#333'))
    return svg(W, oy + 30 * cs + 36, ''.join(b))


E.append(dict(id='region-slic', steps=[
    "① 画像を Lab 色空間に変換し、間隔 S（例 S = 10 画素）の格子点にクラスタ中心を置く（3×3 内で勾配最小の位置へ少しずらす）",
    "② 各中心の周り 2S×2S の範囲の画素だけについて距離 D = √( dc² + (ds/S)²·m² ) を計算（dc：Lab 色差、ds：画像上の距離、m：コンパクトさ）",
    f"③ 例：中心 (L,a,b)=(52,10,20)・位置 (12,30)、画素 (48,14,25)・位置 (15,34) → dc = {f(dc, 2)}, ds = {f(ds, 2)} → D = √({f(dc, 2)}² + ({f(ds, 2)}/10)²·10²) = {f(Dslic, 2)}",
    "④ 各画素を D が最小の中心に割り当て、中心を所属画素の平均（色・位置）に更新。これを数回（10回程度）繰り返す",
    "⑤ 探索範囲を局所に限るので計算量は画素数に比例（高速）。m が大きいと四角く整ったスーパーピクセル、小さいと色の境界によく沿う形になる",
], example=f"m を 10 → 40 にすると同じ画素でも D = {f(math.sqrt(dc ** 2 + (ds / S0) ** 2 * 40 ** 2), 2)}（位置の重みが大きくなる）。最後に小さすぎる断片を隣に吸収して連結性を保証する",
    figures=[gfig(slic_svg(), 'SLIC は中心の近く（2S×2S）だけで k-means を行う')],
    code=r'''import numpy as np
import cv2

def slic_distance(c, p, S, m):
    dc = np.linalg.norm(np.subtract(c[:3], p[:3]))        # Lab の色差
    ds = np.linalg.norm(np.subtract(c[3:], p[3:]))        # 画像上の距離
    return np.sqrt(dc ** 2 + (ds / S) ** 2 * m ** 2)
center = (52, 10, 20, 12, 30)                             # (L, a, b, y, x)
pixel = (48, 14, 25, 15, 34)
for m in (10, 40):
    print('m =', m, ' D =', round(slic_distance(center, pixel, S=10, m=m), 2))
# 実画像：Lab 変換してから行う（OpenCV の Lab は L:0-255 に拡大されている点に注意）
img = np.zeros((40, 60, 3), np.uint8); img[:, 30:] = (0, 0, 255)
lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)
print(lab[0, 0], lab[0, 59])
# opencv-contrib: cv2.ximgproc.createSuperpixelSLIC(lab, cv2.ximgproc.SLIC, region_size=10, ruler=10)
'''))

# グラフカット（1D 4画素）
vals = [30, 40, 180, 200]
mu_f, mu_b = 190, 35
Dp_f = [abs(v - mu_f) / 10 for v in vals]  # 前景にするコスト
Dp_b = [abs(v - mu_b) / 10 for v in vals]
lam = 1.0
Vw = [lam * 20 * math.exp(-((vals[i] - vals[i + 1]) ** 2) / (2 * 60 ** 2)) for i in range(3)]
best = None
for mask in range(16):
    labs = [(mask >> i) & 1 for i in range(4)]
    e = sum(Dp_f[i] if labs[i] else Dp_b[i] for i in range(4)) + sum(Vw[i] for i in range(3) if labs[i] != labs[i + 1])
    if best is None or e < best[0]:
        best = (e, labs)


def gc_svg():
    W = 320
    b = []
    xs_ = [55, 125, 195, 265]
    yS, yP, yT = 22, 95, 168
    b.append(C(160, yS, 13, '#ffe0d6', RED, 1.5) + T(160, yS + 4, 's 前景', 9, fill=RED))
    b.append(C(160, yT, 13, '#dbe6ff', BLUE, 1.5) + T(160, yT + 4, 't 背景', 9, fill=BLUE))
    for i, x in enumerate(xs_):
        cut_s = best[1][i] == 0  # 背景なら s 側リンクが切られる
        b.append(L(160, yS + 13, x, yP - 13, RED, max(0.8, Dp_b[i] / 4), '4 3' if cut_s else None))
        b.append(T((160 + x) / 2 + (-12 if x < 160 else 12), (yS + yP) / 2, f(Dp_b[i], 1), 9, fill=RED))
        b.append(L(160, yT - 13, x, yP + 13, BLUE, max(0.8, Dp_f[i] / 4), None if cut_s else '4 3'))
        b.append(T((160 + x) / 2 + (-12 if x < 160 else 12), (yT + yP) / 2 + 8, f(Dp_f[i], 1), 9, fill=BLUE))
        g = vals[i]
        b.append(R(x - 14, yP - 13, 28, 26, f"rgb({g},{g},{g})", '#333', 1.5))
        b.append(T(x, yP + 4, str(g), 10, fill='#fff' if g < 128 else '#000'))
        if i < 3:
            cut_n = best[1][i] != best[1][i + 1]
            b.append(L(x + 14, yP, xs_[i + 1] - 14, yP, '#333', 1.5, '3 2' if cut_n else None))
            b.append(T((x + xs_[i + 1]) / 2, yP - 5, f(Vw[i], 1), 9))
    b.append(T(160, 196, f"最小カット（破線）：画素 {''.join('前' if l else '背' for l in best[1])}、エネルギー {f(best[0], 1)}", 10, weight='bold'))
    return svg(W, 202, ''.join(b))


E.append(dict(id='region-graph-cut', steps=[
    "① 画素をノードとし、前景を表す端子 s と背景を表す端子 t を加えたグラフを作る",
    f"② t-link（端子と画素）の重み＝データ項。例：前景の平均 {mu_f}・背景の平均 {mu_b} とし、画素値 30 を『前景にするコスト』= |30−190|/10 = 16、『背景にするコスト』= 0.5",
    f"③ n-link（隣接画素間）の重み＝平滑化項。似た値どうしは大きく（40−30 の間は {f(Vw[0], 1)}）、値が大きく違う所は小さく（40−180 の間は {f(Vw[1], 1)}）",
    "④ s と t を分離する最小カット（切った辺の重みの和が最小）を最大流アルゴリズムで求める。切られずに s につながった画素＝前景",
    f"⑤ 例：エネルギー最小のラベルは {best[1]}（1=前景）。濃度差の大きい 40|180 の間で切れる。データ項＋平滑化項の大域的な最小解が得られる",
], example=f"全16通りのうち最小は {best[1]}：データ項 0.5+0.5+1.0+1.0 = 3.0 ＋ 切った n-link {f(Vw[1], 2)} = {f(best[0], 2)}。境界を 30|40 の間に置くと n-link {f(Vw[0], 1)} を切ることになり高くつく",
    figures=[gfig(gc_svg(), '赤＝s との辺（背景にするコスト）、青＝t との辺（前景にするコスト）、黒＝隣接画素の辺。破線が切られた辺')],
    code=r'''import numpy as np
import itertools

vals = np.array([30, 40, 180, 200])            # 1次元に並んだ4画素
mu_f, mu_b = 190, 35
cost_f = np.abs(vals - mu_f) / 10               # 前景にするコスト（データ項）
cost_b = np.abs(vals - mu_b) / 10               # 背景にするコスト
w = 20 * np.exp(-np.diff(vals) ** 2 / (2 * 60 ** 2))   # 平滑化項（似ていると大）
best = None
for lab in itertools.product([0, 1], repeat=4):  # 小さいので全探索（実際は最大流）
    lab = np.array(lab)
    E = np.where(lab == 1, cost_f, cost_b).sum() + w[lab[1:] != lab[:-1]].sum()
    if best is None or E < best[0]: best = (round(E, 2), lab)
print(w.round(2), best)
# 画像では cv2.grabCut（内部でグラフカット）や PyMaxflow などを使う
'''))

# GrabCut
gimg = np.full((40, 60, 3), (60, 120, 60), np.uint8)
cv2.circle(gimg, (30, 20), 11, (40, 60, 220), -1)
cv2.rectangle(gimg, (22, 26), (38, 34), (40, 60, 220), -1)
gimg = np.clip(gimg + np.random.default_rng(1).normal(0, 12, gimg.shape), 0, 255).astype(np.uint8)
gmask = np.zeros((40, 60), np.uint8)
rect = (14, 4, 32, 33)
bgd = np.zeros((1, 65)); fgd = np.zeros((1, 65))
cv2.setRNGSeed(0)
cv2.grabCut(gimg, gmask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
fg = np.isin(gmask, [1, 3])


def gc2_svg():
    W = 320
    cs = 2.4
    b = []
    for k_ in range(2):
        ox = 10 + k_ * 155
        b.append(T(ox + 30 * cs, 12, ['入力＋矩形（ユーザ指定）', '結果（前景だけ残す）'][k_], 10))
        for y in range(0, 40):
            for x in range(0, 60):
                bb, gg, rr = gimg[y, x]
                if k_ == 1 and not fg[y, x]:
                    rr = gg = bb = 245
                b.append(f"<rect x='{f(ox + x * cs)}' y='{f(18 + y * cs)}' width='{f(cs + 0.15)}' height='{f(cs + 0.15)}' fill='rgb({rr},{gg},{bb})'/>")
        if k_ == 0:
            b.append(R(ox + rect[0] * cs, 18 + rect[1] * cs, rect[2] * cs, rect[3] * cs, 'none', '#ffcc00', 2))
    return svg(W, 18 + 40 * cs + 6, ''.join(b))


E.append(dict(id='region-grabcut', steps=[
    "① ユーザが対象を囲む矩形を指定（矩形の外＝確実に背景、内側＝不明）",
    "② 前景・背景それぞれの色分布を混合ガウス分布（GMM、各5成分程度）で推定（最初は矩形の内側を仮に前景とする）",
    "③ 各画素の『前景らしさ／背景らしさ』（GMM の尤度）をデータ項、隣接画素の色の近さを平滑化項としてグラフカットで前景・背景を決める",
    "④ 得られた前景・背景で GMM を推定し直し、②〜③を数回繰り返す（反復でだんだん正確になる）",
    f"⑤ 出力：前景マスク。例：赤い物体（円＋四角）が前景として抜き出される（前景 {int(fg.sum())} 画素）。誤りはユーザが筆で前景/背景を塗って修正できる（Rother ら 2004）",
], example=f"矩形内 {rect[2] * rect[3]} 画素のうち {int(fg.sum())} 画素が前景、残りの緑の部分は背景と判定。cv2.grabCut の mask は 0=背景, 1=前景, 2=たぶん背景, 3=たぶん前景",
    figures=[gfig(gc2_svg(), '黄色の矩形を与えるだけで、対象（赤）を切り抜ける')],
    code=r'''import numpy as np
import cv2

img = np.full((40, 60, 3), (60, 120, 60), np.uint8)              # 緑の背景（BGR）
cv2.circle(img, (30, 20), 11, (40, 60, 220), -1)                  # 赤い物体
cv2.rectangle(img, (22, 26), (38, 34), (40, 60, 220), -1)
img = np.clip(img + np.random.default_rng(1).normal(0, 12, img.shape), 0, 255).astype(np.uint8)
mask = np.zeros(img.shape[:2], np.uint8)
rect = (14, 4, 32, 33)                                            # (x, y, w, h) ユーザ指定
bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))                   # GMM のパラメータ
cv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)  # 5回反復
fg = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD])
print('前景画素数', fg.sum())
print(fg[::4, 12:50:3].astype(int))
'''))

# 正規化カット（6ノード）
Wm = np.array([
    [0, 5, 4, 0.5, 0, 0],
    [5, 0, 4, 0, 0.3, 0],
    [4, 4, 0, 0, 0, 0.4],
    [0.5, 0, 0, 0, 5, 3],
    [0, 0.3, 0, 5, 0, 4],
    [0, 0, 0.4, 3, 4, 0]])
Dg = np.diag(Wm.sum(1))
Lp = Dg - Wm
Dm12 = np.diag(1 / np.sqrt(Wm.sum(1)))
ev, evec = np.linalg.eigh(Dm12 @ Lp @ Dm12)
y2 = Dm12 @ evec[:, 1]
y2 = y2 * np.sign(y2[0])
Aset_ = [i for i in range(6) if y2[i] > 0]
Bset_ = [i for i in range(6) if y2[i] <= 0]
cutAB = sum(Wm[i, j] for i in Aset_ for j in Bset_)
assocA = Wm[Aset_].sum(); assocB = Wm[Bset_].sum()
ncut = cutAB / assocA + cutAB / assocB
# 比較：ノード2だけ切り出す
cut_single = Wm[2].sum() - 0
nodes_xy = [(50, 40), (110, 25), (90, 95), (210, 40), (270, 30), (240, 100)]


def nc_svg():
    W = 320
    b = []
    for i in range(6):
        for j in range(i + 1, 6):
            if Wm[i, j]:
                cut = (i in Aset_) != (j in Aset_)
                b.append(L(*nodes_xy[i], *nodes_xy[j], RED if cut else '#666', max(0.8, Wm[i, j] / 1.5), '4 3' if cut else None))
                mx, my = (nodes_xy[i][0] + nodes_xy[j][0]) / 2, (nodes_xy[i][1] + nodes_xy[j][1]) / 2
                b.append(T(mx, my - 3, f(Wm[i, j]), 9, fill=RED if cut else '#333'))
    for i, (x, y) in enumerate(nodes_xy):
        col = '#ffe0d6' if i in Aset_ else '#dbe6ff'
        b.append(C(x, y, 13, col, '#333', 1.2) + T(x, y + 4, str(i), 10))
        b.append(T(x, y + 26, f"y={f(y2[i], 2)}", 9, fill='#444'))
    b.append(T(160, 146, f"Ncut = {f(cutAB, 1)}/{f(assocA, 1)} + {f(cutAB, 1)}/{f(assocB, 1)} = {f(ncut, 3)}", 10, weight='bold'))
    return svg(W, 154, ''.join(b))


E.append(dict(id='region-normalized-cut', steps=[
    "① 画素（または小領域）をノード、類似度を辺の重み w_ij とするグラフを作る。例：6ノード、似たものどうしは重み 3〜5、違うものは 0.3〜0.5",
    "② 単純な最小カット（切る辺の重みの和だけ最小）は、つながりの少ない少数のノード（画像の隅の数画素など）だけを切り離す偏った分け方を選びやすい",
    "③ 正規化カット Ncut(A,B) = cut(A,B)/assoc(A,V) + cut(A,B)/assoc(B,V)。各グループの結合の総量で割るので、小さすぎるグループは不利になる",
    f"④ 解法：ラプラシアン L = D − W の一般化固有値問題 (D − W)y = λDy の第2最小固有ベクトル y を求め、符号（しきい値）で2分割。例：y > 0 のノード {Aset_}、y ≤ 0 のノード {Bset_}",
    f"⑤ 結果：弱い辺 0.5, 0.3, 0.4 だけが切られ、Ncut = {f(ncut, 3)}。さらに各グループを再帰的に分割すれば多領域に分けられる（Shi & Malik 2000）",
], example=f"cut(A,B) = 0.5+0.3+0.4 = {f(cutAB, 1)}、assoc(A,V) = {f(assocA, 1)}、assoc(B,V) = {f(assocB, 1)}。固有値 λ2 = {f(ev[1], 4)}",
    figures=[gfig(nc_svg(), '第2固有ベクトル y の符号で2グループ（赤・青）に分ける。赤破線＝切られる辺')],
    code=r'''import numpy as np

W = np.array([[0, 5, 4, .5, 0, 0], [5, 0, 4, 0, .3, 0], [4, 4, 0, 0, 0, .4],
              [.5, 0, 0, 0, 5, 3], [0, .3, 0, 5, 0, 4], [0, 0, .4, 3, 4, 0]])
d = W.sum(1)
L = np.diag(d) - W                                   # ラプラシアン
Dm = np.diag(1 / np.sqrt(d))
lam, V = np.linalg.eigh(Dm @ L @ Dm)                 # 正規化して対称な固有値問題に
y = Dm @ V[:, 1]                                     # 第2最小固有ベクトル
A = np.where(y > 0)[0]; B = np.where(y <= 0)[0]
cut = W[np.ix_(A, B)].sum()
ncut = cut / W[A].sum() + cut / W[B].sum()
print(lam.round(4)); print(y.round(3)); print(A, B, round(ncut, 3))
'''))

# ウォーターシェッド（1D地形）
xw = np.arange(0, 41)
terrain = 60 + 40 * np.sin(xw / 40 * 2 * math.pi * 1.0 + 1.2) + 25 * np.cos(xw / 40 * 2 * math.pi * 3)
mins = [int(i) for i in range(1, 40) if terrain[i] < terrain[i - 1] and terrain[i] < terrain[i + 1]]


def ws_svg():
    W, H = 320, 190
    left, top, pw, ph = 28, 14, 284, 140
    lo, hi = terrain.min() - 10, terrain.max() + 10
    X = lambda x: left + x / 40 * pw
    Y = lambda y: top + ph - (y - lo) / (hi - lo) * ph
    b = [R(left, top, pw, ph, '#fff', '#bbb', 0.8)]
    level = 75
    # 各盆地の水
    labs = np.zeros(41, int)
    order = np.argsort(terrain)
    cols = ['#8fb8ff', '#ffb59e', '#9fe0c8', '#ffe08a']
    # 浸水シミュレーション（隣接に広がる）
    for idx in order:
        nb_l = [labs[j] for j in (idx - 1, idx + 1) if 0 <= j < 41 and labs[j]]
        if not nb_l:
            labs[idx] = labs.max() + 1
        elif len(set(nb_l)) == 1:
            labs[idx] = nb_l[0]
        else:
            labs[idx] = -1  # ダム
    for k in range(1, labs.max() + 1):
        seg = [i for i in range(41) if labs[i] == k and terrain[i] < level]
        if not seg:
            continue
        # 水面ポリゴン
        x0, x1 = min(seg), max(seg)
        pts = [(X(x0 - 0.5), Y(level))]
        for i in range(x0, x1 + 1):
            pts.append((X(i), Y(min(terrain[i], level))))
        pts.append((X(x1 + 0.5), Y(level)))
        b.append(P(pts, cols[(k - 1) % 4], 'none', 0, op=0.9))
    b.append(P([(X(x), Y(t)) for x, t in zip(xw, terrain)] + [(X(40), top + ph), (X(0), top + ph)], '#c8b89a', '#6b5b3e', 1.5, op=0.6))
    b.append(L(left, Y(level), left + pw, Y(level), BLUE, 1, '4 3') + T(left + pw - 2, Y(level) - 3, f'水位 {level}', 9, 'end', fill=BLUE))
    for i in range(41):
        if labs[i] == -1:
            b.append(L(X(i), top, X(i), Y(terrain[i]), RED, 2) + T(X(i), top + 10, 'ダム', 9, fill=RED))
    for m_ in mins:
        b.append(C(X(m_), Y(terrain[m_]), 3, '#333'))
    b.append(T(left + pw / 2, H - 6, '横軸＝位置、縦軸＝標高（勾配の大きさ）。●＝極小（盆地の底）', 9, fill='#444'))
    return svg(W, H, ''.join(b)), labs


wssvg, wslabs = ws_svg()
dams = [i for i in range(41) if wslabs[i] == -1]
E.append(dict(id='region-watershed', steps=[
    "① 入力画像（ふつうは勾配の大きさ画像）を地形の標高とみなす。エッジ（勾配大）が尾根、領域の内部（勾配小）が盆地になる",
    "② 各極小（盆地の底）に穴をあけ、低い所から水位を少しずつ上げて水を満たしていく（画素を濃度の低い順に処理）",
    "③ 水位が上がると盆地ごとの水面が広がる。別々の盆地の水が出会う位置にダム（境界線）を築く",
    f"④ 例（1次元の地形）：極小が {len(mins)} か所（位置 {mins}）→ 盆地ごとに色分けされた水がたまり、尾根の位置 {dams} にダムができる",
    "⑤ 全部沈むまで続けるとダムの線＝分水嶺が領域の境界になる。雑音の極小が多いと過分割になるので、マーカー（種）を与えて制御する（cv2.watershed）",
], example=f"水位 75 の時点：各盆地の水面が広がり、まだ合流していない。最終的なダムの位置 {dams}（地形の尾根＝勾配画像のエッジ）",
    figures=[gfig(wssvg, '盆地ごとに色の違う水がたまり、合流する尾根にダム（赤）を築く')],
    code=r'''import numpy as np
import cv2

# 2つの重なった円（くっついた粒子）を分ける典型例
img = np.zeros((40, 60), np.uint8)
cv2.circle(img, (20, 20), 12, 255, -1); cv2.circle(img, (38, 20), 12, 255, -1)
dist = cv2.distanceTransform(img, cv2.DIST_L2, 5)          # 中心ほど大きい
_, sure_fg = cv2.threshold(dist, 0.7 * dist.max(), 255, cv2.THRESH_BINARY)
n, markers = cv2.connectedComponents(sure_fg.astype(np.uint8))  # 種（マーカー）= 2つ
markers = markers + 1                                      # 背景を1に
unknown = cv2.dilate(img, np.ones((3, 3), np.uint8), iterations=2) - sure_fg.astype(np.uint8)
markers[unknown == 255] = 0                                # 未確定の領域は 0
color = cv2.cvtColor(255 - img, cv2.COLOR_GRAY2BGR)        # 地形（中心が低い）
markers = cv2.watershed(color, markers.astype(np.int32))   # 境界は -1
print('領域数', len(np.unique(markers)) - 1)               # -1 を除く
print(markers[20, 22:38])                                  # 2つの円の間に -1（ダム）
'''))

# スネーク（貪欲法）
sn_img = np.zeros((40, 40), float)
sn_img[12:28, 10:30] = 1.0
gy, gx = np.gradient(cv2.GaussianBlur(sn_img, (0, 0), 1.5))
gmag = np.hypot(gx, gy)
gmag /= gmag.max()
Nn = 24
ang = np.linspace(0, 2 * math.pi, Nn, endpoint=False)
snake = np.c_[20 + 17 * np.cos(ang), 20 + 17 * np.sin(ang)]
hist_s = [snake.copy()]
alpha, beta, gamma = 0.5, 0.4, 3.0
for it in range(60):
    dmean = np.mean(np.linalg.norm(np.roll(snake, -1, 0) - snake, axis=1))
    new = snake.copy()
    for i in range(Nn):
        best_e, best_p = None, None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                p = snake[i] + [dx, dy]
                prev, nxt = new[i - 1], snake[(i + 1) % Nn]
                ec = (np.linalg.norm(p - prev) - dmean) ** 2
                ecurv = np.sum((prev - 2 * p + nxt) ** 2)
                yi, xi = int(round(p[1])), int(round(p[0]))
                eimg = -gmag[min(max(yi, 0), 39), min(max(xi, 0), 39)]
                e = alpha * ec + beta * ecurv + gamma * eimg
                if best_e is None or e < best_e:
                    best_e, best_p = e, p
        new[i] = best_p
    snake = new
    if it in (9, 59):
        hist_s.append(snake.copy())


def sn_svg():
    W = 260
    s = 6
    b = [R(10, 10, 40 * s, 40 * s, '#111', 'none')]
    b.append(R(10 + 10 * s, 10 + 12 * s, 20 * s, 16 * s, '#ddd', 'none'))
    for k_, (sn, col, dash) in enumerate(zip(hist_s, ['#ffcc00', '#5fd3ff', RED], ['4 3', '2 2', None])):
        b.append(P([(10 + x * s, 10 + y * s) for x, y in sn], 'none', col, 2, True, dash))
        for x, y in sn[::3]:
            b.append(C(10 + x * s, 10 + y * s, 2, col))
    b.append(T(130, 10 + 40 * s + 14, '黄：初期輪郭　水色：10回後　赤：収束', 10))
    return svg(W, 10 + 40 * s + 22, ''.join(b))


E.append(dict(id='region-snake', steps=[
    f"① 対象の周りに初期輪郭（制御点 {Nn} 個の閉曲線、例：半径17の円）を置く",
    "② エネルギー E = Σ [ α·(点の間隔のばらつき) + β·(曲がり具合 |v(i−1) − 2v(i) + v(i+1)|²) − γ·|∇I(v(i))| ] を定義（内部エネルギー＝滑らかさ、画像エネルギー＝エッジ上で小さい）",
    "③ 各制御点を周囲 3×3 の候補位置のうち E が最小になる位置へ動かす（貪欲法）。これを繰り返す",
    "④ 輪郭は滑らかさを保ちながら縮み、エッジ（勾配の大きい所）に吸着して止まる",
    "⑤ 出力：対象（明るい長方形）の輪郭に沿った閉曲線。途切れたエッジでも滑らかな輪郭が得られる（曲げの項のため角は丸くなる）が、初期輪郭を対象の近くに置く必要があり、凹みの奥には入りにくい",
], example=f"α={alpha}（伸縮）, β={beta}（曲げ）, γ={gamma}（エッジの引力）。βを大きくすると角が丸く、γを大きくするとエッジにより強く吸い付く",
    figures=[gfig(sn_svg(), '初期の円（黄）が縮んで長方形の輪郭（赤）に吸着する')],
    code=r'''import numpy as np
import cv2

img = np.zeros((40, 40)); img[12:28, 10:30] = 1.0             # 明るい長方形
gy, gx = np.gradient(cv2.GaussianBlur(img, (0, 0), 1.5))
g = np.hypot(gx, gy); g /= g.max()                            # エッジの強さ
N = 24; t = np.linspace(0, 2 * np.pi, N, endpoint=False)
v = np.c_[20 + 17 * np.cos(t), 20 + 17 * np.sin(t)]           # 初期輪郭 (x, y)
a, b, c = 0.5, 0.4, 3.0
for it in range(60):                                          # 貪欲法
    dmean = np.linalg.norm(np.roll(v, -1, 0) - v, axis=1).mean()
    for i in range(N):
        cand = v[i] + np.array([[dx, dy] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
        prev, nxt = v[i - 1], v[(i + 1) % N]
        e_cont = (np.linalg.norm(cand - prev, axis=1) - dmean) ** 2     # 間隔をそろえる
        e_curv = ((prev - 2 * cand + nxt) ** 2).sum(1)                  # 曲がりを抑える
        ij = np.clip(np.round(cand).astype(int), 0, 39)
        e_img = -g[ij[:, 1], ij[:, 0]]                                  # エッジに引き寄せる
        v[i] = cand[np.argmin(a * e_cont + b * e_curv + c * e_img)]
print(v.min(0).round(1), v.max(0).round(1))                   # ほぼ長方形の境界 (10..29, 12..27)
'''))

# レベルセット 1D 断面
xl = np.linspace(0, 20, 401)
phi0 = np.minimum(np.abs(xl - 6), np.abs(xl - 14))
E.append(dict(id='region-level-set', steps=[
    "① 輪郭を直接点で持たず、1次元高い関数 φ(x, y) のゼロ等高線 {φ = 0} として表す。φ は輪郭からの符号付き距離（内側で負、外側で正）にすることが多い",
    "② 例：中心 x=6 と x=14 の2つの円（半径 r）の和集合 → φ = min(|x−6|, |x−14|) − r（図は y=中心を通る断面）",
    "③ 輪郭を法線方向に速さ F で動かすには φ を ∂φ/∂t + F|∇φ| = 0 に従って更新する。一様に広がる（F=1）なら φ が全体に下がるだけ",
    "④ r = 2, 3 では φ = 0 となる点が4つ（2つの円）だが、r = 4.5 では2つ（1つにつながった輪郭）になる → φ を下げただけで輪郭の合体が自然に起こる",
    "⑤ 分裂・合体（トポロジー変化）を自動で扱えるのが利点。速さ F をエッジで遅くすると対象の境界で止まる。計算量は多い",
], example="r=3 のとき φ(x=10) = min(4, 4) − 3 = 1 > 0（2つの円の間は外側）。r=4.5 では 4 − 4.5 = −0.5 < 0（内側）→ 合体",
    figures=[gfig(chart([(xl, phi0 - 2, '#999', '2 2'), (xl, phi0 - 3, BLUE), (xl, phi0 - 4.5, RED)], W=310, H=170, xr=(0, 20), yr=(-5, 6), xticks=[0, 6, 10, 14, 20], yticks=[-4, 0, 4], xlabel='位置 x（断面）', ylabel='φ', legend=[('r=2', '#999'), ('r=3', BLUE), ('r=4.5', RED)]).replace("</svg>", L(34, 10 + (6 - 0) / 11 * 134, 310, 10 + 6 / 11 * 134, '#333', 1.2) + T(306, 10 + 6 / 11 * 134 - 3, 'φ=0', 9, 'end') + "</svg>"), 'φ のグラフが φ=0 の線と交わる所が輪郭。φ を下げると交点が4つ→2つ（合体）')],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:40, 0:60]
d = np.minimum(np.hypot(xx - 20, yy - 20), np.hypot(xx - 40, yy - 20))   # 2つの中心からの距離
for r in (6, 8, 11):
    phi = d - r                                    # 符号付き距離（内側が負）
    inside = (phi < 0).astype(np.uint8)
    n = cv2.connectedComponents(inside)[0] - 1     # 内側の連結成分の数
    print('r =', r, ' 輪郭（領域）の数 =', n)      # 2 → 2 → 1 に合体
# φ の時間発展 φ_t = -F|∇φ|：符号付き距離なら |∇φ|=1 なので、F=1 で φ が一様に下がる
phi = d - 6.0; dt = 0.5
for step in range(1, 11):
    phi = phi - dt * 1.0                           # φ ← φ − F·|∇φ|·dt
    if step % 5 == 0:
        print(step, 'ステップ後の領域数', cv2.connectedComponents((phi < 0).astype(np.uint8))[0] - 1)
'''))

# 領域隣接グラフ
RA = np.array([
    [1, 1, 1, 2, 2, 2],
    [1, 1, 3, 3, 2, 2],
    [1, 3, 3, 3, 4, 2],
    [5, 5, 3, 4, 4, 4],
    [5, 5, 5, 4, 4, 4]])
edges_ra = set()
for y in range(5):
    for x in range(6):
        for dy, dx in ((0, 1), (1, 0)):
            yy2, xx2 = y + dy, x + dx
            if yy2 < 5 and xx2 < 6 and RA[y, x] != RA[yy2, xx2]:
                edges_ra.add(tuple(sorted((int(RA[y, x]), int(RA[yy2, xx2])))))
edges_ra = sorted(edges_ra)
cent_ra = {k: (np.argwhere(RA == k).mean(0)) for k in range(1, 6)}


def rag_svg():
    W = 320
    cs = 24
    ox, oy = 10, 14
    b = [grid(RA, ox, oy, cs, 'val', True, colors=lcol(RA))]
    gx0 = 175
    pos = {k: (gx0 + (c[1] + 0.5) * 22, oy + (c[0] + 0.5) * 24) for k, c in cent_ra.items()}
    for a_, b_ in edges_ra:
        b.append(L(*pos[a_], *pos[b_], '#444', 1.5))
    for k, (x, y) in pos.items():
        b.append(C(x, y, 12, PAL[k], '#333', 1) + T(x, y + 4, str(k), 11, fill='#fff', weight='bold'))
    b.append(arrow(160, 70, 172, 70))
    return svg(W, oy + 5 * cs + 8, ''.join(b))


E.append(dict(id='region-adjacency-graph', steps=[
    "① 入力：領域分割の結果のラベル画像（例：領域 1〜5）",
    "② 各領域をノードとし、境界を共有する（4近傍で隣り合う画素がある）領域の組を辺で結ぶ",
    f"③ 例：辺は {', '.join(f'{a}-{b}' for a, b in edges_ra)} の {len(edges_ra)} 本。領域1と4は接していないので辺なし",
    "④ ノードに領域の特徴（平均濃度・面積）、辺に境界の情報（境界長・濃度差）を持たせる",
    "⑤ 用途：過分割した小領域の統合（濃度差の小さい辺から順にまとめる）、グラフカット、物体の構造の記述",
], example="統合の例：辺 3-4 の両側の平均濃度差がしきい値以下なら 3 と 4 を1つのノードにまとめ、4 につながっていた辺 2-4, 5-4 は 2-3, 5-3 につなぎ替える",
    figures=[gfig(rag_svg(), '左：ラベル画像、右：領域隣接グラフ（接する領域を辺で結ぶ）')],
    code=r'''import numpy as np

lab = np.array([[1,1,1,2,2,2],[1,1,3,3,2,2],[1,3,3,3,4,2],[5,5,3,4,4,4],[5,5,5,4,4,4]])
edges = set()
# 右隣・下隣とラベルが違えば隣接（4近傍）
for a, b in [(lab[:, :-1], lab[:, 1:]), (lab[:-1, :], lab[1:, :])]:
    m = a != b
    edges |= {tuple(sorted(p)) for p in zip(a[m].tolist(), b[m].tolist())}
print(sorted(edges))
adj = {k: sorted({b for a, b in edges if a == k} | {a for a, b in edges if b == k}) for k in range(1, 6)}
print(adj)          # 各領域の隣接リスト
'''))

# 過分割
ov_img = np.array([
    [50, 52, 55, 58, 150, 152],
    [51, 54, 57, 60, 151, 155],
    [53, 56, 59, 62, 153, 156],
    [55, 58, 61, 64, 154, 158],
    [57, 60, 63, 66, 156, 160]])


def grow_all(img, T):
    lab = np.zeros(img.shape, int); n = 0
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            if lab[y, x]:
                continue
            n += 1; st = [(y, x)]; lab[y, x] = n
            while st:
                cy, cx = st.pop()
                for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < img.shape[0] and 0 <= nx < img.shape[1] and not lab[ny, nx] and abs(int(img[ny, nx]) - int(img[cy, cx])) <= T:
                        lab[ny, nx] = n; st.append((ny, nx))
    return lab


ov1 = grow_all(ov_img, 2); ov2 = grow_all(ov_img, 5)
E.append(dict(id='region-oversegmentation', steps=[
    "① 本来1つであるべき領域が、必要以上に多くの小領域に分かれてしまう状態を過分割という（逆に複数の物体が1つにまとまるのが過少分割）",
    "② 原因：濃度がなだらかに変化する（グラデーション・照明むら）、雑音で極小が多い（ウォーターシェッド）、しきい値が厳しすぎる",
    f"③ 例：左がゆるやかに明るくなる領域・右が明るい領域の画像。隣接画素の差 ≤ 2 でつなぐと {ov1.max()} 領域に分かれる（過分割）。差 ≤ 5 なら {ov2.max()} 領域（正しい）",
    "④ 対策：前処理で平滑化、マーカー付きウォーターシェッド、分割後に領域隣接グラフで似た隣接領域を統合する",
    "⑤ スーパーピクセルのように、わざと過分割して後段の処理単位にする使い方もある",
], example=f"差 ≤ 2：横方向の差が 2〜3 あるので左の領域が細かく切れて {ov1.max()} 領域。差 ≤ 5：左（50〜66）と右（150〜160）の2領域",
    figures=[gfig(panels([dict(a=ov_img, title='入力', mode='gray', values=True, size=8), dict(a=ov1, title=f'差≤2：{ov1.max()}領域', mode='val', colors=lcol(ov1)), dict(a=ov2, title=f'差≤5：{ov2.max()}領域', mode='val', colors=lcol(ov2))], W=320, arrows=['', '']), '条件が厳しすぎると、なだらかな領域がバラバラになる')],
    code=r'''import numpy as np

img = np.array([[50,52,55,58,150,152],[51,54,57,60,151,155],[53,56,59,62,153,156],
                [55,58,61,64,154,158],[57,60,63,66,156,160]])
def segment(img, T):            # 隣接画素の差が T 以下ならつなぐ領域成長
    lab = np.zeros(img.shape, int); n = 0
    for y, x in np.ndindex(img.shape):
        if lab[y, x]: continue
        n += 1; st = [(y, x)]; lab[y, x] = n
        while st:
            cy, cx = st.pop()
            for ny, nx in [(cy, cx + 1), (cy + 1, cx), (cy, cx - 1), (cy - 1, cx)]:
                if 0 <= ny < img.shape[0] and 0 <= nx < img.shape[1] and not lab[ny, nx] \
                        and abs(img[ny, nx] - img[cy, cx]) <= T:
                    lab[ny, nx] = n; st.append((ny, nx))
    return lab
for T in (2, 5):
    lab = segment(img, T); print('T =', T, '領域数', lab.max()); print(lab)
'''))

# 輪郭追跡（外輪郭と内輪郭）
CT = A('''
0000000000
0111111100
0110001100
0110001110
0111111100
0000000000''')
cts, hier = cv2.findContours(CT.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)


def ct_svg():
    W = 280
    cs = 24
    ox, oy = 12, 12
    b = [grid(CT, ox, oy, cs, colors=[[('#c9d6ff' if CT[r, c] else '#fff') for c in range(10)] for r in range(6)])]
    for k_, cnt in enumerate(cts):
        p_ = cnt[:, 0]
        col = RED if hier[0][k_][3] == -1 else GREEN
        b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in p_], 'none', col, 2.2))
        b.append(C(ox + (p_[0][0] + 0.5) * cs, oy + (p_[0][1] + 0.5) * cs, 4, col))
        if len(p_) > 2:
            x1, y1 = p_[0]; x2, y2 = p_[2]
            b.append(arrow(ox + (x1 + 0.5) * cs, oy + (y1 + 0.5) * cs, ox + (x1 + 0.5 + (x2 - x1) * 0.6) * cs, oy + (y1 + 0.5 + (y2 - y1) * 0.6) * cs, None, col, w=2))
    b.append(T(ox + 5 * cs, oy + 6 * cs + 14, f'赤：外輪郭（{len(cts[0]) if hier[0][0][3] == -1 else len(cts[1])}点）　緑：内輪郭＝穴の境界', 10))
    return svg(W, oy + 6 * cs + 20, ''.join(b))


outer_n = [len(c) for k, c in enumerate(cts) if hier[0][k][3] == -1][0]
inner_n = [len(c) for k, c in enumerate(cts) if hier[0][k][3] != -1][0]
E.append(dict(id='region-contour-tracing', steps=[
    "① ラスタ走査で、背景から図形に入る最初の画素（外輪郭の開始点）を見つける",
    "② 直前の進行方向を基準に、8近傍を反時計回りに調べて最初に見つかった図形画素へ進む。開始点に戻ったら一周終了",
    f"③ 外輪郭の点列（赤、{outer_n} 点）が得られる。さらに走査を続け、図形から穴（背景）に入る所を開始点として同様にたどると内輪郭（緑、{inner_n} 点）が得られる",
    "④ 外輪郭と内輪郭は親子関係（階層）として記録できる（OpenCV の RETR_CCOMP / RETR_TREE）",
    "⑤ 点列はチェーンコード・周囲長・折れ線近似・フーリエ記述子・曲率の計算に使う。4連結と8連結では得られる輪郭が違う",
], example=f"findContours（RETR_CCOMP）の結果：輪郭 {len(cts)} 本。階層 hierarchy の4番目（親）が −1 なら外輪郭、そうでなければ穴の輪郭",
    figures=[gfig(ct_svg(), '穴のある図形では外輪郭と内輪郭の2本が得られる')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,0,0],[0,1,1,0,0,0,1,1,0,0],
                [0,1,1,0,0,0,1,1,1,0],[0,1,1,1,1,1,1,1,0,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
cs, hier = cv2.findContours(img, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
for c, h in zip(cs, hier[0]):
    kind = '外輪郭' if h[3] == -1 else '内輪郭（穴）'
    pts = [tuple(int(v) for v in p[0]) for p in c]       # (x, y) の点列
    print(kind, len(pts), '点', pts[:6], '...')
# CHAIN_APPROX_SIMPLE にすると直線部分の途中の点が省かれる（頂点だけ）
cs2, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
print(len(cs2[0]), '頂点', cs2[0][:, 0].tolist())
'''))

# 4方向チェーンコード
C4S = A('''
0000000
0111100
0111100
0011100
0000000''')
# 4連結の境界追跡：境界のクラック（画素の辺）をたどる方式でコード化
def crack_chain(a):
    p = np.pad(a, 1)
    ys_, xs_ = np.nonzero(p)
    y, x = ys_[0], xs_[0]  # 左上の画素の左上の角から
    start = (y, x)
    # 角の座標 (y, x)。図形を左手に見ながら反時計回り：まず下へ
    d = 3  # 0=右,1=上,2=左,3=下
    mv = {0: (0, 1), 1: (-1, 0), 2: (0, -1), 3: (1, 0)}
    cur = start; codes_ = []
    def px(yy, xx):
        return p[yy, xx] if 0 <= yy < p.shape[0] and 0 <= xx < p.shape[1] else 0
    for _ in range(400):
        # 角 cur の周りの4画素： 左上(y-1,x-1) 右上(y-1,x) 左下(y,x-1) 右下(y,x)
        # 進行方向 d に対し、左側が図形・右側が背景となるように進む
        for turn in (1, 0, 3, 2):  # 左折, 直進, 右折, Uターン（反時計回り＝図形を左に）
            nd = (d + turn) % 4
            dy, dx = mv[nd]
            # 移動する辺の左右の画素
            if nd == 0: L_, R_ = px(cur[0] - 1, cur[1]), px(cur[0], cur[1])
            elif nd == 2: L_, R_ = px(cur[0], cur[1] - 1), px(cur[0] - 1, cur[1] - 1)
            elif nd == 1: L_, R_ = px(cur[0] - 1, cur[1] - 1), px(cur[0] - 1, cur[1])
            else: L_, R_ = px(cur[0], cur[1]), px(cur[0], cur[1] - 1)
            if L_ == 0 and R_ == 1:
                d = nd; break
        codes_.append(d)
        cur = (cur[0] + mv[d][0], cur[1] + mv[d][1])
        if cur == start:
            break
    return codes_


c4 = crack_chain(C4S)
E.append(dict(id='region-chain-code', steps=[
    "① 輪郭追跡で得た境界を、移動方向の番号の列で表す。4方向チェーンコード：右=0、上=1、左=2、下=3（8方向なら右=0から反時計回りに0〜7）",
    "② 4方向の例：図形の画素の辺（クラック）に沿って、図形を右手に見ながら左上の角から一周する",
    f"③ この図形のコード：{''.join(map(str, c4))}（{len(c4)} 個 = 周囲のクラック長）",
    "④ 始点の座標とコード列だけで輪郭を復元できる。4方向は1歩2ビット、8方向は3ビット",
    "⑤ 差分（(ci − ci−1) mod 4）をとると回転（90°単位）に不変。8方向の周囲長は 偶数コード数 + √2 × 奇数コード数",
], example=f"コード {''.join(map(str, c4))}：0（右）が {c4.count(0)} 個、2（左）が {c4.count(2)} 個で等しく、1（上）と3（下）も {c4.count(1)} 個ずつ → 閉じた輪郭",
    figures=[gfig(panels([dict(a=C4S, title='図形', mode='bin')], W=240, cs=26), '4方向コードは画素の辺をたどる'),
             {"type": "table", "head": ["方向", "右", "上", "左", "下"], "rows": [["4方向コード", "0", "1", "2", "3"], ["8方向コード", "0", "2", "4", "6"]], "caption": '8方向では斜め（1,3,5,7）が加わる'}],
    code=r'''import numpy as np

img = np.array([[0,0,0,0,0,0,0],[0,1,1,1,1,0,0],[0,1,1,1,1,0,0],
                [0,0,1,1,1,0,0],[0,0,0,0,0,0,0]])
p = np.pad(img, 1)
mv = {0: (0, 1), 1: (-1, 0), 2: (0, -1), 3: (1, 0)}      # 右,上,左,下（角の座標を動かす）
def side(c, d):    # 角 c から方向 d に進むときの (左の画素, 右の画素)
    y, x = c
    return {0: (p[y-1, x], p[y, x]), 2: (p[y, x-1], p[y-1, x-1]),
            1: (p[y-1, x-1], p[y-1, x]), 3: (p[y, x], p[y, x-1])}[d]
ys, xs = np.nonzero(p); start = cur = (ys[0], xs[0]); d = 3; codes = []
while True:
    for turn in (1, 0, 3, 2):                     # 左折・直進・右折・Uターンの順に試す
        nd = (d + turn) % 4
        if side(cur, nd) == (0, 1): d = nd; break # 右手に図形、左手に背景
    codes.append(d); cur = (cur[0] + mv[d][0], cur[1] + mv[d][1])
    if cur == start: break
print(''.join(map(str, codes)), len(codes))
print('差分', [(codes[i] - codes[i - 1]) % 4 for i in range(len(codes))])
'''))

# 面積（ラベルごと）
AR = np.array([
    [1, 1, 1, 0, 2, 2, 2, 2],
    [1, 1, 1, 0, 2, 2, 2, 2],
    [1, 1, 0, 0, 0, 2, 2, 0],
    [0, 0, 0, 3, 0, 0, 0, 0],
    [0, 3, 3, 3, 3, 3, 0, 0],
    [0, 0, 3, 3, 3, 0, 0, 0]])
ar_areas = {k: int((AR == k).sum()) for k in (1, 2, 3)}
E.append(dict(id='region-area', steps=[
    "① 入力：領域分割・ラベリング後のラベル画像",
    "② 各ラベル k について、値が k の画素数を数える＝面積 S_k（0次モーメント m00）",
    f"③ 例：領域1 = {ar_areas[1]}、領域2 = {ar_areas[2]}、領域3 = {ar_areas[3]} 画素",
    "④ 実寸に直すには画素の大きさ（例 0.2 mm/画素 → 0.04 mm²/画素）を掛ける。輪郭の多角形の面積（画素中心を結ぶ）は画素数より小さくなる",
    "⑤ 用途：小さい領域（ノイズ）の除去、大きさによる分類・検査（欠け・異物）、他の特徴量（円形度、充填率）の計算",
], example=f"np.bincount(lab.ravel()) = {np.bincount(AR.ravel()).tolist()}（0番は背景）。1画素 0.2 mm 角なら領域2は {ar_areas[2] * 0.04:.2f} mm²",
    figures=[gfig(panels([dict(a=AR, title='ラベル画像', mode='val', values=True, colors=lcol(AR))], W=240, cs=24), '面積＝各ラベルの画素数'), {"type": "table", "head": ["領域", "1", "2", "3"], "rows": [["面積（画素）"] + [str(ar_areas[k]) for k in (1, 2, 3)]]}],
    code=r'''import numpy as np
import cv2

lab = np.array([[1,1,1,0,2,2,2,2],[1,1,1,0,2,2,2,2],[1,1,0,0,0,2,2,0],
                [0,0,0,3,0,0,0,0],[0,3,3,3,3,3,0,0],[0,0,3,3,3,0,0,0]])
areas = np.bincount(lab.ravel())             # ラベルごとの画素数
print({k: int(areas[k]) for k in range(1, lab.max() + 1)})
# 小さい領域（面積 < 9）を背景にする
small = [k for k in range(1, lab.max() + 1) if areas[k] < 9]
print('除去', small); print(np.where(np.isin(lab, small), 0, lab))
# OpenCV：connectedComponentsWithStats の CC_STAT_AREA
n, l2, st, _ = cv2.connectedComponentsWithStats((lab > 0).astype(np.uint8), connectivity=4)
print(st[1:, cv2.CC_STAT_AREA])
'''))

# 周囲長と回転
def rot_rect(w, h, ang, n=40):
    yy, xx = np.mgrid[0:n, 0:n] - (n - 1) / 2
    a = math.radians(ang)
    u = xx * math.cos(a) + yy * math.sin(a); v = -xx * math.sin(a) + yy * math.cos(a)
    return ((np.abs(u) <= w / 2) & (np.abs(v) <= h / 2)).astype(np.uint8)


prow = []
for ang in (0, 30, 45):
    im = rot_rect(20, 20, ang)
    cs_, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    L8 = cv2.arcLength(cs_[0], True)
    nb = int((im - cv2.erode(im, cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3)), borderValue=0)).sum())
    pp = np.pad(im, 1).astype(int)
    crk = int(np.abs(np.diff(pp, 0)).sum() + np.abs(np.diff(pp, 1)).sum())
    prow.append([f"{ang}°", str(int(im.sum())), str(nb), f(L8, 1), str(crk)])
E.append(dict(id='region-perimeter', steps=[
    "① 領域の輪郭の長さ。ディジタル画像では定義が複数ある：境界画素数、8方向チェーンコード長（縦横1・斜め√2）、クラック長（画素の辺の数）",
    "② 例：1辺 20 の正方形（理論周囲長 80）を 0°, 30°, 45° に回転してディジタル化し、各定義で測る",
    f"③ 0° ではチェーンコード長 {prow[0][3]}・クラック長 {prow[0][4]} とほぼ正しい",
    f"④ 45° ではクラック長 {prow[2][4]}（階段状に数えて約 √2 倍に過大）、境界画素数 {prow[2][2]}（過小）、チェーンコード長 {prow[2][3]}。回転で値が変わる",
    "⑤ チェーンコード（√2 重み）が比較的安定。さらに精度が要るなら、コーナー数で補正する、輪郭を平滑化・折れ線近似してから測るなどの工夫をする",
], example="同じ正方形でも定義と向きで 70〜110 程度まで変わる → 円形度・複雑度など周囲長を使う特徴量は、比較するとき定義をそろえることが大切",
    figures=[{"type": "table", "head": ["回転", "面積", "境界画素数", "チェーンコード長", "クラック長"], "rows": prow, "caption": '1辺20の正方形（理論周囲長80）を回転してディジタル化'},
             gfig(panels([dict(a=rot_rect(8, 8, a, 13), title=f'{a}°', mode='bin') for a in (0, 30, 45)], W=280, gap=18, arrows=False), '（参考）1辺8の正方形の回転：辺が階段状になる')],
    code=r'''import numpy as np
import cv2

def square(ang, w=20, n=40):                      # 回転した正方形をディジタル化
    yy, xx = np.mgrid[0:n, 0:n] - (n - 1) / 2
    a = np.deg2rad(ang)
    u = xx * np.cos(a) + yy * np.sin(a); v = -xx * np.sin(a) + yy * np.cos(a)
    return ((abs(u) <= w / 2) & (abs(v) <= w / 2)).astype(np.uint8)
cross = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
for ang in (0, 30, 45):
    im = square(ang)
    cs, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    nb = (im - cv2.erode(im, cross, borderValue=0)).sum()          # 境界画素数
    p = np.pad(im, 1).astype(int)
    crack = np.abs(np.diff(p, axis=0)).sum() + np.abs(np.diff(p, axis=1)).sum()
    print(ang, '境界画素', nb, ' チェーン', round(cv2.arcLength(cs[0], True), 1), ' クラック', crack)
'''))


# 円形度・複雑度
def star(n=41, r1=18, r2=8, k=5):
    yy, xx = np.mgrid[0:n, 0:n] - (n - 1) / 2
    ang = np.arctan2(yy, xx); rr = np.hypot(xx, yy)
    rad = r2 + (r1 - r2) * (0.5 + 0.5 * np.cos(k * ang))
    return (rr <= rad).astype(np.uint8)


def ellipse_img(n=41, a=18, b=18):
    yy, xx = np.mgrid[0:n, 0:n] - (n - 1) / 2
    return ((xx / a) ** 2 + (yy / b) ** 2 <= 1).astype(np.uint8)


shp = {'円': ellipse_img(), '正方形': rot_rect(30, 30, 0, 41), '楕円(3:1)': ellipse_img(41, 19, 6.3), '星形': star()}
cirrows = []
for k, im in shp.items():
    cs_, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    S_ = cv2.contourArea(cs_[0]); L_ = cv2.arcLength(cs_[0], True)
    cirrows.append([k, f(S_, 0), f(L_, 1), f(4 * math.pi * S_ / L_ ** 2, 3), f(L_ ** 2 / S_, 1)])


def shapes_svg(keys):
    W = 320
    n = len(keys)
    cs = 1.6
    b = []
    for i, k in enumerate(keys):
        im = shp[k]
        ox = 10 + i * (300 / n) + (300 / n - 41 * cs) / 2
        cs_, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        b.append(P([(ox + (x + 0.5) * cs, 12 + (y + 0.5) * cs) for x, y in cs_[0][:, 0]], '#c9d6ff', BLUE, 1.2))
        b.append(T(ox + 41 * cs / 2, 12 + 41 * cs + 14, k, 10))
    return svg(W, 12 + 41 * cs + 20, ''.join(b))


E.append(dict(id='region-circularity', steps=[
    "① 領域の面積 S と周囲長 L を求める（ここでは輪郭多角形の面積とチェーンコード長でそろえる）",
    "② 円形度 e = 4πS / L²。円で1、円から外れるほど小さい（0〜1）",
    f"③ 例：円 {cirrows[0][3]}、正方形 {cirrows[1][3]}、楕円（3:1）{cirrows[2][3]}、星形 {cirrows[3][3]}",
    "④ 細長い形（楕円）も、輪郭がギザギザな形（星形）も値が下がる → 『丸さ』の総合的な指標",
    "⑤ 大きさ・回転・位置に不変。錠剤や粒子の形状検査、欠けや変形の検出に使う。ただし周囲長の定義とディジタル化誤差の影響を受ける",
], example=f"円（半径18）：S={cirrows[0][1]}, L={cirrows[0][2]} → 4π·{cirrows[0][1]}/{cirrows[0][2]}² = {cirrows[0][3]}（ディジタル化のため1よりわずかに小さい）",
    figures=[gfig(shapes_svg(list(shp)), '形の例'), {"type": "table", "head": ["図形", "面積S", "周囲長L", "円形度 4πS/L²"], "rows": [r[:4] for r in cirrows]}],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
shapes = {'円': (xx / 18) ** 2 + (yy / 18) ** 2 <= 1,
          '楕円3:1': (xx / 19) ** 2 + (yy / 6.3) ** 2 <= 1,
          '星形': np.hypot(xx, yy) <= 8 + 10 * (0.5 + 0.5 * np.cos(5 * np.arctan2(yy, xx)))}
for name, m in shapes.items():
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    S, L = cv2.contourArea(cs[0]), cv2.arcLength(cs[0], True)
    print(name, '円形度 =', round(4 * np.pi * S / L ** 2, 3))
'''))

E.append(dict(id='region-complexity', steps=[
    "① 面積 S と周囲長 L から 複雑度 C = L² / S を計算（円形度 e = 4πS/L² とは C = 4π/e の関係）",
    "② 円のとき最小値 4π ≈ 12.57。正方形 16、正三角形 ≈ 20.8。細長い・凹凸が多いほど大きくなる",
    f"③ ディジタル画像の例：円 {cirrows[0][4]}、正方形 {cirrows[1][4]}、楕円（3:1）{cirrows[2][4]}、星形 {cirrows[3][4]}",
    "④ 星形のように輪郭が入り組むと周囲長が伸びて C が急に大きくなる → 輪郭の複雑さの指標",
    "⑤ 拡大縮小・回転・平行移動に不変（無次元）。L²/(4πS) と正規化して円で1とする定義もある",
], example=f"正方形：L={cirrows[1][2]}, S={cirrows[1][1]} → {cirrows[1][2]}²/{cirrows[1][1]} = {cirrows[1][4]}（理論値16）。円形度との関係 C = 4π/e = 12.57/{cirrows[1][3]} = {f(4 * math.pi / float(cirrows[1][3]), 1)}",
    figures=[gfig(shapes_svg(list(shp)), '形の例（円形度の項と同じ）'), {"type": "table", "head": ["図形", "面積S", "周囲長L", "複雑度 L²/S"], "rows": [[r[0], r[1], r[2], r[4]] for r in cirrows]}],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
shapes = {'円': np.hypot(xx, yy) <= 18, '正方形': (abs(xx) <= 15) & (abs(yy) <= 15),
          '星形': np.hypot(xx, yy) <= 8 + 10 * (0.5 + 0.5 * np.cos(5 * np.arctan2(yy, xx)))}
for name, m in shapes.items():
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    S, L = cv2.contourArea(cs[0]), cv2.arcLength(cs[0], True)
    print(name, '複雑度 L²/S =', round(L * L / S, 2), ' (円の理論値', round(4 * np.pi, 2), ')')
'''))

# 縦横比
arim = rot_rect(30, 10, 30, 41)
ys_, xs_ = np.nonzero(arim)
bbw, bbh = xs_.max() - xs_.min() + 1, ys_.max() - ys_.min() + 1
mr = cv2.minAreaRect(np.column_stack([xs_, ys_]).astype(np.float32))
mm = moments(arim)
lam1 = (mm['mu20'] + mm['mu02'] + math.sqrt((mm['mu20'] - mm['mu02']) ** 2 + 4 * mm['mu11'] ** 2)) / 2
lam2 = (mm['mu20'] + mm['mu02'] - math.sqrt((mm['mu20'] - mm['mu02']) ** 2 + 4 * mm['mu11'] ** 2)) / 2


def ar_svg():
    W = 260
    cs = 5
    ox, oy = 25, 10
    b = []
    cs_, _ = cv2.findContours(arim, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in cs_[0][:, 0]], '#c9d6ff', BLUE, 1))
    b.append(R(ox + xs_.min() * cs, oy + ys_.min() * cs, bbw * cs, bbh * cs, 'none', RED, 1.8))
    box = cv2.boxPoints(((mr[0][0], mr[0][1]), (mr[1][0] + 1, mr[1][1] + 1), mr[2]))
    b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in box], 'none', GREEN, 1.8, dash='5 3'))
    b.append(T(W / 2, oy + 41 * cs + 12, '赤：軸に平行な外接矩形　緑：最小外接矩形', 10))
    return svg(W, oy + 41 * cs + 18, ''.join(b))


E.append(dict(id='region-aspect-ratio', steps=[
    "① 図形の細長さを表す。例：30×10 の長方形（本当の縦横比 3）を 30° 傾けた図形",
    f"② 軸に平行な外接矩形の比：幅 {bbw} × 高さ {bbh} → {f(max(bbw, bbh) / min(bbw, bbh), 2)}。回転すると値が変わり、本当の細長さと違う",
    f"③ 最小外接矩形（回転を許す）の長辺/短辺：{f(max(mr[1]) + 1, 1)}/{f(min(mr[1]) + 1, 1)} = {f((max(mr[1]) + 1) / (min(mr[1]) + 1), 2)}（回転に不変）",
    f"④ 慣性楕円：2次中心モーメントの固有値 λ1 = {f(lam1, 0)}, λ2 = {f(lam2, 0)} → 長軸/短軸 = √(λ1/λ2) = {f(math.sqrt(lam1 / lam2), 2)}",
    "⑤ 円や正方形では1、細長いほど大きい。部品の向きによらない形状判定には③か④を使う",
], example=f"慣性楕円の比 {f(math.sqrt(lam1 / lam2), 2)} は長方形の真の比 3 に近い（一様な長方形では √(λ1/λ2) = 長辺/短辺）",
    figures=[gfig(ar_svg(), '傾いた長方形：軸平行の外接矩形（赤）では細長さを正しく測れない')],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
a = np.deg2rad(30)
u, v = xx * np.cos(a) + yy * np.sin(a), -xx * np.sin(a) + yy * np.cos(a)
img = ((abs(u) <= 15) & (abs(v) <= 5)).astype(np.uint8)        # 30x10 を 30°回転
x, y, w, h = cv2.boundingRect(img)
print('軸平行', w, h, round(max(w, h) / min(w, h), 2))
ys, xs = np.nonzero(img)
(cx, cy), (rw, rh), ang = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
print('最小外接矩形', round((max(rw, rh) + 1) / (min(rw, rh) + 1), 2))   # 画素の幅 +1
M = cv2.moments(img, True)
mu = np.array([[M['mu20'], M['mu11']], [M['mu11'], M['mu02']]])
l1, l2 = sorted(np.linalg.eigvalsh(mu))[::-1]
print('慣性楕円', round(np.sqrt(l1 / l2), 2))
'''))

# 充填率
exrows = []
for k, im in [('長方形', rot_rect(30, 16, 0, 41)), ('円', ellipse_img()), ('直角三角形', np.tril(np.ones((30, 30), np.uint8))), ('星形', star())]:
    x, y, w, h = cv2.boundingRect(im)
    exrows.append([k, str(int(im.sum())), f"{w}×{h}={w * h}", f(im.sum() / (w * h), 3)])
E.append(dict(id='region-extent', steps=[
    "① 領域の面積 S と外接長方形の面積 W×H を求める",
    "② 充填率 = S / (W×H)。外接長方形をどれだけ埋めているか（0〜1）",
    f"③ 例：長方形 {exrows[0][3]}、円 {exrows[1][3]}（理論 π/4 = 0.785）、直角三角形 {exrows[2][3]}（理論 0.5）、星形 {exrows[3][3]}",
    "④ 軸に平行な外接長方形を使うと回転で値が変わる。最小外接矩形を使えば回転に不変（矩形度）",
    "⑤ 似た指標：凸度（solidity）= 面積 / 凸包の面積。部品の形状分類（四角い・丸い・三角）に使う",
], example=f"円（半径18）：画素数 {exrows[1][1]}、外接長方形 {exrows[1][2]} → {exrows[1][3]}。直角三角形 30×30：{exrows[2][1]}/900 = {exrows[2][3]}（画素の対角線上も含むので0.5より少し大きい）",
    figures=[{"type": "table", "head": ["図形", "面積S", "外接長方形", "充填率"], "rows": exrows}],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
shapes = {'長方形': ((abs(xx) <= 14) & (abs(yy) <= 7)), '円': np.hypot(xx, yy) <= 18,
          '直角三角形': np.tril(np.ones((30, 30), bool))}
for name, m in shapes.items():
    m = m.astype(np.uint8)
    x, y, w, h = cv2.boundingRect(m)              # 外接長方形
    print(name, '充填率 =', round(m.sum() / (w * h), 3))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = cv2.convexHull(cs[0])
    print('   凸度 =', round(cv2.contourArea(cs[0]) / cv2.contourArea(hull), 3))
'''))
E[-1]['figures'].insert(0, gfig(shapes_svg(['円', '星形']).replace('</svg>', '</svg>'), '円と星形（充填率の比較）'))

# 凸包（星形）
stim = star()
cs_st, _ = cv2.findContours(stim, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
hull_st = cv2.convexHull(cs_st[0])
sol = cv2.contourArea(cs_st[0]) / cv2.contourArea(hull_st)
defects = cv2.convexityDefects(cs_st[0], cv2.convexHull(cs_st[0], returnPoints=False))


def hull_svg():
    W = 260
    cs = 5
    ox, oy = 28, 8
    b = [P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in hull_st[:, 0]], '#ffe8a8', '#e4a000', 1)]
    b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in cs_st[0][:, 0]], '#c9d6ff', BLUE, 1.2))
    b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in hull_st[:, 0]], 'none', RED, 2))
    for s_, e_, fi, dd in defects[:, 0]:
        if dd / 256 > 3:
            x, y = cs_st[0][fi][0]
            b.append(C(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, 3.5, GREEN))
    b.append(T(W / 2, oy + 41 * cs + 14, f'赤：凸包　黄：凹み　緑：凸欠陥の最深点　凸度 {f(sol, 3)}', 9))
    return svg(W, oy + 41 * cs + 20, ''.join(b))


E.append(dict(id='region-convex-hull', steps=[
    "① 領域の輪郭点を入力に、すべての点を含む最小の凸多角形を求める（Graham スキャン、Andrew の単調鎖法、Jarvis の包装法など）",
    "② 例：5つの角をもつ星形 → 凸包は角の先端を結んだ五角形状（赤）",
    f"③ 凸包と領域の差＝凹み（黄）。凸度（solidity）= 領域の面積 / 凸包の面積 = {f(sol, 3)}",
    f"④ 凸欠陥：凸包の各辺から最も深く凹んだ輪郭点（緑）とその深さ。星形では谷が {int((defects[:, 0, 3] / 256 > 3).sum())} か所",
    "⑤ 用途：手の指の本数（指の間の凸欠陥）、部品の欠け・割れの検出、形状特徴量。凸図形なら凸度=1、凸欠陥なし",
], example="凸欠陥の深さが一定以上の数を数える → 星の角の数 5（手なら指の間の数 + 1 ≈ 指の本数）",
    figures=[gfig(hull_svg(), '星形の凸包と凸欠陥')],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
star = (np.hypot(xx, yy) <= 8 + 10 * (0.5 + 0.5 * np.cos(5 * np.arctan2(yy, xx)))).astype(np.uint8)
cs, _ = cv2.findContours(star, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cnt = cs[0]
hull = cv2.convexHull(cnt)                               # 凸包の頂点
print('凸包の頂点数', len(hull))
print('凸度', round(cv2.contourArea(cnt) / cv2.contourArea(hull), 3))
idx = cv2.convexHull(cnt, returnPoints=False)            # 頂点のインデックス
defects = cv2.convexityDefects(cnt, idx)                 # (始点, 終点, 最深点, 深さ×256)
deep = [(tuple(int(v) for v in cnt[f][0]), round(d / 256, 1)) for s, e, f, d in defects[:, 0] if d / 256 > 3]
print('深い凹み', len(deep), deep)
'''))

# 重心（濃淡重み付き）
CW = np.array([
    [0, 0, 0, 0, 0, 0],
    [0, 50, 100, 100, 50, 0],
    [0, 100, 200, 250, 100, 0],
    [0, 50, 100, 250, 200, 0],
    [0, 0, 0, 50, 50, 0]])
ysw, xsw = np.nonzero(CW)
xg_b, yg_b = xsw.mean(), ysw.mean()
wsum = CW.sum()
xg_w = (CW * np.arange(6)[None]).sum() / wsum
yg_w = (CW * np.arange(5)[:, None]).sum() / wsum


def cw_svg():
    W = 280
    cs = 32
    ox, oy = 14, 10
    b = [grid(CW, ox, oy, cs, 'gray', True, size=10)]
    for (gx, gy, col, lab_) in [(xg_b, yg_b, BLUE, '2値'), (xg_w, yg_w, RED, '濃淡重み')]:
        X, Y = ox + (gx + 0.5) * cs, oy + (gy + 0.5) * cs
        b.append(C(X, Y, 5, col, '#fff', 1.5))
    b.append(T(ox + 6 * cs + 6, 40, f'青：2値の重心', 10, 'start', fill=BLUE))
    b.append(T(ox + 6 * cs + 6, 54, f'({f(xg_b, 2)}, {f(yg_b, 2)})', 10, 'start', fill=BLUE))
    b.append(T(ox + 6 * cs + 6, 84, f'赤：濃淡重み', 10, 'start', fill=RED))
    b.append(T(ox + 6 * cs + 6, 98, f'({f(xg_w, 2)}, {f(yg_w, 2)})', 10, 'start', fill=RED))
    return svg(W, oy + 5 * cs + 6, ''.join(b))


E.append(dict(id='region-centroid', steps=[
    "① 2値の重心：領域の画素の座標の平均 xg = Σx / N、yg = Σy / N（= m10/m00, m01/m00）",
    f"② 例：値が 0 でない {len(xsw)} 画素の座標の平均 → ({f(xg_b, 2)}, {f(yg_b, 2)})（青）",
    f"③ 濃淡の重心：画素値 f(x,y) を重みにして xg = Σx·f / Σf、yg = Σy·f / Σf → ({f(xg_w, 2)}, {f(yg_w, 2)})（赤）。明るい 250 の画素の方へ寄る",
    "④ 重心は格子点にのらない小数値になる → 輝点の位置をサブピクセル精度で求められる（レーザースポット、星、マーカーの位置計測）",
    "⑤ 重心は中心モーメント・主軸・形状の正規化の基準点になる",
], example=f"Σf = {wsum}、Σx·f = {int((CW * np.arange(6)[None]).sum())} → xg = {f(xg_w, 3)}。Σy·f = {int((CW * np.arange(5)[:, None]).sum())} → yg = {f(yg_w, 3)}",
    figures=[gfig(cw_svg(), '濃淡を重みにすると、重心は明るい画素の方へずれる')],
    code=r'''import numpy as np
import cv2

f = np.array([[0,0,0,0,0,0],[0,50,100,100,50,0],[0,100,200,250,100,0],
              [0,50,100,250,200,0],[0,0,0,50,50,0]], float)
ys, xs = np.nonzero(f)
print('2値の重心', xs.mean().round(3), ys.mean().round(3))
yy, xx = np.mgrid[0:f.shape[0], 0:f.shape[1]]
xg = (xx * f).sum() / f.sum(); yg = (yy * f).sum() / f.sum()     # 濃淡で重み付け
print('濃淡の重心', round(xg, 3), round(yg, 3))
M = cv2.moments(f)                                               # binaryImage=False で濃淡モーメント
print(round(M['m10'] / M['m00'], 3), round(M['m01'] / M['m00'], 3))
'''))

# モーメント（濃淡）
Mc = cv2.moments(CW.astype(np.float64))
E.append(dict(id='region-moment', steps=[
    "① 画像 f(x, y) に対し (p+q) 次のモーメント m_pq = Σx Σy x^p · y^q · f(x, y)。2値画像なら f は 0/1、濃淡画像なら画素値で重み付け",
    f"② 0次 m00 = Σf ＝ 総量（2値なら面積）。例（前項の濃淡画像）：m00 = {f(Mc['m00'])}",
    f"③ 1次 m10 = Σx·f = {f(Mc['m10'])}、m01 = Σy·f = {f(Mc['m01'])} → 重心 = ({f(Mc['m10'] / Mc['m00'], 3)}, {f(Mc['m01'] / Mc['m00'], 3)})",
    f"④ 2次 m20 = Σx²·f = {f(Mc['m20'])}、m02 = {f(Mc['m02'])}、m11 = {f(Mc['m11'])} → 広がり・傾き（重心まわりに直したものが中心モーメント）",
    "⑤ 低次のモーメントで 面積・位置・向き・細長さ が分かり、組み合わせると平行移動・拡大縮小・回転に不変な特徴（Hu モーメント）になる",
], example="ひとつの画素 (x=3, y=2, f=250) の寄与：m00 に 250、m10 に 3·250 = 750、m01 に 2·250 = 500、m20 に 9·250 = 2250、m11 に 6·250 = 1500",
    figures=[{"type": "table", "head": ["次数", "モーメント", "値", "意味"], "rows": [["0", "m00", f(Mc['m00']), "総量（面積）"], ["1", "m10", f(Mc['m10']), "x の重み付き和"], ["1", "m01", f(Mc['m01']), "y の重み付き和"], ["2", "m20", f(Mc['m20']), "x 方向の広がり"], ["2", "m02", f(Mc['m02']), "y 方向の広がり"], ["2", "m11", f(Mc['m11']), "傾き"]], "caption": '重心の項の濃淡画像（6×5）のモーメント'}],
    code=r'''import numpy as np
import cv2

f = np.array([[0,0,0,0,0,0],[0,50,100,100,50,0],[0,100,200,250,100,0],
              [0,50,100,250,200,0],[0,0,0,50,50,0]], float)
yy, xx = np.mgrid[0:f.shape[0], 0:f.shape[1]]
m = lambda p, q: (xx ** p * yy ** q * f).sum()          # m_pq = ΣΣ x^p y^q f(x,y)
for p, q in [(0, 0), (1, 0), (0, 1), (2, 0), (0, 2), (1, 1)]:
    print(f'm{p}{q} =', m(p, q))
M = cv2.moments(f)                                       # OpenCV（同じ値）
print(M['m00'], M['m10'], M['m01'], M['m20'], M['m02'], M['m11'])
'''))

# 中心モーメント：平行移動で不変
SH = A('''
00000000
01110000
01111000
00110000
00000000
00000000''')
SH2 = np.roll(np.roll(SH, 2, 0), 3, 1)
m_a = moments(SH); m_b = moments(SH2)
E.append(dict(id='region-central-moment', steps=[
    "① 重心 (xg, yg) を求め、座標を重心からの差に直してモーメントを計算：μ_pq = Σ (x − xg)^p (y − yg)^q f(x, y)",
    "② 図形を平行移動しても、重心も同じだけ動くので μ_pq は変わらない（平行移動に不変）",
    f"③ 例：同じ図形を (右3, 下2) へ移動。m10 は {f(m_a['m10'])} → {f(m_b['m10'])}、m20 は {f(m_a['m20'])} → {f(m_b['m20'])} と変わるが、μ20 = {f(m_a['mu20'], 3)}・μ02 = {f(m_a['mu02'], 3)}・μ11 = {f(m_a['mu11'], 3)} は同じ",
    "④ μ00 = m00、μ10 = μ01 = 0。2次の μ20, μ02, μ11 から主軸の向きや慣性楕円が求まる",
    "⑤ 原点まわりのモーメントから計算もできる：μ20 = m20 − xg·m10、μ11 = m11 − xg·m01 など",
], example=f"μ20 = m20 − xg·m10 = {f(m_a['m20'])} − {f(m_a['xg'], 3)}·{f(m_a['m10'])} = {f(m_a['m20'] - m_a['xg'] * m_a['m10'], 3)}（移動後も {f(m_b['m20'] - m_b['xg'] * m_b['m10'], 3)}）",
    figures=[gfig(panels([dict(a=SH, title='元の図形', mode='bin'), dict(a=SH2, title='平行移動 (3,2)', mode='bin')], W=280, arrows=['移動']), '位置が変わっても形は同じ'),
             {"type": "table", "head": ["", "m10", "m20", "μ20", "μ02", "μ11"], "rows": [["元", f(m_a['m10']), f(m_a['m20']), f(m_a['mu20'], 3), f(m_a['mu02'], 3), f(m_a['mu11'], 3)], ["移動後", f(m_b['m10']), f(m_b['m20']), f(m_b['mu20'], 3), f(m_b['mu02'], 3), f(m_b['mu11'], 3)]]}],
    code=r'''import numpy as np
import cv2

a = np.zeros((6, 8), np.uint8); a[1, 1:4] = 1; a[2, 1:5] = 1; a[3, 2:4] = 1
b = np.roll(np.roll(a, 2, axis=0), 3, axis=1)         # 右に3、下に2 平行移動
def central(img):
    ys, xs = np.nonzero(img); xg, yg = xs.mean(), ys.mean()
    mu = lambda p, q: ((xs - xg) ** p * (ys - yg) ** q).sum()
    return round(mu(2, 0), 3), round(mu(0, 2), 3), round(mu(1, 1), 3)
print(central(a), central(b))                          # 同じ
Ma, Mb = cv2.moments(a, True), cv2.moments(b, True)
print(Ma['m20'], Mb['m20'], '|', round(Ma['mu20'], 3), round(Mb['mu20'], 3))
'''))

# 正規化中心モーメント：拡大
SHs = np.kron(SH[1:4, 1:5], np.ones((3, 3), int))
SHs = np.pad(SHs, 1)
mA = cv2.moments(SH.astype(np.uint8), True); mB = cv2.moments(SHs.astype(np.uint8), True)
E.append(dict(id='region-normalized-moment', steps=[
    "① 図形を s 倍に拡大すると、面積 μ00 は s² 倍、2次の中心モーメント μ20 は s⁴ 倍（座標² が s² 倍 × 画素数が s² 倍）になる",
    "② 一般に μ_pq は s^(p+q+2) 倍。そこで η_pq = μ_pq / μ00^γ、γ = (p+q)/2 + 1 で割ると s が打ち消される",
    f"③ 例：図形を3倍に拡大（各画素を 3×3 に）。μ00：{f(mA['mu20'] * 0 + mA['m00'])} → {f(mB['m00'])}（9倍）、μ20：{f(mA['mu20'], 2)} → {f(mB['mu20'], 1)}（約81倍）",
    f"④ η20 = μ20 / μ00²：{f(mA['nu20'], 4)} → {f(mB['nu20'], 4)}、η11：{f(mA['nu11'], 4)} → {f(mB['nu11'], 4)}。ほぼ同じ（差はディジタル化で画素の大きさ分の誤差）",
    "⑤ 平行移動と拡大縮小に不変な量になり、これを組み合わせて回転にも不変にしたのが Hu のモーメント不変量",
], example=f"2次なら γ = 2/2 + 1 = 2、3次なら γ = 2.5。η20 = {f(mA['mu20'], 3)}/{f(mA['m00'])}² = {f(mA['nu20'], 4)}",
    figures=[gfig(panels([dict(a=SH[1:4, 1:5], title='元', mode='bin'), dict(a=SHs, title='3倍に拡大', mode='bin')], W=260, arrows=['×3']), '形は同じで大きさだけ違う'),
             {"type": "table", "head": ["", "μ00", "μ20", "η20", "η11"], "rows": [["元", f(mA['m00']), f(mA['mu20'], 2), f(mA['nu20'], 3), f(mA['nu11'], 3)], ["×3", f(mB['m00']), f(mB['mu20'], 1), f(mB['nu20'], 3), f(mB['nu11'], 3)]]}],
    code=r'''import numpy as np
import cv2

a = np.zeros((3, 4), np.uint8); a[0, 0:3] = 1; a[1, 0:4] = 1; a[2, 1:3] = 1
b = np.kron(a, np.ones((3, 3), np.uint8))           # 3倍に拡大
def eta(img, p, q):
    ys, xs = np.nonzero(img); xg, yg = xs.mean(), ys.mean()
    mu = ((xs - xg) ** p * (ys - yg) ** q).sum()
    mu00 = len(xs)
    return mu / mu00 ** ((p + q) / 2 + 1)            # η_pq = μ_pq / μ00^γ
for img in (a, b):
    print([round(eta(img, p, q), 4) for p, q in [(2, 0), (0, 2), (1, 1)]])
M = cv2.moments(b, True)
print(round(M['nu20'], 4), round(M['nu02'], 4), round(M['nu11'], 4))   # OpenCV の nu
'''))

# 慣性主軸（楕円）
el_img = rot_rect(28, 10, -25, 41)
me = moments(el_img)
the = 0.5 * math.atan2(2 * me['mu11'], me['mu20'] - me['mu02'])
l1 = (me['mu20'] + me['mu02'] + math.sqrt((me['mu20'] - me['mu02']) ** 2 + 4 * me['mu11'] ** 2)) / 2
l2 = (me['mu20'] + me['mu02'] - math.sqrt((me['mu20'] - me['mu02']) ** 2 + 4 * me['mu11'] ** 2)) / 2
N0 = me['m00']
a_ax, b_ax = 2 * math.sqrt(l1 / N0), 2 * math.sqrt(l2 / N0)


def pax_svg():
    W = 260
    cs = 5
    ox, oy = 28, 8
    cs_, _ = cv2.findContours(el_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    b = [P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in cs_[0][:, 0]], '#c9d6ff', BLUE, 1)]
    gx, gy = ox + (me['xg'] + 0.5) * cs, oy + (me['yg'] + 0.5) * cs
    deg = math.degrees(the)
    b.append(f"<ellipse cx='{f(gx)}' cy='{f(gy)}' rx='{f(a_ax * cs)}' ry='{f(b_ax * cs)}' transform='rotate({f(deg)} {f(gx)} {f(gy)})' fill='none' stroke='{GREEN}' stroke-width='1.8' stroke-dasharray='4 2'/>")
    Lh = 19 * cs
    b.append(L(gx - Lh * math.cos(the), gy - Lh * math.sin(the), gx + Lh * math.cos(the), gy + Lh * math.sin(the), RED, 2))
    b.append(C(gx, gy, 3.5, RED))
    b.append(T(W / 2, oy + 41 * cs + 14, f'赤：慣性主軸 θ={f(deg, 1)}°　緑：慣性楕円', 10))
    return svg(W, oy + 41 * cs + 20, ''.join(b))


E.append(dict(id='region-principal-axis', steps=[
    "① 重心と2次の中心モーメント μ20, μ02, μ11 を求める",
    f"② 例：長方形（28×10）を傾けた図形 → μ20 = {f(me['mu20'], 0)}, μ02 = {f(me['mu02'], 0)}, μ11 = {f(me['mu11'], 0)}",
    f"③ 主軸の角度 θ = ½·atan2(2μ11, μ20 − μ02) = {f(math.degrees(the), 1)}°（画像座標は y 下向きなので負の角度＝画面上で右上がり）",
    f"④ 行列 [[μ20, μ11],[μ11, μ02]] の固有値 λ1 = {f(l1, 0)}, λ2 = {f(l2, 0)} が主軸方向・直交方向の慣性。同じ2次モーメントをもつ一様な楕円（慣性楕円）の半軸は 2√(λ/μ00) = {f(a_ax, 1)}, {f(b_ax, 1)}",
    "⑤ 主軸の向きで物体の向きを、λ1/λ2 で細長さを評価。主軸が水平になるよう回転すれば向きの正規化ができる",
], example=f"真の傾き 25°（画面上で右上がり）に対し θ = {f(math.degrees(the), 1)}°。楕円の半軸 {f(a_ax, 1)} : {f(b_ax, 1)} ≈ 長方形の比 28:10 に近い比",
    figures=[gfig(pax_svg(), '慣性主軸と、同じ2次モーメントをもつ慣性楕円')],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
a = np.deg2rad(-25)
u, v = xx * np.cos(a) + yy * np.sin(a), -xx * np.sin(a) + yy * np.cos(a)
img = ((abs(u) <= 14) & (abs(v) <= 5)).astype(np.uint8)          # 傾いた長方形
M = cv2.moments(img, True)
mu20, mu02, mu11 = M['mu20'], M['mu02'], M['mu11']
theta = 0.5 * np.arctan2(2 * mu11, mu20 - mu02)
lam = np.linalg.eigvalsh([[mu20, mu11], [mu11, mu02]])[::-1]    # λ1 ≥ λ2
print('θ =', round(np.rad2deg(theta), 1), '度')
print('慣性楕円の半軸', (2 * np.sqrt(lam / M['m00'])).round(2))
ys, xs = np.nonzero(img)                                         # fitEllipse でも近い楕円
print(cv2.fitEllipse(np.column_stack([xs, ys]).astype(np.float32)))
'''))

# Hu モーメント
base_shape = np.zeros((60, 60), np.uint8)
cv2.fillPoly(base_shape, [np.array([[15, 15], [40, 15], [40, 22], [24, 22], [24, 28], [36, 28], [36, 35], [24, 35], [24, 45], [15, 45]], np.int32)], 1)  # Fの字
Mr = cv2.getRotationMatrix2D((30, 30), 40, 1.0)
rot_s = cv2.warpAffine(base_shape, Mr, (60, 60), flags=cv2.INTER_NEAREST)
sc_s = cv2.resize(base_shape, None, fx=0.6, fy=0.6, interpolation=cv2.INTER_NEAREST)
mir_s = base_shape[:, ::-1].copy()
hu_rows = []
for name, im in [('元', base_shape), ('40°回転', rot_s), ('0.6倍', sc_s), ('鏡映', mir_s)]:
    hu = cv2.HuMoments(cv2.moments(im, True)).ravel()
    lg = [-math.copysign(1, h) * math.log10(abs(h)) if h != 0 else 0 for h in hu]
    hu_rows.append([name] + [f(lg[k], 2) for k in (0, 1, 3, 6)])


def hu_svg():
    W = 320
    b = []
    for i, (im, t) in enumerate([(base_shape, '元'), (rot_s, '40°回転'), (sc_s, '0.6倍'), (mir_s, '鏡映')]):
        ox = 8 + i * 78
        cs = 1.1
        cs_, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        b.append(R(ox, 6, 66, 66, '#fff', '#ddd', 0.6))
        b.append(P([(ox + (x + 0.5) * cs, 6 + (y + 0.5) * cs) for x, y in cs_[0][:, 0]], '#c9d6ff', BLUE, 1))
        b.append(T(ox + 33, 86, t, 10))
    return svg(W, 92, ''.join(b))


E.append(dict(id='region-hu-moments', steps=[
    "① 正規化中心モーメント η_pq（平行移動・拡大縮小に不変）を2次と3次まで求める",
    "② Hu の7つの組合せを計算：φ1 = η20 + η02、φ2 = (η20 − η02)² + 4η11²、φ3〜φ7 は3次の η を使った式。この組合せは回転しても値が変わらない",
    "③ 例：F の字を 40°回転・0.6倍縮小・鏡映した図形の φ1〜φ7 を比べる（値は桁が大きく違うので −sign·log10|φ| で表示）",
    "④ 回転・縮小では φ1〜φ7 がほぼ同じ（差はディジタル化の誤差）。鏡映では φ1〜φ6 は同じで φ7 だけ符号が反転 → 裏返しを見分けられる",
    "⑤ 用途：向き・大きさ・位置によらない形状照合（cv2.matchShapes は Hu モーメントを使う）。高次ほど雑音に弱い",
], example=f"φ1 の −log10：元 {hu_rows[0][1]}、回転 {hu_rows[1][1]}、縮小 {hu_rows[2][1]}、鏡映 {hu_rows[3][1]}。φ7：元 {hu_rows[0][4]}、鏡映 {hu_rows[3][4]}（符号が逆）",
    figures=[gfig(hu_svg(), '同じ形を回転・縮小・鏡映'), {"type": "table", "head": ["", "φ1", "φ2", "φ4", "φ7"], "rows": hu_rows, "caption": '−sign(φ)·log10|φ|（φ3, φ5, φ6 は省略）'}],
    code=r'''import numpy as np
import cv2

F = np.zeros((60, 60), np.uint8)
cv2.fillPoly(F, [np.array([[15,15],[40,15],[40,22],[24,22],[24,28],[36,28],[36,35],[24,35],[24,45],[15,45]], np.int32)], 1)
rot = cv2.warpAffine(F, cv2.getRotationMatrix2D((30, 30), 40, 1.0), (60, 60), flags=cv2.INTER_NEAREST)
small = cv2.resize(F, None, fx=0.6, fy=0.6, interpolation=cv2.INTER_NEAREST)
mirror = F[:, ::-1].copy()
for name, im in [('元', F), ('回転', rot), ('縮小', small), ('鏡映', mirror)]:
    hu = cv2.HuMoments(cv2.moments(im, True)).ravel()
    print(name, (-np.sign(hu) * np.log10(np.abs(hu))).round(2))
# φ1 を自分で：η20 + η02
M = cv2.moments(F, True); print(round(M['nu20'] + M['nu02'], 6))
print(round(cv2.matchShapes(F, rot, cv2.CONTOURS_MATCH_I1, 0), 4))   # 0 に近いほど似ている
'''))

# フーリエ記述子
cnt_st = cs_st[0][:, 0].astype(float)
# 等間隔リサンプリング
seglen = np.linalg.norm(np.diff(np.r_[cnt_st, cnt_st[:1]], axis=0), axis=1)
sacc = np.r_[0, np.cumsum(seglen)]
Np = 128
tt = np.linspace(0, sacc[-1], Np, endpoint=False)
cx_ = np.interp(tt, sacc, np.r_[cnt_st[:, 0], cnt_st[0, 0]])
cy_ = np.interp(tt, sacc, np.r_[cnt_st[:, 1], cnt_st[0, 1]])
z = cx_ + 1j * cy_
Z = np.fft.fft(z)


def recon(K):
    Zk = np.zeros_like(Z)
    idx = list(range(0, K + 1)) + list(range(Np - K, Np))
    Zk[idx] = Z[idx]
    return np.fft.ifft(Zk)


def fd_svg():
    W = 320
    b = []
    for i, K in enumerate([1, 3, 5, 12]):
        ox = 6 + i * 79
        zr = recon(K)
        s = 1.75
        b.append(P([(ox + (p.real - 2) * s, 8 + (p.imag - 2) * s) for p in z], 'none', '#bbb', 1))
        b.append(P([(ox + (p.real - 2) * s, 8 + (p.imag - 2) * s) for p in zr], 'none', RED, 1.6))
        b.append(T(ox + 34, 86, f'K = {K}', 10))
    return svg(W, 92, ''.join(b))


dom = max(abs(Z[1]), abs(Z[Np - 1])); domu = 1 if abs(Z[1]) >= abs(Z[Np - 1]) else -1
mags = np.abs(Z) / dom
E.append(dict(id='region-fourier-descriptor', steps=[
    f"① 輪郭を一定間隔で N 点（例 N = {Np}）たどり、各点を複素数 z(k) = x(k) + j·y(k) で表す",
    "② z(k) を離散フーリエ変換して係数 Z(u) を得る。低い周波数（|u| 小）は大まかな形、高い周波数は細かな凹凸を表す",
    "③ 低い方から K 個（±K）の係数だけ残して逆変換すると、輪郭を平滑化した近似形が得られる。例：星形で K=1 → 円、K=5 → 5つの角が出る、K=12 → ほぼ元通り",
    "④ 不変化：Z(0) を除く → 平行移動不変、|Z(u)|/|Z(1)| → 拡大縮小不変、絶対値だけ使う → 回転・始点に不変",
    f"⑤ 少数の係数で形を比較できる（形状の照合・分類）。5回対称の星形では、一番大きい基本成分 u = {domu} から 5 ずつずれた u = {domu + 5}, {domu - 5} に大きな係数が出る",
], example="基本成分で正規化した大きさ：" + ', '.join(f"u={u}:{f(mags[u % Np], 3)}" for u in (domu, domu + 5, domu - 5, 2, 3, -2, -3)),
    figures=[gfig(fd_svg(), '灰：元の輪郭（星形）、赤：低周波 ±K 個の係数から復元')],
    code=r'''import numpy as np
import cv2

yy, xx = np.mgrid[0:41, 0:41] - 20
star = (np.hypot(xx, yy) <= 8 + 10 * (0.5 + 0.5 * np.cos(5 * np.arctan2(yy, xx)))).astype(np.uint8)
cs, _ = cv2.findContours(star, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
p = cs[0][:, 0].astype(float)
seg = np.linalg.norm(np.diff(np.r_[p, p[:1]], axis=0), axis=1)        # 等間隔に取り直す
s = np.r_[0, np.cumsum(seg)]; t = np.linspace(0, s[-1], 128, endpoint=False)
z = np.interp(t, s, np.r_[p[:, 0], p[0, 0]]) + 1j * np.interp(t, s, np.r_[p[:, 1], p[0, 1]])
Z = np.fft.fft(z)                                                    # フーリエ記述子
u1 = 1 if abs(Z[1]) >= abs(Z[-1]) else -1                           # 基本成分（輪郭の回る向きで ±1）
desc = np.abs(np.r_[Z[1:8], Z[-7:]]) / np.abs(Z[u1])                # 移動・拡大・回転に不変
print(desc.round(3))
def reconstruct(K):                                                  # 低周波 ±K だけで復元
    Zk = np.zeros_like(Z); Zk[:K + 1] = Z[:K + 1]; Zk[-K:] = Z[-K:]
    return np.fft.ifft(Zk)
for K in (1, 5, 12):
    print(K, '復元誤差', round(np.abs(reconstruct(K) - z).mean(), 2))
'''))

# 折れ線近似（Douglas-Peucker）
cv_pts = np.array([[0, 0], [1, 0.4], [2, 1.2], [3, 2.6], [4, 3.0], [5, 2.9], [6, 2.2], [7, 1.0], [8, 0.6], [9, 0.8], [10, 1.4]])


def dp(pts, eps, rec):
    a, b_ = pts[0], pts[-1]
    if len(pts) < 3:
        return [a, b_]
    u_, w_ = b_ - a, pts - a
    d = np.abs(u_[0] * w_[:, 1] - u_[1] * w_[:, 0]) / np.linalg.norm(u_)
    i = int(np.argmax(d))
    rec.append((tuple(a), tuple(b_), tuple(pts[i]), float(d[i])))
    if d[i] > eps:
        l1 = dp(pts[:i + 1], eps, rec); l2 = dp(pts[i:], eps, rec)
        return l1[:-1] + l2
    return [a, b_]


rec_dp = []
poly = dp(cv_pts, 0.5, rec_dp)


def dp_svg():
    p = Plane((0, 10), (0, 3.5), W=300, pad=18).axes(1, labels=True, lab_every=2)
    p.poly(cv_pts, 'none', '#999', 1.2, closed=False)
    for q in cv_pts:
        p.dot(q, 2.5, '#666')
    a, b_, far, d = rec_dp[0]
    p.line(a, b_, ORANGE, 1.3, '4 3')
    p.dot(far, 4, ORANGE, f'最遠点 d={f(d, 2)}', 5, -6)
    p.poly([tuple(q) for q in poly], 'none', RED, 2, closed=False)
    for q in poly:
        p.dot(q, 3.5, RED)
    return p.svg()


E.append(dict(id='region-polyline', steps=[
    "① 入力：輪郭や曲線の点列（例：11点）と許容誤差 ε（例 0.5）",
    "② 始点と終点を線分で結び、その線分から最も遠い点を探す（Douglas–Peucker 法）",
    f"③ 例：始点 (0,0)・終点 (10,1.4) の線分から最も遠いのは {tuple(float(v) for v in rec_dp[0][2])}（距離 {f(rec_dp[0][3], 2)} > ε）→ この点で2つに分割",
    "④ 分けた各部分に同じ処理を再帰的に行い、最遠点の距離が ε 以下になったら線分1本で近似する",
    f"⑤ 出力：頂点 {len(poly)} 個の折れ線（赤）{[tuple(float(v) for v in q) for q in poly]}。ε を大きくすると頂点が減る（データ削減、多角形の頂点検出）",
], example=f"再帰の記録（線分→最遠点・距離）：" + ' / '.join(f"{tuple(map(float, a))}-{tuple(map(float, b_))}→{tuple(map(float, q))} {f(d, 2)}" for a, b_, q, d in rec_dp[:4]),
    figures=[gfig(dp_svg(), '灰：元の点列、橙破線：最初の弦と最遠点、赤：折れ線近似（ε=0.5）')],
    code=r'''import numpy as np
import cv2

pts = np.array([[0, 0], [1, .4], [2, 1.2], [3, 2.6], [4, 3.0], [5, 2.9], [6, 2.2], [7, 1.0], [8, .6], [9, .8], [10, 1.4]])
def douglas_peucker(p, eps):
    a, b = p[0], p[-1]
    if len(p) < 3: return [a, b]
    u, w = b - a, p - a
    d = np.abs(u[0] * w[:, 1] - u[1] * w[:, 0]) / np.linalg.norm(u)   # 弦からの距離
    i = int(np.argmax(d))
    if d[i] <= eps: return [a, b]                               # 線分1本で近似
    return douglas_peucker(p[:i + 1], eps)[:-1] + douglas_peucker(p[i:], eps)
poly = douglas_peucker(pts, 0.5)
print([tuple(map(float, q)) for q in poly])
# OpenCV：cv2.approxPolyDP（閉曲線なら closed=True）
print(cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), 0.5, False).reshape(-1, 2))
'''))

# 曲率
tq = np.linspace(0, 2 * math.pi, 200, endpoint=False)
ea, eb = 3.0, 1.5
ex, ey = ea * np.cos(tq), eb * np.sin(tq)
dx1, dy1 = -ea * np.sin(tq), eb * np.cos(tq)
dx2, dy2 = -ea * np.cos(tq), -eb * np.sin(tq)
kap = (dx1 * dy2 - dy1 * dx2) / (dx1 ** 2 + dy1 ** 2) ** 1.5
E.append(dict(id='region-curvature', steps=[
    "① 曲線を (x(t), y(t)) とし、曲率 κ = (x′y″ − y′x″) / (x′² + y′²)^(3/2)（接線の向きの変化率 dθ/ds、曲率円の半径の逆数）",
    "② 直線は κ = 0、半径 r の円は κ = 1/r（どこでも一定）",
    f"③ 例：楕円 x = 3cos t, y = 1.5 sin t。長軸の端（t = 0）では κ = a/b² = 3/1.5² = {f(ea / eb ** 2, 3)}（よく曲がる）、短軸の端（t = 90°）では κ = b/a² = {f(eb / ea ** 2, 3)}（ゆるやか）",
    "④ ディジタル輪郭では点列を平滑化してから差分で微分を近似する（またはチェーンコードの方向変化 ÷ 長さ）",
    "⑤ 曲率の極大点＝コーナー（角）。形状の特徴点、折れ線近似の頂点、輪郭の分割に使う。符号で凸（正）・凹（負）を区別できる",
], example=f"t=0：x′=0, y′=1.5, x″=−3, y″=0 → κ = (0·0 − 1.5·(−3)) / 1.5³ = 4.5/3.375 = {f(4.5 / 3.375, 3)}",
    figures=[gfig(chart([(np.degrees(tq), kap, BLUE)], W=310, H=150, xr=(0, 360), yr=(0, 1.5), xticks=[0, 90, 180, 270, 360], yticks=[0, 0.5, 1, 1.333], xlabel='パラメータ t（度）', ylabel='曲率 κ'), '楕円（3:1.5）の曲率：長軸の端（0°, 180°）で最大'),
             gfig(svg(260, 122, P([(130 + x * 35, 55 - y * 35) for x, y in zip(ex, ey)], 'none', '#999', 1.2) + ''.join(C(130 + x * 35, 55 - y * 35, 1.6 + 3 * k, RED) for x, y, k in zip(ex[::8], ey[::8], kap[::8])) + T(130, 118, '赤丸の大きさ＝曲率', 10)), '長軸の端ほど曲率が大きい')],
    code=r'''import numpy as np

t = np.linspace(0, 2 * np.pi, 400, endpoint=False)
x, y = 3 * np.cos(t), 1.5 * np.sin(t)                     # 楕円
def curvature(x, y):                                       # 差分で微分を近似
    d = lambda a: (np.roll(a, -1) - np.roll(a, 1)) / 2      # 閉曲線なので周期的な中心差分
    dx, dy = d(x), d(y)
    ddx, ddy = d(dx), d(dy)
    return (dx * ddy - dy * ddx) / (dx ** 2 + dy ** 2) ** 1.5
k = curvature(x, y)
print('t=0:', k[0].round(3), ' t=90°:', k[100].round(3))  # a/b² と b/a²
print(np.argmax(k), np.argmin(k))                          # 極大＝長軸の端（コーナー候補）
# ディジタル輪郭（findContours の点列）では、先に点列を平滑化してから同じ計算をする
'''))

# エッジの連結（ヒステリシス）
EM = np.array([
    [0, 10, 20, 15, 0, 0, 0],
    [0, 90, 40, 45, 50, 0, 35],
    [0, 0, 0, 0, 55, 0, 0],
    [0, 0, 30, 0, 60, 95, 0],
    [40, 0, 0, 0, 0, 0, 0]])
hi_t, lo_t = 80, 30
strong = EM >= hi_t
weak = (EM >= lo_t) & ~strong
keep = strong.copy()
changed = True
while changed:
    changed = False
    for y, x in np.argwhere(weak & ~keep):
        if keep[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any():
            keep[y, x] = True; changed = True
hcols = [[('#e4572e' if strong[r, c] else '#3a86ff' if keep[r, c] else '#cfd8e8' if weak[r, c] else '#fff') for c in range(7)] for r in range(5)]
E.append(dict(id='region-edge-linking', steps=[
    "① 入力：エッジ強度（勾配の大きさ）の画像。雑音や弱いコントラストでエッジが途切れたり、孤立した点が混じったりしている",
    f"② 2つのしきい値を使う（ヒステリシス）：強いエッジ ≥ {hi_t}（確実）、弱いエッジ {lo_t}〜{hi_t}（候補）",
    "③ 強いエッジから出発して、8近傍でつながる弱いエッジを順にたどって採用する（勾配方向が近いことも条件にできる）",
    f"④ 例：90 と 95 の強いエッジの間を 40, 45, 50, 55, 60 の弱いエッジがつなぐ → 1本の線（青）。強いエッジにつながらない 35, 30, 40（灰）は捨てる",
    "⑤ 出力：途切れの少ない連続した境界線。Canny 法の最終段がこれ。さらに離れた断片はハフ変換や輪郭の追跡でつなぐ",
], example=f"採用されたエッジ画素 {int(keep.sum())} 個（強 {int(strong.sum())} ＋ 連結した弱 {int((keep & weak).sum())}）。孤立した弱エッジ {int((weak & ~keep).sum())} 個は除去",
    figures=[gfig(panels([dict(a=EM, title='エッジ強度', mode='val', values=True), dict(a=EM, title='ヒステリシス連結', colors=hcols, values=[[str(v) if v >= lo_t else '' for v in r] for r in EM])], W=320, arrows=['']), '赤＝強いエッジ、青＝強いエッジにつながった弱いエッジ（採用）、灰＝孤立した弱いエッジ（除去）')],
    code=r'''import numpy as np
import cv2

mag = np.array([[0,10,20,15,0,0,0],[0,90,40,45,50,0,35],[0,0,0,0,55,0,0],
                [0,0,30,0,60,95,0],[40,0,0,0,0,0,0]])
hi, lo = 80, 30
strong, weak = mag >= hi, (mag >= lo) & (mag < hi)
keep = strong.copy()
while True:                                          # 強いエッジから弱いエッジへ広げる
    p = np.pad(keep, 1)
    nb = np.zeros_like(keep)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nb |= p[1 + dy:1 + dy + keep.shape[0], 1 + dx:1 + dx + keep.shape[1]]
    new = keep | (weak & nb)
    if (new == keep).all(): break
    keep = new
print(keep.astype(int))
# Canny（内部でヒステリシス連結を行う）
img = np.zeros((20, 20), np.uint8); img[:, 10:] = 200
print(np.argwhere(cv2.Canny(img, lo, hi) > 0)[:3])
'''))

# テクスチャ
rng2 = np.random.default_rng(7)
t_smooth = np.clip(120 + rng2.normal(0, 4, (8, 8)), 0, 255).astype(int)
t_stripe = np.tile([60, 60, 180, 180], (8, 2))
t_rand = rng2.integers(40, 220, (8, 8))


def glcm(img, levels, dx=1, dy=0, sym=False):
    P_ = np.zeros((levels, levels))
    H, W = img.shape
    for y in range(H):
        for x in range(W):
            y2, x2 = y + dy, x + dx
            if 0 <= y2 < H and 0 <= x2 < W:
                P_[img[y, x], img[y2, x2]] += 1
                if sym:
                    P_[img[y2, x2], img[y, x]] += 1
    return P_


def feats(P_):
    P_ = P_ / P_.sum()
    i, j = np.indices(P_.shape)
    asm = (P_ ** 2).sum()
    ent = -(P_[P_ > 0] * np.log2(P_[P_ > 0])).sum()
    con = ((i - j) ** 2 * P_).sum()
    idm = (P_ / (1 + (i - j) ** 2)).sum()
    mx = (i * P_).sum(); my = (j * P_).sum()
    sx = math.sqrt(((i - mx) ** 2 * P_).sum()); sy = math.sqrt(((j - my) ** 2 * P_).sum())
    cor = (((i - mx) * (j - my) * P_).sum() / (sx * sy)) if sx * sy > 0 else float('nan')
    return dict(asm=asm, ent=ent, con=con, idm=idm, cor=cor)


def q4(img):
    return np.clip((np.asarray(img) // 64), 0, 3)


tx_rows = []
for name, im in [('平坦', t_smooth), ('縞', t_stripe), ('ランダム', t_rand)]:
    ft = feats(glcm(q4(im), 4))
    tx_rows.append([name, f(im.mean(), 1), f(im.std(), 1), f(ft['con'], 2), f(ft['ent'], 2)])
E.append(dict(id='region-texture', steps=[
    "① テクスチャ＝表面の模様（きめ）の性質。『粗い／細かい』『方向性がある／ない』『規則的／ランダム』などを数値化する",
    "② 1次統計量（ヒストグラムの平均・分散など）：画素の並び方は考えない",
    "③ 2次統計量（同時生起行列のコントラスト・エントロピー・相関など、ランレングス行列）：隣り合う画素の関係を見る",
    "④ 周波数特徴（パワースペクトルのリング・くさび）、フィルタバンク（ガボール）、フラクタル次元、LBP なども使う",
    f"⑤ 例：平坦・縞・ランダムの3つの模様。縞は分散が大きくても横方向のコントラスト {tx_rows[1][3]} が規則的、ランダムはエントロピー {tx_rows[2][4]} が最大",
], example="同じ平均・分散でも並び方が違えば見た目は違う → 2次統計量や周波数特徴が必要（濃度ヒストグラムの統計量の項を参照）",
    figures=[gfig(panels([dict(a=t_smooth, title='平坦', mode='gray'), dict(a=t_stripe, title='縞', mode='gray'), dict(a=t_rand, title='ランダム', mode='gray')], W=300, gap=20, arrows=False), '3種類のテクスチャ'), {"type": "table", "head": ["模様", "平均", "標準偏差", "コントラスト", "エントロピー"], "rows": tx_rows, "caption": '同時生起行列は4階調・右隣で計算'}],
    code=r'''import numpy as np

rng = np.random.default_rng(7)
tex = {'平坦': np.clip(120 + rng.normal(0, 4, (8, 8)), 0, 255).astype(int),
       '縞': np.tile([60, 60, 180, 180], (8, 2)), 'ランダム': rng.integers(40, 220, (8, 8))}
def glcm(q, L=4):                    # 右隣との同時生起行列（確率）
    P = np.zeros((L, L))
    np.add.at(P, (q[:, :-1].ravel(), q[:, 1:].ravel()), 1)
    return P / P.sum()
for name, im in tex.items():
    P = glcm(im // 64)               # 4階調に量子化
    i, j = np.indices(P.shape)
    con = ((i - j) ** 2 * P).sum()
    ent = -(P[P > 0] * np.log2(P[P > 0])).sum()
    print(f'{name}: 平均 {im.mean():.1f} 標準偏差 {im.std():.1f} コントラスト {con:.2f} エントロピー {ent:.2f}')
'''))

# ヒストグラム統計
hA = np.array([[50, 50, 200, 200], [50, 50, 200, 200], [50, 50, 200, 200], [100, 100, 150, 150]])
hB = np.array([[50, 200, 50, 200], [200, 50, 200, 50], [50, 200, 50, 200], [100, 150, 100, 150]])


def hstats(im):
    v = im.ravel().astype(float)
    m = v.mean(); s = v.std()
    sk = ((v - m) ** 3).mean() / s ** 3
    ku = ((v - m) ** 4).mean() / s ** 4
    _, cnt = np.unique(v, return_counts=True); p = cnt / cnt.sum()
    en = -(p * np.log2(p)).sum()
    return [f(m, 2), f(s * s, 1), f(sk, 3), f(ku, 3), f(en, 3)]


E.append(dict(id='region-histogram-stats', steps=[
    "① 領域の濃度ヒストグラム（各濃度の画素数）を作り、確率 p(i) に正規化する",
    "② 平均 μ = Σ i·p(i)（明るさ）、分散 σ² = Σ (i−μ)² p(i)（コントラスト）",
    "③ 歪度 = Σ (i−μ)³ p(i) / σ³（分布の左右の偏り）、尖度 = Σ (i−μ)⁴ p(i) / σ⁴（とがり具合）、エントロピー = −Σ p(i) log₂ p(i)（ばらつき）",
    f"④ 例：A（左右に分かれた模様）と B（市松模様）は同じ画素値の集まり → 平均 {hstats(hA)[0]}、分散 {hstats(hA)[1]}、エントロピー {hstats(hA)[4]} がまったく同じ",
    "⑤ 計算は軽いが、画素の並び方を見ないので A と B を区別できない → 同時生起行列などの2次統計量が必要",
], example=f"16画素：50 が6個、200 が6個、100 と 150 が2個ずつ。μ = (50·6 + 200·6 + 100·2 + 150·2)/16 = {hstats(hA)[0]}。エントロピー = −(2·0.375·log₂0.375 + 2·0.125·log₂0.125) = {hstats(hA)[4]} ビット",
    figures=[gfig(panels([dict(a=hA, title='A', mode='gray', values=True), dict(a=hB, title='B', mode='gray', values=True)], W=260, gap=30, arrows=False), '同じヒストグラムで並び方だけが違う2つの模様'), {"type": "table", "head": ["", "平均", "分散", "歪度", "尖度", "エントロピー"], "rows": [["A"] + hstats(hA), ["B"] + hstats(hB)]}],
    code=r'''import numpy as np

A = np.array([[50,50,200,200],[50,50,200,200],[50,50,200,200],[100,100,150,150]])
B = np.array([[50,200,50,200],[200,50,200,50],[50,200,50,200],[100,150,100,150]])
def stats(img):
    v, cnt = np.unique(img, return_counts=True)
    p = cnt / cnt.sum()                                   # 正規化ヒストグラム
    mu = (v * p).sum(); var = ((v - mu) ** 2 * p).sum(); s = np.sqrt(var)
    skew = ((v - mu) ** 3 * p).sum() / s ** 3
    kurt = ((v - mu) ** 4 * p).sum() / s ** 4
    ent = -(p * np.log2(p)).sum()
    return np.round([mu, var, skew, kurt, ent], 3)
print('A', stats(A)); print('B', stats(B))                 # 全く同じ
print('横の差の平均', np.abs(np.diff(A, axis=1)).mean(), np.abs(np.diff(B, axis=1)).mean())  # 並びの違い
'''))

# 同時生起行列
G4 = np.array([[0, 0, 1, 1], [0, 0, 1, 1], [0, 2, 2, 2], [2, 2, 3, 3]])
Pc = glcm(G4, 4)
Ps = glcm(G4, 4, sym=True)
Pn = Pc / Pc.sum()
Fg = feats(Pc)
pair_txt = [[f"{G4[r, c]}{G4[r, c + 1]}" for c in range(3)] for r in range(4)]


def glcm_svg():
    W = 320
    cs = 30
    ox, oy = 12, 22
    b = [T(ox + 2 * cs, 14, '画像（4階調）', 10)]
    b.append(grid(G4, ox, oy, cs, 'gray', True, mx=3, size=12))
    for c in range(3):
        b.append(arrow(ox + c * cs + cs * 0.7, oy + cs * 0.5, ox + (c + 1) * cs + cs * 0.3, oy + cs * 0.5, None, RED, w=1.2))
    b.append(T(ox + 2 * cs, oy + 4 * cs + 14, '右隣との組 (i, j) を数える', 9, fill=RED))
    gx = 170
    b.append(T(gx + 2.5 * 28, 14, '同時生起行列（回数）', 10))
    for j in range(4):
        b.append(T(gx + 28 + j * 28 + 14, oy + 0 - 2 + 10, f'j={j}', 9, fill='#666'))
    for i in range(4):
        b.append(T(gx + 22, oy + 14 + i * 28 + 18, f'i={i}', 9, 'end', fill='#666'))
        for j in range(4):
            v = int(Pc[i, j])
            b.append(R(gx + 28 + j * 28, oy + 14 + i * 28, 28, 28, '#ffe0d6' if v else '#fff', '#999', 0.7))
            b.append(T(gx + 28 + j * 28 + 14, oy + 14 + i * 28 + 18, str(v), 12, weight='bold' if v else None))
    return svg(W, oy + 4 * 30 + 22, ''.join(b))


E.append(dict(id='region-glcm', steps=[
    "① 濃度を少数の階調に量子化（例：4階調 0〜3）し、変位 δ（例：右隣 = 距離1・0°）を決める",
    "② 画像中のすべての画素 p について、p の濃度 i と p+δ の濃度 j の組 (i, j) を数え、行列の (i, j) 要素に加える",
    f"③ 例：4×4 画像の右隣の組は 4行 × 3組 = 12 組。(0,0) が {int(Pc[0, 0])} 回、(0,1) が {int(Pc[0, 1])} 回、(2,2) が {int(Pc[2, 2])} 回 …",
    f"④ 総数 12 で割って確率 P(i, j) にする（例 P(2,2) = {int(Pc[2, 2])}/12 = {f(Pn[2, 2], 3)}）。方向を区別しないなら (i,j) と (j,i) を両方数えた対称行列にする",
    f"⑤ P からテクスチャ特徴を計算：エネルギー {f(Fg['asm'], 3)}、エントロピー {f(Fg['ent'], 3)}、コントラスト {f(Fg['con'], 3)}、相関 {f(Fg['cor'], 3)}、一様性 {f(Fg['idm'], 3)}",
], example="1行目 0,0,1,1 の右隣の組：(0,0), (0,1), (1,1)。全行分を足すと行列ができる。対称版（往復とも数える）では総数24：" + str(Ps.astype(int).tolist()),
    figures=[gfig(glcm_svg(), '各行の隣り合う2画素の組 (左の値 i, 右の値 j) を数える'), {"type": "table", "head": ["行", "右隣の組（i j）"], "rows": [[str(r)] + [' / '.join(pair_txt[r])] for r in range(4)]}],
    code=r'''import numpy as np

img = np.array([[0, 0, 1, 1],
                [0, 0, 1, 1],
                [0, 2, 2, 2],
                [2, 2, 3, 3]])
L = 4
P = np.zeros((L, L), int)
for y in range(img.shape[0]):
    for x in range(img.shape[1] - 1):           # δ = 右隣
        P[img[y, x], img[y, x + 1]] += 1
print(P)
Psym = P + P.T                                   # 方向を区別しない（対称）
print(Psym)
Pn = P / P.sum()                                 # 確率に正規化
print(Pn.round(3))
# scikit-image なら graycomatrix(img, [1], [0], levels=4)
'''))


def feat_table(key, label_):
    rows = []
    for name, im in [('例の4×4画像', G4), ('一様（全部2）', np.full((4, 4), 2)), ('市松（0と3）', np.indices((4, 4)).sum(0) % 2 * 3), ('ランダム', np.random.default_rng(3).integers(0, 4, (4, 4)))]:
        ft = feats(glcm(im, 4))
        rows.append([name, f(ft[key], 3)])
    return {"type": "table", "head": ["画像", label_], "rows": rows, "caption": '4階調・右隣の同時生起行列から計算'}


i_, j_ = np.indices((4, 4))
E.append(dict(id='region-glcm-asm', steps=[
    "① 同時生起行列を確率 P(i, j) に正規化する（総和 1）",
    "② エネルギー（角二次モーメント）ASM = Σ Σ P(i, j)²（各要素の2乗の和）",
    f"③ 例（前項の行列 /12）：回数 2,2,1,2,3,1,1 → (2²+2²+1²+2²+3²+1²+1²)/12² = 24/144 = {f(Fg['asm'], 4)}",
    "④ 少数の組に確率が集中（一様・規則的な模様）すると大きく、最大 1（全部同じ組）。いろいろな組に散らばる（ランダム）と小さい",
    "⑤ エントロピーとは逆の傾向。平方根をエネルギーと呼ぶ文献もある",
], example="一様な画像（全部 2）：P(2,2) = 1 だけ → ASM = 1。16要素に均等なら 16 × (1/16)² = 0.0625",
    figures=[mfig := {"type": "matrix", "data": [[f(v, 2) for v in r] for r in Pn], "label": 'P=', "caption": '例の画像の同時生起確率（右隣）'}, feat_table('asm', 'エネルギー ASM')],
    code=r'''import numpy as np

def glcm(img, L=4):
    P = np.zeros((L, L)); np.add.at(P, (img[:, :-1].ravel(), img[:, 1:].ravel()), 1)
    return P / P.sum()
imgs = {'例': np.array([[0,0,1,1],[0,0,1,1],[0,2,2,2],[2,2,3,3]]),
        '一様': np.full((4, 4), 2), '市松': np.indices((4, 4)).sum(0) % 2 * 3,
        'ランダム': np.random.default_rng(3).integers(0, 4, (4, 4))}
for name, im in imgs.items():
    P = glcm(im)
    print(name, 'ASM =', round((P ** 2).sum(), 4))      # ΣΣ P(i,j)^2
'''))

E.append(dict(id='region-glcm-entropy', steps=[
    "① 同時生起確率 P(i, j) を求める",
    "② エントロピー ENT = − Σ Σ P(i, j) log₂ P(i, j)（P = 0 の要素は 0 として飛ばす）",
    f"③ 例（前項の行列）：P = 3/12, 2/12, 1/12, … の各要素について −P log₂ P を足す → {f(Fg['ent'], 4)} ビット",
    "④ いろいろな組が均等に現れる（複雑・ランダム）ほど大きく、要素数 K なら最大 log₂ K。1つの組に集中すると 0",
    "⑤ エネルギーとは逆の傾向。ランダムな模様（砂・芝生）を一様な模様（空・壁）から区別する",
], example="一様な画像：P(2,2) = 1 → −1·log₂1 = 0。市松（0 と 3）：(0,3), (3,0) が半々 → −2·0.5·log₂0.5 = 1 ビット",
    figures=[{"type": "matrix", "data": [[f(-v * math.log2(v), 2) if v > 0 else '0' for v in r] for r in Pn], "label": '−PlogP=', "caption": f'各要素の寄与（合計 {f(Fg["ent"], 3)}）'}, feat_table('ent', 'エントロピー')],
    code=r'''import numpy as np

def glcm(img, L=4):
    P = np.zeros((L, L)); np.add.at(P, (img[:, :-1].ravel(), img[:, 1:].ravel()), 1)
    return P / P.sum()
imgs = {'例': np.array([[0,0,1,1],[0,0,1,1],[0,2,2,2],[2,2,3,3]]),
        '一様': np.full((4, 4), 2), '市松': np.indices((4, 4)).sum(0) % 2 * 3,
        'ランダム': np.random.default_rng(3).integers(0, 4, (4, 4))}
for name, im in imgs.items():
    P = glcm(im); nz = P[P > 0]
    print(name, 'ENT =', round(-(nz * np.log2(nz)).sum(), 4))   # -ΣΣ P log2 P
'''))

E.append(dict(id='region-glcm-contrast', steps=[
    "① 同時生起確率 P(i, j) と、重み (i − j)²（濃度差の2乗）を用意する",
    "② コントラスト CON = Σ Σ (i − j)² P(i, j)。対角（i = j、同じ濃度の組）は重み 0、対角から離れるほど重みが大きい",
    f"③ 例（前項の行列）：(0,1) が 2回 × 1、(0,2) が 1回 × 4、(2,3) が 1回 × 1 → (2 + 4 + 1)/12 = {f(Fg['con'], 4)}",
    "④ 隣り合う画素の濃度差の2乗の平均と同じ。細かく強い明暗の変化が多いほど大きい（慣性とも呼ぶ）",
    "⑤ 一様性（逆差分モーメント）とは逆の傾向。粗い／細かいテクスチャの区別に使う",
], example="市松（0 と 3）：全部の組の差が 3 → CON = 9（最大級）。一様な画像：0",
    figures=[{"type": "matrix", "data": [[str((i - j) ** 2) for j in range(4)] for i in range(4)], "label": '(i−j)² =', "caption": '重み：対角から離れるほど大きい'}, feat_table('con', 'コントラスト')],
    code=r'''import numpy as np

def glcm(img, L=4):
    P = np.zeros((L, L)); np.add.at(P, (img[:, :-1].ravel(), img[:, 1:].ravel()), 1)
    return P / P.sum()
img = np.array([[0,0,1,1],[0,0,1,1],[0,2,2,2],[2,2,3,3]])
P = glcm(img)
i, j = np.indices(P.shape)
con = ((i - j) ** 2 * P).sum()                       # ΣΣ (i-j)^2 P(i,j)
print(round(con, 4))
print(round(((img[:, 1:] - img[:, :-1]) ** 2).mean(), 4))   # 隣接画素の差の2乗平均と同じ
'''))

# 相関：縦縞 vs 横縞
vst = np.tile([0, 3, 0, 3], (4, 1))      # 横方向に交互（縦縞）
hst = vst.T.copy()                        # 縦方向に変化（横縞）
cor_rows = []
for name, im in [('縦縞（列ごとに一定）', vst), ('横縞（行ごとに一定）', hst)]:
    c_r = feats(glcm(im, 4, 1, 0))['cor']; c_d = feats(glcm(im, 4, 0, 1))['cor']
    cor_rows.append([name, f(c_r, 3), f(c_d, 3)])
E.append(dict(id='region-glcm-correlation', steps=[
    "① 同時生起確率 P(i, j) を i と j の同時分布とみなし、周辺分布の平均 μx, μy と標準偏差 σx, σy を求める",
    "② 相関 COR = Σ Σ (i − μx)(j − μy) P(i, j) / (σx σy)（−1〜1）",
    f"③ 例（前項の行列、右隣）：COR = {f(Fg['cor'], 4)}（隣の画素が似た濃度になりやすい → 正）",
    "④ 縦縞（列ごとに 0,3,0,3）を『下隣』で調べると組は (0,0),(3,3) の同じ値ばかり → COR = +1。『右隣』では (0,3),(3,0) と必ず逆の値 → COR = −1。横縞では逆になる",
    "⑤ 方向 δ ごとに相関を比べると、縞の方向（模様が伸びている向き）が分かる",
], example="縦縞：下隣 +1・右隣 −1、横縞：右隣 +1・下隣 −1。値がどの方向に『続く』かを相関で判定する",
    figures=[gfig(panels([dict(a=vst, title='縦縞', mode='gray', mx=3, values=True), dict(a=hst, title='横縞', mode='gray', mx=3, values=True)], W=240, gap=30, arrows=False), '4階調の縦縞と横縞'), {"type": "table", "head": ["画像", "δ=右隣", "δ=下隣"], "rows": cor_rows, "caption": '相関（右隣・下隣）'}],
    code=r'''import numpy as np

def glcm(img, dy, dx, L=4):
    H, W = img.shape
    a = img[:H - dy, :W - dx]; b = img[dy:, dx:]
    P = np.zeros((L, L)); np.add.at(P, (a.ravel(), b.ravel()), 1)
    return P / P.sum()
def correlation(P):
    i, j = np.indices(P.shape)
    mx, my = (i * P).sum(), (j * P).sum()
    sx, sy = np.sqrt(((i - mx) ** 2 * P).sum()), np.sqrt(((j - my) ** 2 * P).sum())
    return ((i - mx) * (j - my) * P).sum() / (sx * sy)
vert = np.tile([0, 3, 0, 3], (4, 1)); horiz = vert.T      # 縦縞と横縞
for name, im in [('縦縞', vert), ('横縞', horiz)]:
    print(name, '右隣', round(correlation(glcm(im, 0, 1)), 3), ' 下隣', round(correlation(glcm(im, 1, 0)), 3))
'''))

E.append(dict(id='region-glcm-homogeneity', steps=[
    "① 同時生起確率 P(i, j) と重み 1 / (1 + (i − j)²) を用意する",
    "② 一様性（逆差分モーメント）IDM = Σ Σ P(i, j) / (1 + (i − j)²)",
    f"③ 例（前項の行列）：対角の組 2+2+3+1 = 8 回は重み 1、差1の組 (0,1)×2・(2,3)×1 は重み 1/2、差2の組 (0,2)×1 は 1/5 → (8 + 1.5 + 0.2)/12 = {f(Fg['idm'], 4)}",
    "④ 隣り合う画素の濃度が似ている（対角付近に集中する）滑らかな模様ほど大きく、最大 1（全部対角上）",
    "⑤ コントラストとは逆の傾向。|i−j| を使う定義もある",
], example="一様な画像：IDM = 1。市松（差3の組だけ）：1/(1+9) = 0.1",
    figures=[{"type": "matrix", "data": [[f(1 / (1 + (i - j) ** 2), 2) for j in range(4)] for i in range(4)], "label": 'w=', "caption": '重み w = 1/(1+(i−j)²)：対角が1、離れるほど小さい'}, feat_table('idm', '一様性 IDM')],
    code=r'''import numpy as np

def glcm(img, L=4):
    P = np.zeros((L, L)); np.add.at(P, (img[:, :-1].ravel(), img[:, 1:].ravel()), 1)
    return P / P.sum()
imgs = {'例': np.array([[0,0,1,1],[0,0,1,1],[0,2,2,2],[2,2,3,3]]),
        '一様': np.full((4, 4), 2), '市松': np.indices((4, 4)).sum(0) % 2 * 3}
for name, im in imgs.items():
    P = glcm(im); i, j = np.indices(P.shape)
    print(name, 'IDM =', round((P / (1 + (i - j) ** 2)).sum(), 4))
'''))

# ランレングス
RL = np.array([[0, 0, 0, 1], [1, 1, 2, 2], [3, 3, 3, 3], [0, 1, 1, 1]])
rlm = np.zeros((4, 4), int)
runs_txt = []
for r in RL:
    k = 0; line = []
    while k < 4:
        v = r[k]; n = 1
        while k + n < 4 and r[k + n] == v:
            n += 1
        rlm[v, n - 1] += 1; line.append(f"{v}×{n}"); k += n
    runs_txt.append(', '.join(line))
jj = np.arange(1, 5)[None]
SRE = (rlm / jj ** 2).sum() / rlm.sum()
LRE = (rlm * jj ** 2).sum() / rlm.sum()
E.append(dict(id='region-run-length', steps=[
    "① 方向（例 0° = 横）を決め、同じ濃度が連続する部分（ラン）とその長さ（ラン長）を数える",
    "② ランレングス行列 p(i, j)：濃度 i でラン長 j のランの個数",
    f"③ 例：4×4・4階調の画像の各行のラン：{' / '.join(runs_txt)} → 全 {rlm.sum()} 個のラン",
    f"④ 短いランの強調 SRE = Σ p(i,j)/j² ÷ Σ p = {f(SRE, 3)}、長いランの強調 LRE = Σ j²·p(i,j) ÷ Σ p = {f(LRE, 3)}",
    "⑤ 粗いテクスチャ（大きな模様）は長いランが多く LRE が大きい、細かいテクスチャは短いランが多く SRE が大きい",
], example=f"行2 は 3 が4つ連続 → p(3, 4) = 1（長いラン）。全行が市松模様なら全部ラン長1 → SRE = 1, LRE = 1",
    figures=[gfig(panels([dict(a=RL, title='画像（4階調）', mode='gray', mx=3, values=True)], W=240, cs=30), '横方向のランを数える'), {"type": "table", "head": ["濃度＼ラン長", "1", "2", "3", "4"], "rows": [[str(i)] + [str(v) for v in rlm[i]] for i in range(4)], "caption": 'ランレングス行列 p(i, j)'}],
    code=r'''import numpy as np

img = np.array([[0, 0, 0, 1], [1, 1, 2, 2], [3, 3, 3, 3], [0, 1, 1, 1]])
L, maxlen = 4, img.shape[1]
R = np.zeros((L, maxlen), int)                     # R[濃度, ラン長-1]
for row in img:                                    # 0°方向（横）のラン
    k = 0
    while k < len(row):
        n = 1
        while k + n < len(row) and row[k + n] == row[k]: n += 1
        R[row[k], n - 1] += 1; k += n
print(R)
j = np.arange(1, maxlen + 1)
print('SRE', round((R / j ** 2).sum() / R.sum(), 3), ' LRE', round((R * j ** 2).sum() / R.sum(), 3))
'''))

# パワースペクトル
N_ = 32
yy_, xx_ = np.mgrid[0:N_, 0:N_]
tex_s = 128 + 100 * np.sin(2 * math.pi * xx_ * 4 / N_)          # 縦縞（横方向に4周期）
tex_f = 128 + 100 * np.sin(2 * math.pi * (xx_ * 8 + yy_ * 8) / N_)  # 斜めの細かい縞
def pspec(im):
    F = np.fft.fftshift(np.fft.fft2(im - im.mean()))
    return np.abs(F) ** 2
ps1, ps2 = pspec(tex_s), pspec(tex_f)
rr_ = np.hypot(xx_ - N_ / 2, yy_ - N_ / 2); th_ = np.degrees(np.arctan2(-(yy_ - N_ / 2), xx_ - N_ / 2)) % 180
def ring_wedge(ps):
    rings = [ps[(rr_ >= a) & (rr_ < a + 4)].sum() for a in (0, 4, 8, 12)]
    wedges = [ps[(th_ >= a - 22.5) & (th_ < a + 22.5) | ((a == 0) & (th_ >= 157.5))].sum() for a in (0, 45, 90, 135)]
    tot = ps.sum()
    return [r / tot for r in rings], [w / tot for w in wedges]
rw1, rw2 = ring_wedge(ps1), ring_wedge(ps2)


def psp_svg():
    W = 320
    b = []
    cs = 2.2
    for k_, (im, ps, t) in enumerate([(tex_s, ps1, '縦縞（粗い）'), (tex_f, ps2, '斜め縞（細かい）')]):
        ox = 6 + k_ * 160
        for y in range(0, N_):
            for x in range(0, N_):
                g = int(np.clip(im[y, x], 0, 255))
                b.append(f"<rect x='{f(ox + x * cs)}' y='{f(18 + y * cs)}' width='{f(cs + .1)}' height='{f(cs + .1)}' fill='rgb({g},{g},{g})'/>")
        sx = ox + 78
        b.append(R(sx, 18, N_ * cs, N_ * cs, '#000', 'none'))
        for y, x in np.argwhere(ps > ps.max() * 0.1):
            b.append(R(sx + x * cs - 0.5, 18 + y * cs - 0.5, cs + 1, cs + 1, '#fff', 'none'))
        for rad in (4, 8, 12):
            b.append(C(sx + N_ / 2 * cs, 18 + N_ / 2 * cs, rad * cs, 'none', '#ffcc00', 0.6))
        b.append(T(ox + 35, 12, t, 9))
        b.append(T(sx + 35, 12, 'パワースペクトル', 9))
    return svg(W, 18 + N_ * cs + 6, ''.join(b))


E.append(dict(id='region-power-spectrum-texture', steps=[
    "① テクスチャ画像を2次元フーリエ変換し、パワースペクトル |F(u,v)|² を求める（原点＝直流を中央に移す）",
    "② リング特徴：原点を中心とする同心円の輪ごとにパワーを合計 → どの周波数（模様の細かさ）が多いか",
    "③ くさび特徴：原点から放射状の扇形ごとに合計 → どの方向に変化しているか（縞の向き）",
    f"④ 例：縦縞（横に4周期）はパワーが内側のリング（半径4付近）・横方向のくさびに集中（{f(rw1[1][0] * 100, 0)}%）。細かい斜め縞は外側のリング（半径 √(8²+8²) ≈ 11）・45°のくさびに集中",
    "⑤ 粗い模様は低周波（内側）、細かい模様は高周波（外側）にパワーが出る。縞と直交する方向のくさびにピークが出る",
], example="リング（半径 0-4, 4-8, 8-12, 12-16）の割合：縦縞 " + ', '.join(f(v, 2) for v in rw1[0]) + "、斜め縞 " + ', '.join(f(v, 2) for v in rw2[0]),
    figures=[gfig(psp_svg(), '白点＝パワーの大きい周波数、黄円＝リングの境界（半径 4, 8, 12）')],
    code=r'''import numpy as np

N = 32
yy, xx = np.mgrid[0:N, 0:N]
textures = {'縦縞(粗)': 128 + 100 * np.sin(2 * np.pi * xx * 4 / N),
            '斜め縞(細)': 128 + 100 * np.sin(2 * np.pi * (xx * 8 + yy * 8) / N)}
r = np.hypot(xx - N / 2, yy - N / 2)
th = np.degrees(np.arctan2(-(yy - N / 2), xx - N / 2)) % 180
for name, im in textures.items():
    P = np.abs(np.fft.fftshift(np.fft.fft2(im - im.mean()))) ** 2    # パワースペクトル
    P /= P.sum()
    rings = [P[(r >= a) & (r < a + 4)].sum() for a in (0, 4, 8, 12)]  # リング特徴
    wedges = [P[np.abs(((th - a) + 90) % 180 - 90) < 22.5].sum() for a in (0, 45, 90, 135)]  # くさび
    print(name, 'リング', np.round(rings, 2), ' くさび', np.round(wedges, 2))
'''))

# フラクタル次元（シェルピンスキー）
Ns = 64
sier = np.array([[1 if (x & y) == 0 else 0 for x in range(Ns)] for y in range(Ns)])
box_rows = []
for e in (1, 2, 4, 8, 16, 32):
    cnt = int(sier.reshape(Ns // e, e, Ns // e, e).max(axis=(1, 3)).sum())
    box_rows.append((e, cnt))
lx = [math.log2(Ns / e) for e, c in box_rows]; ly = [math.log2(c) for e, c in box_rows]
slope = np.polyfit(lx, ly, 1)[0]


def sier_svg():
    W = 150
    cs = 2
    b = [R(5, 5, Ns * cs, Ns * cs, '#fff', '#ccc', 0.5)]
    for y, x in np.argwhere(sier):
        b.append(f"<rect x='{5 + x * cs}' y='{5 + y * cs}' width='{cs}' height='{cs}' fill='#222'/>")
    return ''.join(b)


E.append(dict(id='region-fractal', steps=[
    "① 図形を一辺 ε の箱（格子）で覆い、図形を含む箱の数 N(ε) を数える（ボックスカウント法）",
    "② ε を変えて繰り返す。例：64×64 のシェルピンスキーの三角形で ε = 1, 2, 4, 8, 16, 32 → N = " + ', '.join(str(c) for e, c in box_rows),
    "③ log N(ε) を log(1/ε) に対してプロットし、直線の傾きを次元 D とする",
    f"④ 例：傾き D = {f(slope, 3)}（理論値 log3/log2 = 1.585）。ε を半分にすると箱の数が3倍になる → 2^D = 3",
    "⑤ 滑らかな曲線は D = 1、平面を埋める図形は D = 2。海岸線・雲・亀裂・テクスチャの粗さ（複雑さ）の指標に使う",
], example=f"ε=4 → N={box_rows[2][1]}、ε=2 → N={box_rows[1][1]}（{f(box_rows[1][1] / box_rows[2][1], 2)} 倍）。直線の塗りつぶし正方形なら4倍（D=2）、直線なら2倍（D=1）",
    figures=[gfig(svg(320, 140, sier_svg() + chart([(lx, ly, RED)], W=170, H=130, xr=(0, 6.5), yr=(0, 12.5), xticks=[0, 2, 4, 6], yticks=[0, 4, 8, 12], xlabel='log₂(64/ε)', ylabel='log₂N').replace("<svg viewBox='0 0 170 130' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif'>", "<g transform='translate(148,4)'>").replace('</svg>', '') + T(80, 26, f'傾き D={f(slope, 3)}', 10, fill=RED) + '</g>'), '左：シェルピンスキーの三角形、右：ボックスカウントの両対数プロット')],
    code=r'''import numpy as np

N = 64
img = np.array([[1 if (x & y) == 0 else 0 for x in range(N)] for y in range(N)])   # シェルピンスキー
eps, cnt = [], []
for e in (1, 2, 4, 8, 16, 32):
    boxes = img.reshape(N // e, e, N // e, e).max(axis=(1, 3))    # e×e の箱に図形があるか
    eps.append(e); cnt.append(int(boxes.sum()))
print(list(zip(eps, cnt)))
D = np.polyfit(np.log(1 / np.array(eps)), np.log(cnt), 1)[0]      # log N vs log(1/ε) の傾き
print('フラクタル次元 D =', round(D, 3), ' 理論値', round(np.log(3) / np.log(2), 3))
'''))

if __name__ == '__main__':
    finalize('region', E, run='--norun' not in sys.argv)
