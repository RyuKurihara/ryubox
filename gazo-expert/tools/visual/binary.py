import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
import cv2
from vh import *
from binlib import *

E = []
ADD, DEL = '#3a86ff', '#ffc2c2'


def dcol(before, after):
    """変化の色分け：残った1=黒、増えた=青、消えた=ピンク"""
    b, a = np.asarray(before), np.asarray(after)
    return [[('#222' if a[r, c] and b[r, c] else ADD if a[r, c] else DEL if b[r, c] else '#fff') for c in range(a.shape[1])] for r in range(a.shape[0])]


def lcol(L):
    return [[(PAL[int(v) % len(PAL)] if v else '#fff') for v in r] for r in L]


def gfig(svgs, cap):
    return {"type": "svg", "svg": svgs, "caption": cap}


BASE = A('''
00000000000
01111100000
01111100010
01101100000
01111111110
01111100000
01111100000
00000000000''')

# ---------------- 2値化 ----------------
G = np.array([[30, 40, 200, 210, 60, 50], [35, 180, 220, 190, 170, 45], [40, 190, 90, 100, 200, 55], [50, 185, 95, 110, 210, 40], [45, 60, 195, 205, 70, 50], [40, 50, 55, 60, 45, 35]])
E.append(dict(id='binary-binarization', steps=[
    "① 入力：濃淡画像（0〜255）。例：6×6 の画素値（明るいリング状の物体と暗い背景）",
    "② しきい値 t を決める（固定値、p-タイル法、モード法、大津の方法、適応的2値化など）",
    "③ 各画素で f(x,y) ≥ t なら 1（対象）、それ以外は 0（背景）。例 t = 128：200 → 1、90 → 0",
    "④ 出力：0/1 だけの2値画像。リングの形が白黒ではっきり分かれる（ここでは 1 を黒で表示）",
    "⑤ 2値化後はラベリング・モルフォロジー・面積や形状の計測など『形』の処理に進む",
], example="t=128 のとき 1 行目 30,40,200,210,60,50 → 0,0,1,1,0,0。中央の 90,100,95,110 は 0（リングの穴）",
    figures=[gfig(panels([dict(a=G, title='入力（濃淡）', mode='gray', values=True, size=8), dict(a=(G >= 128).astype(int), title='2値画像（t=128）', mode='bin', values=True, size=9)], W=300, arrows=['≥128']), '各画素をしきい値 128 と比較して 0/1 に')],
    code=r'''import numpy as np
import cv2

g = np.array([[30, 40, 200, 210, 60, 50], [35, 180, 220, 190, 170, 45],
              [40, 190, 90, 100, 200, 55], [50, 185, 95, 110, 210, 40],
              [45, 60, 195, 205, 70, 50], [40, 50, 55, 60, 45, 35]], np.uint8)
t = 128
b = (g >= t).astype(np.uint8)          # NumPy：比較するだけ
print(b)
# OpenCV：THRESH_BINARY は f > thresh なら maxval（境界の扱いが > である点に注意）
_, b2 = cv2.threshold(g, t - 1, 1, cv2.THRESH_BINARY)
print(np.array_equal(b, b2))
'''))

E.append(dict(id='binary-fixed-threshold', steps=[
    "① あらかじめ決めた一定のしきい値 t（例 100 や 160）を画像全体に使う",
    "② f ≥ t → 1、f < t → 0。処理は1回の比較だけで最も高速",
    "③ 例：同じ画像でも t = 100 ではリング＋穴の周辺まで 1 になり、t = 160 ではリングだけが 1 になる",
    "④ 照明が一定の工場ライン（背景と対象の明るさが既知）ではこれで十分",
    "⑤ 照明の変化や影があると、同じ t でも結果が大きく変わる → 自動しきい値決定法や適応的2値化を使う",
], example="画素 110：t=100 なら 1、t=160 なら 0。画素 170：どちらでも 1。t の選び方で結果が変わる",
    figures=[gfig(panels([dict(a=G, title='入力', mode='gray', values=True, size=8), dict(a=(G >= 100).astype(int), title='t = 100', mode='bin'), dict(a=(G >= 160).astype(int), title='t = 160', mode='bin')], W=320, arrows=['', '']), 'しきい値によって 1 になる範囲が変わる（t=100 では穴が埋まる）')],
    code=r'''import numpy as np
import cv2

g = np.array([[30, 40, 200, 210, 60, 50], [35, 180, 220, 190, 170, 45],
              [40, 190, 90, 100, 200, 55], [50, 185, 95, 110, 210, 40],
              [45, 60, 195, 205, 70, 50], [40, 50, 55, 60, 45, 35]], np.uint8)
for t in (100, 160):
    b = (g >= t).astype(np.uint8)
    print('t =', t, ' 1の画素数 =', b.sum())
    print(b)
# 反転2値化（暗い対象を1にする）: THRESH_BINARY_INV
_, inv = cv2.threshold(g, 99, 1, cv2.THRESH_BINARY_INV)
print(inv.sum())
'''))

# p-タイル
rng = np.random.default_rng(3)
pt_img = np.clip(np.r_[rng.normal(60, 15, 200), rng.normal(180, 20, 800)], 0, 255).astype(int)  # 20% が暗い文字
hist = np.bincount(pt_img // 10, minlength=26)[:26]
cum = np.cumsum(hist) / hist.sum()
tp = int(np.argmax(np.cumsum(np.bincount(pt_img, minlength=256)) >= 0.2 * len(pt_img)))
E.append(dict(id='binary-ptile', steps=[
    "① 前提：対象が画像の何 % を占めるか（p）が分かっている。例：文書画像で文字（暗い）が 20 %",
    "② 濃度ヒストグラムを作り、暗い側（0 から）画素数を累積していく",
    f"③ 累積が全画素の 20 % に達した濃度をしきい値にする。例：1000 画素中 200 画素目に達するのは濃度 {tp}",
    f"④ f ≤ {tp} → 1（文字）として2値化。文字の割合がちょうど 20 % になる",
    "⑤ 計算は簡単だが、p が違う画像（文字の量が違うページ）では失敗する",
], example=f"ヒストグラムを 0 から足し上げ：累積 10 % … 20 % 到達が濃度 {tp}。対象が明るい場合は 255 側から累積する",
    figures=[gfig(chart([(np.arange(26) * 10 + 5, cum * hist.max(), RED)], bars=(np.arange(26) * 10 + 5, hist, '#8aa4ef'), W=310, H=165, xr=(0, 260), yr=(0, hist.max() * 1.1), xticks=[0, 50, 100, 150, 200, 250], xlabel='濃度', vlines=[(tp, RED, f't={tp}（累積20%）')], legend=[('累積割合', RED)]), '棒：ヒストグラム、赤線：暗い側からの累積（右端=100%）')],
    code=r'''import numpy as np
import cv2

rng = np.random.default_rng(3)
img = np.clip(np.r_[rng.normal(60, 15, 200), rng.normal(180, 20, 800)], 0, 255).astype(np.uint8)
img = img.reshape(25, 40)                       # 文字(暗)が 20% の画像
p = 0.20
hist = np.bincount(img.ravel(), minlength=256)  # 濃度ヒストグラム
cum = np.cumsum(hist)                           # 暗い側から累積
t = int(np.argmax(cum >= p * img.size))         # 累積が p に達した濃度
b = (img <= t).astype(np.uint8)
print('t =', t, ' 文字の割合 =', b.mean())
# OpenCV には p-タイル専用関数はないので、求めた t で threshold を使う
_, b2 = cv2.threshold(img, t, 1, cv2.THRESH_BINARY_INV)
print(np.array_equal(b, b2))
'''))

# モード法
x = np.arange(256)
h_raw = 900 * np.exp(-(x - 70) ** 2 / (2 * 18 ** 2)) + 600 * np.exp(-(x - 175) ** 2 / (2 * 22 ** 2))
h_noisy = h_raw + np.random.default_rng(0).normal(0, 60, 256)
h_noisy = np.clip(h_noisy, 0, None)
k = np.ones(15) / 15
h_sm = np.convolve(h_noisy, k, 'same')
p1 = int(np.argmax(h_sm[:120])); p2 = 120 + int(np.argmax(h_sm[120:]))
tm = p1 + int(np.argmin(h_sm[p1:p2]))
E.append(dict(id='binary-mode', steps=[
    "① 濃度ヒストグラムを作る。対象と背景がそれぞれ山（モード）を作る双峰性を仮定",
    "② 雑音で細かくギザギザしていると偽の谷が多数できるので、移動平均などでヒストグラムを平滑化",
    f"③ 2つの山の位置を求める（例：濃度 {p1} と {p2}）",
    f"④ 2つの山の間で最も低い谷の濃度をしきい値にする（例：t = {tm}）",
    "⑤ 山がはっきりしない（対象が小さい、コントラストが低い）と谷が見つからず使えない",
], example=f"平滑化前は谷が何か所もあるが、15 階調の移動平均後は谷が1つ（濃度 {tm}）になる",
    figures=[gfig(chart([(x, h_noisy, '#bbb'), (x, h_sm, BLUE)], W=310, H=165, xr=(0, 255), yr=(0, max(h_noisy) * 1.1), xticks=[0, 50, 100, 150, 200, 250], xlabel='濃度', vlines=[(p1, GREEN, '山'), (p2, GREEN, '山'), (tm, RED, f'谷 t={tm}')], legend=[('ヒストグラム', '#bbb'), ('平滑化', BLUE)]), '双峰性ヒストグラムの谷をしきい値に')],
    code=r'''import numpy as np

x = np.arange(256)
rng = np.random.default_rng(0)
hist = 900 * np.exp(-(x - 70)**2 / 648) + 600 * np.exp(-(x - 175)**2 / 968)
hist = np.clip(hist + rng.normal(0, 60, 256), 0, None)   # 雑音でギザギザ
sm = np.convolve(hist, np.ones(15) / 15, 'same')         # 平滑化
# 平滑化前後で極小（谷）の数を比べる
def n_valleys(h): return int(((h[1:-1] < h[:-2]) & (h[1:-1] < h[2:])).sum())
print(n_valleys(hist), n_valleys(sm))
p1 = int(np.argmax(sm[:120])); p2 = 120 + int(np.argmax(sm[120:]))  # 2つの山
t = p1 + int(np.argmin(sm[p1:p2]))                        # 山の間の谷
print('peaks', p1, p2, ' threshold', t)
'''))

# 大津
otsu_img = np.clip(np.r_[rng.normal(70, 18, 600), rng.normal(170, 25, 400)], 0, 255).astype(int)
hh = np.bincount(otsu_img, minlength=256).astype(float)
pp = hh / hh.sum()
om = np.cumsum(pp); mu = np.cumsum(pp * np.arange(256)); mt = mu[-1]
sb = np.where((om > 0) & (om < 1), (mt * om - mu) ** 2 / np.maximum(om * (1 - om), 1e-12), 0)
to = int(np.argmax(sb))
_, tcv = 0, cv2.threshold(otsu_img.astype(np.uint8).reshape(25, 40), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[0]
w1 = om[to]; m1 = mu[to] / w1; m2 = (mt - mu[to]) / (1 - w1)
hb = np.bincount(otsu_img // 8, minlength=32)[:32]
E.append(dict(id='binary-otsu', steps=[
    "① 濃度ヒストグラムを作り、しきい値 t の候補を 0〜255 まで1つずつ試す",
    "② t で2クラス（暗い C1：f ≤ t、明るい C2：f > t）に分け、画素数の割合 ω1, ω2 と平均 m1, m2 を求める",
    "③ クラス間分散 σB² = ω1·ω2·(m1 − m2)² を計算（全体の分散は一定なので、クラス内分散最小と同じ）",
    f"④ σB² が最大になる t を採用。例：t = {to}（ω1 = {f(w1)}, m1 = {f(m1, 1)}, m2 = {f(m2, 1)}）",
    "⑤ 出力：自動で決まったしきい値で2値化した画像。双峰性がはっきりしていれば安定（cv2.THRESH_OTSU）",
], example=f"t={to} のとき σB² = {f(w1, 3)}·{f(1 - w1, 3)}·({f(m1, 1)}−{f(m2, 1)})² = {f(sb[to], 1)}（最大）。OpenCV の結果も t = {int(tcv)}",
    figures=[gfig(chart([], bars=(np.arange(32) * 8 + 4, hb, '#8aa4ef'), W=310, H=130, xr=(0, 256), yr=(0, hb.max() * 1.1), xticks=[0, 64, 128, 192, 255], xlabel='濃度', vlines=[(to, RED, f't={to}')], title='濃度ヒストグラム'), 'ヒストグラム（8階調ごと）'),
             gfig(chart([(np.arange(256), sb, BLUE)], W=310, H=140, xr=(0, 255), yr=(0, sb.max() * 1.15), xticks=[0, 64, 128, 192, 255], xlabel='しきい値 t', vlines=[(to, RED, f'最大 t={to}')], title='クラス間分散 σB²(t)'), 't を動かしたときのクラス間分散。山の頂点がしきい値')],
    code=r'''import numpy as np
import cv2

rng = np.random.default_rng(0)
img = np.clip(np.r_[rng.normal(70, 18, 600), rng.normal(170, 25, 400)], 0, 255)
img = img.astype(np.uint8).reshape(25, 40)
p = np.bincount(img.ravel(), minlength=256) / img.size   # 正規化ヒストグラム
best_t, best = 0, -1
for t in range(256):
    w1, w2 = p[:t + 1].sum(), p[t + 1:].sum()             # クラスの割合
    if w1 == 0 or w2 == 0: continue
    m1 = (np.arange(t + 1) * p[:t + 1]).sum() / w1        # クラス平均
    m2 = (np.arange(t + 1, 256) * p[t + 1:]).sum() / w2
    sb = w1 * w2 * (m1 - m2) ** 2                         # クラス間分散
    if sb > best: best_t, best = t, sb
print('NumPy:', best_t, round(best, 1))
t_cv, b = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
print('OpenCV:', t_cv)
'''))

# 適応的
yy, xx = np.mgrid[0:8, 0:12]
illum = 60 + xx * 15
text = A('''
000000000000
011000110110
010100100100
010100110100
010100100100
011000110110
000000000000
000000000000''')
ad_img = np.clip(illum + 60 - text * 70, 0, 255)
glob = (ad_img < 128).astype(int)
pad = np.pad(ad_img, 2, mode='edge').astype(float)
loc = np.zeros_like(ad_img, float)
for y in range(8):
    for x in range(12):
        loc[y, x] = pad[y:y + 5, x:x + 5].mean()
adp = (ad_img < loc - 10).astype(int)
E.append(dict(id='binary-adaptive', steps=[
    "① 入力：左が暗く右が明るい照明むらのある文書画像（暗い文字）",
    "② 画像全体で1つのしきい値（例 128）を使うと、暗い左側は背景まで 1、明るい右側は文字まで 0 になる",
    "③ 各画素ごとに周囲 5×5 の平均 m(x,y) を求め、しきい値を T(x,y) = m(x,y) − C（例 C = 10）とする",
    "④ f(x,y) < T(x,y) なら 1（文字）。周囲より十分暗い画素だけが選ばれるので、照明むらの影響が消える",
    "⑤ 出力：画像全体で文字だけが抽出された2値画像。窓は文字の太さより十分大きく取る（Niblack・Sauvola 法は標準偏差も使う）",
], example=f"左端の背景画素 {ad_img[0, 0]}：大域 t=128 では 1（誤り）。局所平均 {f(loc[0, 0], 1)} − 10 = {f(loc[0, 0] - 10, 1)} より大きい → 0（正しい）",
    figures=[gfig(panels([dict(a=ad_img, title='入力（照明むら）', mode='gray'), dict(a=glob, title='大域しきい値128', mode='bin'), dict(a=adp, title='局所平均−10', mode='bin')], W=320, arrows=['', '']), '大域しきい値では左が真っ黒・右の文字が消える。適応的2値化では文字だけが残る')],
    code=r'''import numpy as np
import cv2

xx = np.tile(np.arange(12), (8, 1))
text = np.zeros((8, 12), int); text[1:6, 1] = 1; text[1:6, 6] = 1; text[[1, 3, 5], 6:8] = 1  # 文字
img = np.clip(60 + xx * 15 + 60 - text * 70, 0, 255).astype(np.uint8)   # 照明むら
print((img < 128).astype(int))                      # 大域しきい値は失敗
# NumPy：5x5 の局所平均 - C をしきい値に
p = np.pad(img.astype(float), 2, mode='edge')
m = np.array([[p[y:y + 5, x:x + 5].mean() for x in range(12)] for y in range(8)])
print((img < m - 10).astype(int))
# OpenCV：adaptiveThreshold（MEAN_C: 局所平均 - C）
b = cv2.adaptiveThreshold(img, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 5, 10)
print(b)
'''))


# ---------------- 近傍・連結 ----------------
def nb_fig(kind):
    W = 300
    b = []
    cs = 34
    ox, oy = 20, 22
    n4 = {(0, 1), (1, 0), (1, 2), (2, 1)}
    for r in range(3):
        for c in range(3):
            if (r, c) == (1, 1):
                fill = '#222'
            elif (r, c) in n4:
                fill = BLUE
            else:
                fill = BLUE if kind == 8 else '#fff'
            b.append(R(ox + c * cs, oy + r * cs, cs, cs, fill, '#999'))
    labels8 = {(1, 2): 'x1', (0, 2): 'x2', (0, 1): 'x3', (0, 0): 'x4', (1, 0): 'x5', (2, 0): 'x6', (2, 1): 'x7', (2, 2): 'x8'}
    for (r, c), s in labels8.items():
        on = (r, c) in n4 or kind == 8
        b.append(T(ox + c * cs + cs / 2, oy + r * cs + cs / 2 + 4, s, 11, fill='#fff' if on else '#999'))
    b.append(T(ox + 1.5 * cs, oy + 1.5 * cs + 4, '注目', 10, fill='#fff'))
    b.append(T(ox + 1.5 * cs, oy - 6, f"{kind}近傍（青）", 11, weight='bold'))
    # 距離の等しい範囲
    b.append(T(150, 40, '注目画素 (x, y) に対し', 10, 'start'))
    if kind == 4:
        for i, s in enumerate(['(x+1,y) (x−1,y)', '(x,y+1) (x,y−1)', '辺を共有する4画素', '市街地距離 d4 = 1', '斜めは d4 = 2']):
            b.append(T(150, 58 + i * 16, s, 10, 'start', fill='#333'))
    else:
        for i, s in enumerate(['4近傍 ＋ 斜めの4画素', '(x±1, y±1)', '辺か頂点を共有', 'チェス盤距離 d8 = 1', '（斜めも1歩）']):
            b.append(T(150, 58 + i * 16, s, 10, 'start', fill='#333'))
    return svg(W, 140, ''.join(b))


E.append(dict(id='binary-4neighbor', steps=[
    "① 注目画素 (x, y) の上下左右の4画素：(x+1, y), (x−1, y), (x, y+1), (x, y−1)",
    "② 注目画素と辺を共有する画素だけで、斜めの画素は含まない",
    "③ 4近傍でつながる＝4連結。4近傍の画素までの距離は市街地距離で 1、斜めの画素は 2",
    "④ 例：3×3 の窓のうち中央以外の 8 画素中、x1（右）, x3（上）, x5（左）, x7（下）の4つが4近傍",
    "⑤ 使い道：ラベリングの連結性、十字形構造要素の膨張・収縮（4近傍に1があれば1）、境界画素の判定",
], example="(5,5) の4近傍は (6,5), (4,5), (5,6), (5,4)。(6,6) は4近傍ではない（d4 = 2）",
    figures=[gfig(nb_fig(4), '4近傍：上下左右の4画素')],
    code=r'''import numpy as np

N4 = [(0, 1), (-1, 0), (0, -1), (1, 0)]          # (dy,dx)：右・上・左・下
img = np.array([[0, 1, 0],
                [1, 1, 0],
                [0, 0, 1]])
y, x = 1, 1
vals = [int(img[y + dy, x + dx]) for dy, dx in N4]
print('4近傍の値', vals, ' 1の数', sum(vals))    # 右0 上1 左1 下0 → 2
# 十字形カーネルとの畳み込みで、全画素の「4近傍の1の数」を一度に計算
k = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]])
p = np.pad(img, 1)
cnt = sum(k[dy + 1, dx + 1] * p[1 + dy:4 + dy, 1 + dx:4 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
print(cnt)
'''))

E.append(dict(id='binary-8neighbor', steps=[
    "① 4近傍（上下左右）に斜めの4画素 (x±1, y±1) を加えた8画素",
    "② 注目画素と辺または頂点を共有する画素すべて＝ 3×3 窓の中央以外",
    "③ 8近傍でつながる＝8連結。8近傍の画素はどれもチェス盤距離 1",
    "④ 番号の付け方の例：右を x1 とし反時計回りに x1〜x8（連結数の計算で使う）",
    "⑤ 使い道：8連結ラベリング、3×3 正方形構造要素の膨張・収縮、境界追跡（Moore 近傍）、細線化の判定",
], example="(5,5) の8近傍は (4..6, 4..6) から (5,5) を除いた8画素。斜めの (6,6) も含まれる（d8 = 1）",
    figures=[gfig(nb_fig(8), '8近傍：3×3 の窓の中央以外の8画素（x1=右から反時計回り）')],
    code=r'''import numpy as np

# x1=右から反時計回りに x1..x8（画像座標は y 下向きなので「上」は dy=-1）
N8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
img = np.array([[0, 1, 0],
                [1, 1, 0],
                [0, 0, 1]])
y, x = 1, 1
vals = [int(img[y + dy, x + dx]) for dy, dx in N8]
print('x1..x8 =', vals, ' 1の数', sum(vals))   # 斜め右下の1も数える → 3
# 3x3 の和 - 中央 で全画素の「8近傍の1の数」
p = np.pad(img, 1)
cnt = sum(p[1 + dy:4 + dy, 1 + dx:4 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) - img
print(cnt)
'''))

DIAG = A('''
0000000
0110000
0110000
0001100
0001100
0000010
0000000''')
L4 = label(DIAG, 4); L8 = label(DIAG, 8)
E.append(dict(id='binary-4connect', steps=[
    "① 2つの1画素の間を、4近傍（上下左右）への移動だけでたどれるとき『4連結』という",
    "② 例：左上の 2×2 の塊、中央の 2×2 の塊、右下の1画素が、角（斜め）だけで接している図形",
    f"③ 4連結では斜めに移れないので、角でしか接しない塊は別物 → 連結成分は {L4.max()} 個（ラベル 1, 2, 3）",
    "④ 同じ図形を8連結で数えると1個になる。どちらの連結性で数えるかで個数が変わる",
    "⑤ 図形を4連結で扱うなら背景は8連結で扱う（連結性のパラドックスを避ける）",
], example=f"4連結ラベリングの結果：成分数 {L4.max()}、各面積 " + ', '.join(str(int((L4 == k).sum())) for k in range(1, L4.max() + 1)),
    figures=[gfig(panels([dict(a=DIAG, title='入力', mode='bin'), dict(a=L4, title=f'4連結：{L4.max()}個', mode='label', values=[[str(v) if v else '' for v in r] for r in L4])], W=280, arrows=['']), '斜めに接するだけの塊は4連結では別の成分（色・番号が別）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0],[0,1,1,0,0,0,0],[0,1,1,0,0,0,0],[0,0,0,1,1,0,0],
                [0,0,0,1,1,0,0],[0,0,0,0,0,1,0],[0,0,0,0,0,0,0]], np.uint8)
def count(img, nbrs):                       # 幅優先探索で連結成分を数える
    seen = np.zeros_like(img, bool); n = 0
    for y, x in zip(*np.nonzero(img)):
        if seen[y, x]: continue
        n += 1; q = [(y, x)]; seen[y, x] = True
        while q:
            cy, cx = q.pop()
            for dy, dx in nbrs:
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < img.shape[0] and 0 <= nx < img.shape[1] and img[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
    return n
print('4連結:', count(img, [(0, 1), (1, 0), (0, -1), (-1, 0)]))
n, lab = cv2.connectedComponents(img, connectivity=4)
print('OpenCV 4連結:', n - 1)               # 背景(0)を含むので -1
'''))

E.append(dict(id='binary-8connect', steps=[
    "① 2つの1画素の間を、8近傍（上下左右＋斜め）への移動でたどれるとき『8連結』という",
    "② 例：4連結では3個に分かれた『斜めに接する3つの塊』",
    f"③ 8連結では角どうしでも移れるので、全体が1つの連結成分 → {L8.max()} 個",
    "④ 斜めの細い線（1画素幅の斜線）は8連結なら1本の線、4連結だと点の集まりになる",
    "⑤ 図形を8連結で扱うなら背景は4連結で扱う。OpenCV のラベリングの既定は8連結",
], example="(2,2)→(3,3) は斜め移動なので8連結ではつながる。対角線上に並んだ5画素の斜線：8連結で1成分、4連結で5成分",
    figures=[gfig(panels([dict(a=DIAG, title='入力', mode='bin'), dict(a=L8, title=f'8連結：{L8.max()}個', mode='label', values=[[str(v) if v else '' for v in r] for r in L8])], W=280, arrows=['']), '同じ図形も8連結では1つの成分')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0],[0,1,1,0,0,0,0],[0,1,1,0,0,0,0],[0,0,0,1,1,0,0],
                [0,0,0,1,1,0,0],[0,0,0,0,0,1,0],[0,0,0,0,0,0,0]], np.uint8)
for conn in (4, 8):
    n, lab = cv2.connectedComponents(img, connectivity=conn)
    print(conn, '連結: 成分数', n - 1)
    print(lab)
# 斜線は8連結なら1本
diag = np.eye(5, dtype=np.uint8)
print(cv2.connectedComponents(diag, connectivity=8)[0] - 1,
      cv2.connectedComponents(diag, connectivity=4)[0] - 1)
'''))

DIA = A('''
0000000
0001000
0010100
0100010
0010100
0001000
0000000''')
bg = 1 - DIA
Lbg4 = label(bg, 4); Lbg8 = label(bg, 8)
E.append(dict(id='binary-connectivity-paradox', steps=[
    "① 入力：斜めに1画素ずつ並べた菱形の閉曲線（8画素）",
    "② 図形も背景も8連結で数えると：図形は1つの閉曲線（成分1）なのに、内側の背景は斜めの隙間から外側の背景とつながり、背景は1成分 → 『閉曲線なのに内と外が分かれない』矛盾",
    "③ 図形も背景も4連結で数えると：図形は8個のばらばらの点なのに、背景は内側と外側の2成分に分かれる → 『閉じていないのに内外がある』矛盾",
    "④ 解決：図形を8連結で扱うときは背景を4連結（図形は1本の閉曲線、背景は内外の2成分＝穴1個）、図形を4連結なら背景を8連結にする",
    "⑤ 穴の数・オイラー数・境界追跡はこの組合せを前提に計算する",
], example=f"背景の連結成分数：8連結で数えると {Lbg8.max()}、4連結で数えると {Lbg4.max()}（内側の1画素が独立）。図形は8連結で {n_comp(DIA, 8)}、4連結で {n_comp(DIA, 4)}",
    figures=[gfig(panels([dict(a=DIA, title='菱形の閉曲線', mode='bin'), dict(a=Lbg8, title=f'背景を8連結: {Lbg8.max()}個', mode='label', colors=[[('#222' if DIA[r, c] else PAL[1 + Lbg8[r, c]]) for c in range(7)] for r in range(7)]), dict(a=Lbg4, title=f'背景を4連結: {Lbg4.max()}個', mode='label', colors=[[('#222' if DIA[r, c] else PAL[1 + Lbg4[r, c]]) for c in range(7)] for r in range(7)])], W=320, arrows=['', '']), '背景の色＝背景の連結成分。8連結だと内側と外側が同じ色（つながってしまう）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0],[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],
                [0,0,1,0,1,0,0],[0,0,0,1,0,0,0],[0,0,0,0,0,0,0]], np.uint8)
bg = 1 - img
for fg_c, bg_c in [(8, 8), (4, 4), (8, 4), (4, 8)]:
    nf = cv2.connectedComponents(img, connectivity=fg_c)[0] - 1
    nb = cv2.connectedComponents(bg, connectivity=bg_c)[0] - 1
    print(f'図形{fg_c}連結={nf}個, 背景{bg_c}連結={nb}個')
# (8,4) なら 図形1個・背景2個（外と内）= 閉曲線が内外を分ける → 矛盾なし
'''))

CC = A('''
0000000000
0110001110
0110001010
0000001110
0111000000
0111000110
0111000110
0000000000''')
Lc = label(CC, 8)
areas = [int((Lc == k).sum()) for k in range(1, Lc.max() + 1)]
E.append(dict(id='binary-connected-component', steps=[
    "① 2値画像の1画素を、連結性（4 または 8）に従って『互いにたどり着ける画素の集まり』に分ける",
    f"② 例：この画像は8連結で {Lc.max()} 個の連結成分（2×2 の塊、リング、3×3 の塊、2×2 の塊）",
    "③ 成分ごとに番号（ラベル）を付ける処理がラベリング。成分ごとに面積・重心・外接矩形などを計測できる",
    f"④ 面積：{', '.join(f'成分{k + 1}={a}' for k, a in enumerate(areas))} 画素",
    "⑤ 用途：部品の個数を数える、面積が小さい成分（ノイズ）を除去する、特定の物体だけを取り出す",
], example="面積が 5 画素未満の成分を消す → 2×2 の塊（面積4）が2つ消える（ゴミ取り）。リング（面積8）は穴を1つ持つ",
    figures=[gfig(panels([dict(a=CC, title='入力', mode='bin'), dict(a=Lc, title=f'連結成分 {Lc.max()} 個', mode='label', values=[[str(v) if v else '' for v in r] for r in Lc])], W=310, arrows=['']), '連結成分ごとに色と番号を付けた')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,1,1,0,0,0,1,1,1,0],[0,1,1,0,0,0,1,0,1,0],
                [0,0,0,0,0,0,1,1,1,0],[0,1,1,1,0,0,0,0,0,0],[0,1,1,1,0,0,0,1,1,0],
                [0,1,1,1,0,0,0,1,1,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
n, lab, stats, cent = cv2.connectedComponentsWithStats(img, connectivity=8)
print('成分数', n - 1)
for k in range(1, n):
    x, y, w, h, area = stats[k]
    print(k, '面積', area, '外接矩形', (x, y, w, h), '重心', cent[k].round(2))
# 面積5未満の成分を除去（ゴミ取り）
keep = np.isin(lab, [k for k in range(1, n) if stats[k, cv2.CC_STAT_AREA] >= 5])
print(keep.astype(int))
'''))

E.append(dict(id='binary-labeling', steps=[
    "① 入力：2値画像（1=図形）。連結性（4 または 8）を決める",
    "② 左上からラスタ走査し、未ラベルの1画素を見つけたら新しい番号を付け、つながる画素に同じ番号を広げる（または2パス法で仮ラベル＋等価表）",
    "③ 背景は 0、図形の画素には成分ごとに 1, 2, 3, … の番号が入ったラベル画像ができる",
    f"④ 例：右の画像では {Lc.max()} 成分 → 番号 1〜{Lc.max()}。番号は走査で最初に出会った順",
    "⑤ ラベル画像から『番号 k の画素数＝面積』『番号 k の座標の平均＝重心』など成分ごとの特徴を計算",
], example="ラベル画像の行1：0,1,1,0,0,0,2,2,2,0。ラベル 2 の画素数 = 8（リング）、ラベル 3 = 9",
    figures=[gfig(panels([dict(a=CC, title='入力', mode='bin'), dict(a=Lc, title='ラベル画像', mode='val', values=True, colors=lcol(Lc))], W=310, arrows=['']), 'ラベル画像：各画素に成分番号（背景0）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,1,1,0,0,0,1,1,1,0],[0,1,1,0,0,0,1,0,1,0],
                [0,0,0,0,0,0,1,1,1,0],[0,1,1,1,0,0,0,0,0,0],[0,1,1,1,0,0,0,1,1,0],
                [0,1,1,1,0,0,0,1,1,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
lab = np.zeros(img.shape, int); n = 0
for y, x in zip(*np.nonzero(img)):          # ラスタ順に未ラベルの1を探す
    if lab[y, x]: continue
    n += 1; stack = [(y, x)]; lab[y, x] = n
    while stack:                            # 8近傍に同じ番号を広げる（塗りつぶし）
        cy, cx = stack.pop()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < 8 and 0 <= nx < 10 and img[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; stack.append((ny, nx))
print(lab)
print([(k, int((lab == k).sum())) for k in range(1, n + 1)])   # 面積
print(cv2.connectedComponents(img, connectivity=8)[0] - 1)
'''))

U = A('''
000000000
010001010
010001010
010001010
011111110
000000000''')
Lu, first, lut = label(U, 8, return_first=True)
E.append(dict(id='binary-two-pass', steps=[
    "① 1回目の走査：左上から順に、各1画素の走査済み近傍（8連結なら左上・上・右上・左）を見る",
    "② 近傍にラベルがなければ新しい仮ラベル、あればその最小値を付ける。異なるラベルが出会ったら『等価』として LUT（ルックアップテーブル）に記録",
    f"③ 例：U字形＋縦棒。上の行では3本の縦棒が別々に仮ラベル 1, 2, 3 を受けるが、最下行で全部がつながる → LUT に 2→1, 3→1 を記録",
    "④ LUT を整理して各仮ラベルの代表（最小）を求め、連番に付け直す",
    "⑤ 2回目の走査：LUT を引いて仮ラベルを最終ラベルに置き換える → U字全体がラベル 1 になる",
], example="LUT: " + ', '.join(f"{k}→{v}" for k, v in lut.items()) + "。1回目の走査だけだと同じ図形に3つの番号が残ってしまう",
    figures=[gfig(panels([dict(a=first, title='1回目（仮ラベル）', mode='val', values=True, colors=lcol(first)), dict(a=Lu, title='2回目（LUTで置換）', mode='val', values=True, colors=lcol(Lu))], W=320, arrows=['LUT']), '仮ラベル 1,2,3 が最下行で合流 → 等価関係を LUT で解決'),
             {"type": "table", "head": ["仮ラベル"] + [str(k) for k in lut], "rows": [["最終ラベル"] + [str(v) for v in lut.values()]], "caption": 'ルックアップテーブル'}],
    code=r'''import numpy as np

img = np.array([[0,0,0,0,0,0,0,0,0],[0,1,0,0,0,1,0,1,0],[0,1,0,0,0,1,0,1,0],
                [0,1,0,0,0,1,0,1,0],[0,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0,0]])
H, W = img.shape
lab = np.zeros((H, W), int); lut = [0]          # lut[k] = 仮ラベル k の親
def root(k):
    while lut[k] != k: k = lut[k]
    return k
for y in range(H):                               # 1回目の走査
    for x in range(W):
        if not img[y, x]: continue
        nb = [lab[y + dy, x + dx] for dy, dx in [(-1, -1), (-1, 0), (-1, 1), (0, -1)]
              if 0 <= y + dy and 0 <= x + dx < W and lab[y + dy, x + dx]]
        if not nb:
            lut.append(len(lut)); lab[y, x] = len(lut) - 1
        else:
            m = min(root(k) for k in nb); lab[y, x] = m
            for k in nb: lut[root(k)] = m        # 等価関係を記録
print(lab)                                       # 仮ラベル
final = {k: root(k) for k in range(1, len(lut))}
print('LUT', final)
print(np.vectorize(lambda k: final.get(k, 0))(lab))   # 2回目の走査
'''))

HO = A('''
0000000000
0111110000
0100010110
0101010110
0100010000
0111110000
0000000000''')
nh, Lbh, outer = holes(HO, 8)
holecol = [[('#222' if HO[r, c] else '#fff' if Lbh[r, c] == outer else '#ffd166') for c in range(10)] for r in range(7)]
E.append(dict(id='binary-hole', steps=[
    "① 図形（1）に囲まれ、画像の外側の背景とつながっていない背景（0）の連結成分を『穴』という",
    "② 求め方：背景画素をラベリングし（図形が8連結なら背景は4連結）、画像の外周に接する成分＝外部背景、それ以外＝穴",
    f"③ 例：四角い枠の中にある背景は外とつながらない → 穴。この画像の穴の数は {nh}（枠の中は中央の1画素の図形で区切られても4連結ではつながっている）",
    "④ 穴埋め：穴の画素を1にする（外部背景を塗りつぶし→反転→元画像と OR）",
    "⑤ 穴の数はオイラー数 E = C − H の H。文字認識（『0』『8』『B』の区別）などに使う",
], example=f"背景を4連結でラベリング → 外周に接する成分（白）と、接しない成分（黄）={nh}個。図形を8連結とみなした穴の数",
    figures=[gfig(panels([dict(a=HO, title='入力', mode='bin'), dict(a=HO, title=f'穴（黄）= {nh} 個', colors=holecol)], W=300, arrows=['']), '外周の背景につながらない背景 = 穴')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0],[0,1,0,0,0,1,0,1,1,0],
                [0,1,0,1,0,1,0,1,1,0],[0,1,0,0,0,1,0,0,0,0],[0,1,1,1,1,1,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0]], np.uint8)
bg = np.pad(1 - img, 1, constant_values=1)       # 外側を背景でぐるっと囲む
n, lab = cv2.connectedComponents(bg, connectivity=4)   # 図形8連結 → 背景4連結
outer = lab[0, 0]                                 # 外周につながる成分
holes = [k for k in range(1, n) if k != outer]
print('穴の数', len(holes))
# 穴埋め：穴の画素を1にする
filled = img | np.isin(lab[1:-1, 1:-1], holes)
print(filled.astype(int))
'''))

shapes_e = {
    'O': A('''
0000000
0111110
0100010
0100010
0111110
0000000'''),
    'B': A('''
0000000
0111100
0100100
0111110
0100010
0111110
0000000''')[:6] if False else A('''
0000000
0111100
0100100
0111110
0100010
0111110'''),
    'i': A('''
0000000
0001000
0000000
0001000
0001000
0001000'''),
}
erows = []
for k, s in shapes_e.items():
    c = n_comp(s, 8); h, _, _ = holes(s, 8)
    erows.append([k, str(c), str(h), str(c - h)])
E.append(dict(id='binary-euler', steps=[
    "① 連結成分の数 C（図形8連結）と穴の数 H（背景4連結で外とつながらない成分）を数える",
    "② オイラー数 E = C − H",
    "③ 例：『O』は C=1, H=1 → E=0。『B』は C=1, H=2 → E=−1。『i』は点と棒で C=2, H=0 → E=2",
    "④ 図形を伸ばしたり曲げたりしても（切ったりつないだりしなければ）E は変わらない＝位相的特徴",
    "⑤ 2×2 の局所パターンの個数から1回の走査で計算する方法もある（E = (Q1 − Q3 + 2QD)/4 など、8連結なら符号が変わる）",
], example="O：1−1=0、B：1−2=−1、i：2−0=2、C：1−0=1。4連結と8連結で C・H が変わることがあるので組合せを固定する",
    figures=[gfig(panels([dict(a=s, title=f"「{k}」 E={r[3]}", mode='bin') for (k, s), r in zip(shapes_e.items(), erows)], W=300, gap=20), '形とオイラー数'),
             {"type": "table", "head": ["図形", "連結成分 C", "穴 H", "E = C − H"], "rows": erows}],
    code=r'''import numpy as np
import cv2

def euler(img):
    C = cv2.connectedComponents(img, connectivity=8)[0] - 1        # 図形は8連結
    bg = np.pad(1 - img, 1, constant_values=1)
    nb, lab = cv2.connectedComponents(bg, connectivity=4)          # 背景は4連結
    H = nb - 1 - 1                                                 # 外部背景を除く
    return C, H, C - H
O = np.zeros((6, 7), np.uint8); O[1:5, 1:6] = 1; O[2:4, 2:5] = 0
B = np.zeros((6, 7), np.uint8); B[1:6, 1:6] = 1; B[2, 2:4] = 0; B[1, 5] = 0; B[2, 4:6] = [1, 0]; B[4, 2:5] = 0
i = np.zeros((6, 7), np.uint8); i[1, 3] = 1; i[3:6, 3] = 1
for name, im in [('O', O), ('B', B), ('i', i)]:
    print(name, 'C,H,E =', euler(im))
'''))

TR = A('''
00000000
01110000
01111100
01111110
00111110
00011000
00000000''')
pts, codes = trace(TR)
order = [['' for _ in range(8)] for _ in range(7)]
for i_, (y, x) in enumerate(pts):
    if order[y][x] == '':
        order[y][x] = str(i_)
trcol = [[('#e7efff' if TR[r, c] else '#fff') for c in range(8)] for r in range(7)]
for (y, x) in pts:
    trcol[y][x] = '#ffb703'
E.append(dict(id='binary-boundary-tracing', steps=[
    "① ラスタ走査で最初に見つかった1画素（左上）を始点 P0 とする",
    "② 現在の画素の8近傍を、直前の進行方向を基準に一定の回転順（ここでは反時計回り）で調べ、最初に見つかった1画素へ進む（Moore の近傍追跡）",
    f"③ 進むたびに番号を付ける。例：P0=(1,1) → 下 (2,1) → (3,1) → 右下 (4,2) …",
    f"④ 始点に戻ったら終了。この図形では {len(pts)} 歩で一周し、境界画素（黄）が順番に並んだ点列が得られる",
    "⑤ 内部を調べないので速い。得られた点列はチェーンコード・周囲長・曲率・フーリエ記述子などに使う",
], example="点列: " + ' → '.join(f"({int(y)},{int(x)})" for y, x in pts[:8]) + " …（(行,列)）",
    figures=[gfig(panels([dict(a=TR, title='入力', mode='bin'), dict(a=TR, title='追跡順（番号）', colors=trcol, values=order)], W=300, arrows=['']), '黄：境界画素、数字：たどった順番（反時計回り）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0],[0,1,1,1,0,0,0,0],[0,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,0],
                [0,0,1,1,1,1,1,0],[0,0,0,1,1,0,0,0],[0,0,0,0,0,0,0,0]], np.uint8)
D = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]  # 0=右から反時計回り
ys, xs = np.nonzero(img); start = cur = (ys[0], xs[0])   # ラスタ順で最初の1
pts, d = [start], 5                                       # 最初は左下方向から探す
while True:
    for i in range(8):                                    # 反時計回りに近傍を調べる
        k = (d + i) % 8
        ny, nx = cur[0] + D[k][0], cur[1] + D[k][1]
        if img[ny, nx]:
            cur = (ny, nx); d = (k + 6) % 8 if k % 2 == 0 else (k + 5) % 8
            break
    if cur == start: break
    pts.append(cur)
print(len(pts), [(int(y), int(x)) for y, x in pts])
cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
print(len(cs[0]), [tuple(int(v) for v in p[0][::-1]) for p in cs[0]][:5])   # (行,列)で比較
'''))


def chain_fig():
    W = 320
    b = []
    cs = 22
    ox, oy = 8, 18
    b.append(T(ox + 4 * cs, 12, '輪郭と移動方向', 10))
    b.append(grid(TR, ox, oy, cs, colors=[[('#e7efff' if TR[r, c] else '#fff') for c in range(8)] for r in range(7)]))
    for i_, (y, x) in enumerate(pts):
        ny, nx = pts[(i_ + 1) % len(pts)]
        x1, y1 = ox + x * cs + cs / 2, oy + y * cs + cs / 2
        x2, y2 = ox + nx * cs + cs / 2, oy + ny * cs + cs / 2
        b.append(arrow(x1, y1, x1 + (x2 - x1) * 0.82, y1 + (y2 - y1) * 0.82, None, RED, w=1.3))
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        b.append(T(mx + (4 if codes[i_] in (6, 2) else 0), my - (3 if codes[i_] in (0, 4) else -3), str(codes[i_]), 9, fill=BLUE, weight='bold'))
    b.append(C(ox + pts[0][1] * cs + cs / 2, oy + pts[0][0] * cs + cs / 2, 4, GREEN))
    # 方向番号
    dx0, dy0 = 225, 40
    b.append(T(dx0 + 33, 24, '方向番号', 10))
    for k_, (dy, dx) in enumerate(DIRS8):
        x2, y2 = dx0 + 33 + dx * 26, dy0 + 33 + dy * 26
        b.append(arrow(dx0 + 33, dy0 + 33, dx0 + 33 + dx * 18, dy0 + 33 + dy * 18, None, '#555', w=1.1))
        b.append(T(x2, y2 + 4, str(k_), 11, fill=BLUE, weight='bold'))
    b.append(T(258, 130, '偶数=長さ1', 9, fill='#444'))
    b.append(T(258, 143, '奇数=長さ√2', 9, fill='#444'))
    return svg(W, 178, ''.join(b))


ev, od, plen = perim_chain(codes)
E.append(dict(id='binary-chain-code', steps=[
    "① 境界追跡で得た輪郭の点列について、次の点への移動方向を番号にする",
    "② 8方向チェーンコード：右=0、右上=1、上=2、左上=3、左=4、左下=5、下=6、右下=7（反時計回りに45°ずつ）",
    f"③ 例：始点 (1,1) から下へ2歩 → 6, 6、右下 → 7 …。この図形のチェーンコードは {''.join(map(str, codes))}",
    "④ 始点座標＋符号列だけで輪郭を完全に復元できる（1歩3ビット）。符号の総和の移動量は 0（閉曲線）",
    f"⑤ 周囲長：偶数コード {ev} 個 ×1 + 奇数コード {od} 個 ×√2 = {f(plen, 3)}",
], example=f"始点 (1,1)、コード {''.join(map(str, codes))}（{len(codes)} 個）。4方向チェーンコードでは右0・上1・左2・下3",
    figures=[gfig(chain_fig(), '緑：始点。赤矢印の各移動に方向番号（青）を付けた列がチェーンコード')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0],[0,1,1,1,0,0,0,0],[0,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,0],
                [0,0,1,1,1,1,1,0],[0,0,0,1,1,0,0,0],[0,0,0,0,0,0,0,0]], np.uint8)
cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
pts = cs[0][:, 0, :]                              # (x, y) の点列（反時計回り）
# 移動ベクトル (dx, dy) → 8方向コード（画像は y 下向きなので「上」は dy=-1）
code_of = {(1, 0): 0, (1, -1): 1, (0, -1): 2, (-1, -1): 3, (-1, 0): 4, (-1, 1): 5, (0, 1): 6, (1, 1): 7}
d = np.roll(pts, -1, axis=0) - pts
codes = [code_of[(int(dx), int(dy))] for dx, dy in d]
print('始点(x,y)=', tuple(pts[0]), ' chain =', ''.join(map(str, codes)))
even = sum(c % 2 == 0 for c in codes); odd = len(codes) - even
print('周囲長 =', even, '+', odd, '√2 =', round(even + odd * np.sqrt(2), 3))
print(round(cv2.arcLength(cs[0], True), 3))       # OpenCV の周囲長も同じ考え方
'''))

TRr = np.rot90(TR)  # 90°反時計回り回転
pts_r, codes_r = trace(TRr)


def diffc(cs):
    return [(cs[i] - cs[i - 1]) % 8 for i in range(len(cs))]


def min_rot(seq):
    rots = [seq[i:] + seq[:i] for i in range(len(seq))]
    return min(rots)


d1 = min_rot(diffc(codes)); d2 = min_rot(diffc(codes_r))
E.append(dict(id='binary-diff-chain', steps=[
    "① チェーンコード c1, c2, …, cn を求める（例：前項の図形）",
    "② 隣り合う符号の差 di = (ci − ci−1) mod 8 を計算（d1 は最後の符号との差）。0=直進、1=左へ45°、7=右へ45°…＝曲がり具合",
    f"③ 図形を 90° 回転すると、チェーンコードは全部の符号に +2 が加わる（例：{''.join(map(str, codes[:6]))}… → {''.join(map(str, [(c + 2) % 8 for c in codes[:6]]))}…）",
    "④ 差分を取ると +2 が打ち消されるので、差分チェーンコードは回転（45°の倍数）に不変",
    "⑤ さらに巡回させて最小の数列を選べば始点にも不変（形状数）。2つの図形が同じ形かを比べるのに使う",
], example=f"元：{''.join(map(str, codes))}\n回転後：{''.join(map(str, codes_r))}\n差分（巡回最小）：どちらも {''.join(map(str, d1))}（一致={d1 == d2}）",
    figures=[gfig(panels([dict(a=TR, title='元の図形', mode='bin'), dict(a=TRr, title='90°回転', mode='bin')], W=280, arrows=['90°']), '回転するとチェーンコードは変わるが差分チェーンコードは同じ'),
             {"type": "table", "head": ["", "符号列"], "rows": [["元のチェーンコード", ''.join(map(str, codes))], ["回転後", ''.join(map(str, codes_r))], ["差分（巡回最小化）", ''.join(map(str, d1))], ["回転後の差分", ''.join(map(str, d2))]]}],
    code=r'''import numpy as np

def diff_chain(c):                     # d_i = (c_i - c_{i-1}) mod 8
    return [(c[i] - c[i - 1]) % 8 for i in range(len(c))]
def shape_number(d):                   # 巡回させて最小の列（始点に不変）
    return min(d[i:] + d[:i] for i in range(len(d)))

chain = [6, 6, 7, 7, 0, 0, 1, 2, 2, 4, 4, 3, 2, 3, 0]   # 例：ある図形のチェーンコード
chain = [6, 6, 7, 7, 0, 1, 2, 3, 2, 4, 3, 4]
rot90 = [(c + 2) % 8 for c in chain]                     # 90°回転すると全符号 +2
start2 = rot90[5:] + rot90[:5]                           # しかも始点も違うとする
print(diff_chain(chain))
print(diff_chain(rot90))                                 # 差分は回転前と同じ
print(shape_number(diff_chain(chain)) == shape_number(diff_chain(start2)))
'''))

# ---------------- モルフォロジー ----------------
DISK5 = np.array([[0, 1, 1, 1, 0], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [0, 1, 1, 1, 0]])
LINE = np.array([[0, 0, 0], [1, 1, 1], [0, 0, 0]])


def se_vals(se):
    k = se.shape[0] // 2
    return [['◎' if (r == k and c == k) else '' for c in range(se.shape[1])] for r in range(se.shape[0])]


E.append(dict(id='binary-se', steps=[
    "① 構造要素＝小さな形（マスク）と原点（基準点、ふつう中心◎）の組。膨張・収縮で『この形を当てはめる』のに使う",
    "② 代表例：3×3 正方形（8近傍）、十字形（4近傍）、5×5 円盤、横線（1×3）など",
    "③ 形が結果を決める：正方形で膨張すると図形は四角く太り、十字形だと角が丸く（菱形状に）太る。横線の構造要素なら横方向にだけ太る",
    "④ 大きさが『消したい／残したい構造の大きさ』を決める：3×3 のオープニングは幅2以下の突起や点を消す",
    "⑤ OpenCV では cv2.getStructuringElement(cv2.MORPH_RECT / MORPH_CROSS / MORPH_ELLIPSE, (w,h)) で作る",
], example="1画素の点を 3×3 正方形で膨張 → 3×3 の正方形、十字形で膨張 → 5画素の十字。構造要素の形がそのまま押印される",
    figures=[gfig(panels([dict(a=SQ, title='3×3正方形', values=se_vals(SQ), colors=[[('#222' if v else '#fff') for v in r] for r in SQ]), dict(a=CROSS, title='十字形', values=se_vals(CROSS), colors=[[('#222' if v else '#fff') for v in r] for r in CROSS]), dict(a=DISK5, title='5×5円盤', values=se_vals(DISK5), colors=[[('#222' if v else '#fff') for v in r] for r in DISK5]), dict(a=LINE, title='横線', values=se_vals(LINE), colors=[[('#222' if v else '#fff') for v in r] for r in LINE])], W=320, gap=14), '構造要素の例（◎＝原点）'),
             gfig(panels([dict(a=np.pad([[1]], 2), title='1点', mode='bin'), dict(a=dil(np.pad([[1]], 2), SQ), title='正方形で膨張', mode='bin'), dict(a=dil(np.pad([[1]], 2), CROSS), title='十字形で膨張', mode='bin')], W=300, arrows=['', '']), '1点を膨張すると構造要素の形が押印される')],
    code=r'''import numpy as np
import cv2

for name, shape in [('RECT', cv2.MORPH_RECT), ('CROSS', cv2.MORPH_CROSS), ('ELLIPSE', cv2.MORPH_ELLIPSE)]:
    print(name); print(cv2.getStructuringElement(shape, (5, 5)))
# 1点を膨張すると構造要素の形になる
pt = np.zeros((5, 5), np.uint8); pt[2, 2] = 1
print(cv2.dilate(pt, cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))))
line = np.ones((1, 3), np.uint8)                 # 横線の構造要素
print(cv2.dilate(pt, line))                      # 横方向にだけ太る
'''))

E.append(dict(id='binary-morphology', steps=[
    "① 図形を集合とみなし、構造要素 B を当てはめて形を変える演算の体系（Matheron と Serra）",
    "② 基本は2つ：膨張（B が1画素でも重なれば1）＝図形が太る、収縮（B が全部収まるときだけ1）＝図形が細る",
    "③ 組合せ：オープニング＝収縮→膨張（小さな突起・点を消す）、クロージング＝膨張→収縮（小さな穴・すき間を埋める）",
    "④ さらに トップハット、ブラックハット、モルフォロジー勾配、ヒットオアミス、細線化、骨格、グラニュロメトリ へ発展",
    "⑤ 濃淡画像にも拡張でき、膨張＝近傍の最大値、収縮＝近傍の最小値（最大値・最小値フィルタ）",
], example=f"右の図（3×3 正方形）：入力 {BASE.sum()} 画素 → 膨張 {dil(BASE).sum()} 画素、収縮 {ero(BASE).sum()} 画素、オープニング {opn(BASE).sum()} 画素、クロージング {cls(BASE).sum()} 画素",
    figures=[gfig(panels([dict(a=BASE, title='入力', mode='bin'), dict(a=dil(BASE), title='膨張', colors=dcol(BASE, dil(BASE))), dict(a=ero(BASE), title='収縮', colors=dcol(BASE, ero(BASE)))], W=320, arrows=['', '']), '青＝増えた画素、ピンク＝消えた画素'),
             gfig(panels([dict(a=opn(BASE), title='オープニング', colors=dcol(BASE, opn(BASE))), dict(a=cls(BASE), title='クロージング', colors=dcol(BASE, cls(BASE)))], W=300), '入力との差：オープニングは点と突起を消し、クロージングは穴を埋める')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,1,0],
                [0,1,1,0,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0,0,0,0],
                [0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
k = np.ones((3, 3), np.uint8)                       # 3x3 正方形の構造要素
ops = {'膨張': cv2.dilate(img, k), '収縮': cv2.erode(img, k),
       'オープニング': cv2.morphologyEx(img, cv2.MORPH_OPEN, k),
       'クロージング': cv2.morphologyEx(img, cv2.MORPH_CLOSE, k)}
print('入力', img.sum())
for name, r in ops.items():
    print(name, r.sum()); print(r)
'''))

Aset = [(0, 0), (1, 0), (1, 1)]
Bset = [(0, 0), (1, 0), (0, 1)]
msum = sorted({(a[0] + b[0], a[1] + b[1]) for a in Aset for b in Bset})


def mink_fig():
    W = 320
    b = []
    cs = 24

    def draw(ox, oy, pts, cols, title, n=4):
        out = [T(ox + n * cs / 2, oy - 6, title, 10)]
        for r in range(n):
            for c in range(n):
                out.append(R(ox + c * cs, oy + (n - 1 - r) * cs, cs, cs, '#fff', '#ccc', 0.6))
        for (x, y), col in zip(pts, cols):
            out.append(R(ox + x * cs + 2, oy + (n - 1 - y) * cs + 2, cs - 4, cs - 4, col, 'none'))
        out.append(T(ox - 4, oy + n * cs + 4, '0', 8, 'end', fill='#999'))
        return ''.join(out)
    b.append(draw(10, 22, Aset, ['#222'] * 3, 'A', 3))
    b.append(draw(100, 22, Bset, ['#555'] * 3, 'B（原点=左下）', 3))
    cols = []
    pts2 = []
    for i_, bb in enumerate(Bset):
        for a in Aset:
            pts2.append((a[0] + bb[0], a[1] + bb[1])); cols.append([RED, BLUE, GREEN][i_])
    seen = {}
    for p_, c_ in zip(pts2, cols):
        seen.setdefault(p_, []).append(c_)
    b.append(T(250, 16, 'A⊕B（色＝どの b で移したか）', 9))
    ox, oy = 205, 22
    for r in range(4):
        for c in range(4):
            b.append(R(ox + c * cs, oy + (3 - r) * cs, cs, cs, '#fff', '#ccc', 0.6))
    for (x, y), cl in seen.items():
        w = (cs - 4) / len(cl)
        for j, c_ in enumerate(cl):
            b.append(R(ox + x * cs + 2 + j * w, oy + (3 - y) * cs + 2, w, cs - 4, c_, 'none'))
    b.append(T(250, 130, '赤:+(0,0) 青:+(1,0) 緑:+(0,1)', 9, fill='#444'))
    return svg(W, 138, ''.join(b))


E.append(dict(id='binary-minkowski', steps=[
    "① 図形 A と構造要素 B を点（座標）の集合で表す。例：A = {(0,0),(1,0),(1,1)}、B = {(0,0),(1,0),(0,1)}",
    "② ミンコフスキー和 A⊕B = {a + b}：A を B の各点だけ平行移動したものを全部重ねる（和集合）",
    f"③ 計算：+(0,0) → A そのもの、+(1,0) → {{(1,0),(2,0),(2,1)}}、+(0,1) → {{(0,1),(1,1),(1,2)}}。和集合 = {msum}（{len(msum)} 点）",
    "④ ミンコフスキー差 A⊖B：A を B の各点で（逆向きに）移動したものの共通部分 → 図形が縮む（収縮）",
    "⑤ 和が膨張、差が収縮の数学的な定義。補集合を取ると和と差が入れ替わる（双対性）",
], example=f"A⊕B の点数 {len(msum)}（重なりがあるので 3×3=9 より少ない）。A⊖B = {{(1,0)}}…ではなく、B を当てて全部 A に入る原点位置 → この例では空集合",
    figures=[gfig(mink_fig(), 'ミンコフスキー和＝B の各点で A を平行移動した和集合')],
    code=r'''import numpy as np

A = {(0, 0), (1, 0), (1, 1)}
B = {(0, 0), (1, 0), (0, 1)}
msum = {(a[0] + b[0], a[1] + b[1]) for a in A for b in B}         # A⊕B
print(sorted(msum))
# ミンコフスキー差：B の各点 b について A を -b 移動した集合の共通部分
mdiff = set.intersection(*[{(a[0] - b[0], a[1] - b[1]) for a in A} for b in B])
print(sorted(mdiff))                                              # この例では空
# 大きい図形で：3x2 の長方形を B で
R = {(x, y) for x in range(3) for y in range(2)}
print(sorted(set.intersection(*[{(a[0] - b[0], a[1] - b[1]) for a in R} for b in B])))
'''))

E.append(dict(id='binary-dilation', steps=[
    "① 入力：2値画像と構造要素（例 3×3 正方形）",
    "② 各画素に構造要素の原点を置き、構造要素の範囲に1画素でも1があれば出力を1にする（＝3×3 の最大値フィルタ）",
    "③ 例：穴 (3,3) は周りに1があるので1になる（穴が埋まる）。図形の外側1画素の輪も1になる（青）",
    f"④ 出力：図形が1画素分太り、{BASE.sum()} → {dil(BASE).sum()} 画素。孤立点は 3×3 の塊に、細い突起は幅3に",
    "⑤ 用途：切れた線をつなぐ、小さな穴を埋める、領域を少し広げてマスクにする",
], example="画素 (2,8)：右隣 (2,9) が孤立点の1なので 3×3 内に1あり → 1。画素 (0,0)：3×3 内に1がない → 0",
    figures=[gfig(panels([dict(a=BASE, title='入力', mode='bin'), dict(a=dil(BASE), title='膨張（3×3）', colors=dcol(BASE, dil(BASE)))], W=310, arrows=['⊕']), '青＝膨張で増えた画素')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,1,0],
                [0,1,1,0,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0,0,0,0],
                [0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
H, W = img.shape
p = np.pad(img, 1)                                # 外側は0
out = np.zeros_like(img)
for dy in (-1, 0, 1):                             # 3x3 内に1つでも1があれば1（OR）
    for dx in (-1, 0, 1):
        out |= p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
print(out)
print(np.array_equal(out, cv2.dilate(img, np.ones((3, 3), np.uint8))))
print(img.sum(), '->', out.sum())
'''))

E.append(dict(id='binary-erosion', steps=[
    "① 入力：2値画像と構造要素（例 3×3 正方形）",
    "② 各画素に構造要素を置き、範囲の全画素が1のときだけ出力を1にする（1つでも0があれば0）＝3×3 の最小値フィルタ",
    "③ 例：孤立点 (2,9) は周りが0 → 消える。幅1の突起も消える。穴 (3,3) の周り8画素も0になり、穴が広がる",
    f"④ 出力：図形が1画素分細り、{BASE.sum()} → {ero(BASE).sum()} 画素（ピンクが消えた画素）",
    "⑤ 用途：小さなノイズの除去、くっついた物体の切り離し、境界抽出（元画像 − 収縮）",
], example="画素 (5,2)：3×3 内がすべて1 → 1 のまま。画素 (1,1)：左上が背景 → 0。画像の外は0とみなす",
    figures=[gfig(panels([dict(a=BASE, title='入力', mode='bin'), dict(a=ero(BASE), title='収縮（3×3）', colors=dcol(BASE, ero(BASE)))], W=310, arrows=['⊖']), 'ピンク＝収縮で消えた画素')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,1,0],
                [0,1,1,0,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0,0,0,0],
                [0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
H, W = img.shape
p = np.pad(img, 1)                                # 外側は0
out = np.ones_like(img)
for dy in (-1, 0, 1):                             # 3x3 が全部1のときだけ1（AND）
    for dx in (-1, 0, 1):
        out &= p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
print(out)
print(np.array_equal(out, cv2.erode(img, np.ones((3, 3), np.uint8), borderValue=0)))
print(img.sum(), '->', out.sum())
'''))

e1 = ero(BASE); o1 = dil(e1)
E.append(dict(id='binary-opening', steps=[
    "① 入力画像を構造要素（3×3）で収縮する：孤立点・幅1の突起が消える（図形全体も細る）",
    "② その結果を同じ構造要素で膨張する：残った部分が元の太さに戻る",
    f"③ 例：{BASE.sum()} 画素 → 収縮 {e1.sum()} → 膨張 {o1.sum()} 画素。孤立点 (2,9) と右に伸びた突起が消え、本体の四角形はほぼ元通り",
    "④ 『構造要素が入り込めない細い部分を削る』処理。構造要素を内側で転がして届く範囲だけが残る",
    "⑤ 用途：ゴマ塩ノイズ（白点）除去、細いつながりの切断。何度繰り返しても結果は同じ（べき等）",
], example="穴 (3,3) は収縮で広がり、膨張で戻る → 穴はそのまま残る（穴埋めはクロージング）。(A∘B)∘B = A∘B",
    figures=[gfig(panels([dict(a=BASE, title='入力', mode='bin'), dict(a=e1, title='① 収縮', colors=dcol(BASE, e1)), dict(a=o1, title='② 膨張', colors=dcol(e1, o1))], W=320, arrows=['⊖', '⊕']), '収縮で点と突起が消え、膨張で本体が戻る')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,1,0],
                [0,1,1,0,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0,0,0,0],
                [0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
k = np.ones((3, 3), np.uint8)
e = cv2.erode(img, k, borderValue=0)              # ① 収縮
o = cv2.dilate(e, k)                              # ② 膨張
print(o)
print(np.array_equal(o, cv2.morphologyEx(img, cv2.MORPH_OPEN, k)))
print(img.sum(), e.sum(), o.sum())
o2 = cv2.morphologyEx(o, cv2.MORPH_OPEN, k)       # もう一度しても変わらない（べき等）
print(np.array_equal(o, o2))
'''))

GAP = A('''
000000000000
011110111100
011110111100
011010111100
011110111100
000000000000''')
d1_ = dil(GAP); c1 = ero(d1_)
E.append(dict(id='binary-closing', steps=[
    "① 入力画像を構造要素（3×3）で膨張する：小さな穴や幅1〜2のすき間が埋まる（図形全体も太る）",
    "② その結果を同じ構造要素で収縮する：太った外形が元に戻る",
    f"③ 例：2つの四角形の間の幅1のすき間と、左の四角形の中の穴 (3,3) が埋まり、1つの塊になる（{GAP.sum()} → {c1.sum()} 画素）",
    "④ 『構造要素が入り込めない細い背景を埋める』処理。オープニングの白黒反転版（双対）",
    "⑤ 用途：文字のかすれ・切れ目の修復、物体内部の小さな穴（黒点ノイズ）の除去。べき等",
], example="すき間の列 (1..4, 5) は膨張で1になり、収縮後も両側が1なので1のまま残る。外形の角は膨張→収縮で元通り",
    figures=[gfig(panels([dict(a=GAP, title='入力', mode='bin'), dict(a=d1_, title='① 膨張', colors=dcol(GAP, d1_)), dict(a=c1, title='② 収縮', colors=dcol(GAP, c1))], W=320, arrows=['⊕', '⊖']), 'すき間と穴が埋まり（青）、外形は元に戻る')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,0,1,1,1,1,0,0],[0,1,1,1,1,0,1,1,1,1,0,0],
                [0,1,1,0,1,0,1,1,1,1,0,0],[0,1,1,1,1,0,1,1,1,1,0,0],[0,0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
k = np.ones((3, 3), np.uint8)
d = cv2.dilate(img, k)                            # ① 膨張
c = cv2.erode(d, k, borderValue=0)                # ② 収縮（画像外は背景）
print(c)
print(img.sum(), '->', c.sum())
print(np.array_equal(c, cv2.morphologyEx(img, cv2.MORPH_CLOSE, k, borderValue=0)))
'''))

Ac = 1 - BASE
dAc = dil(Ac)
E.append(dict(id='binary-duality', steps=[
    "① 図形 A の補集合 Aᶜ（白黒反転）をとる",
    "② Aᶜ を構造要素で膨張する（背景が太る）",
    "③ その結果をもう一度反転すると、A を収縮した結果と一致する：(A ⊖ B)ᶜ = Aᶜ ⊕ B̂",
    "④ 同様に (A ⊕ B)ᶜ = Aᶜ ⊖ B̂、オープニングとクロージングも互いに双対（B̂ は B の反転。対称な正方形なら B̂ = B）",
    "⑤ 意味：『黒い図形を細らせる』＝『白い背景を太らせる』。どちらを図形と見るかで処理名が入れ替わる",
], example=f"A の収縮の画素数 {ero(BASE).sum()}、反転→膨張→反転の画素数 {(1 - dAc).sum()}（一致={bool(np.array_equal(ero(BASE), 1 - dAc))}）。ただし画像の外側の扱い（0/1）をそろえる必要がある",
    figures=[gfig(panels([dict(a=Ac, title='Aᶜ（反転）', mode='bin'), dict(a=dAc, title='Aᶜ を膨張', colors=dcol(Ac, dAc)), dict(a=1 - dAc, title='反転 = A⊖B', mode='bin')], W=320, arrows=['⊕', '反転']), '背景を膨張して反転 → 図形の収縮と同じ結果')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,1,0],
                [0,1,1,0,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0,0,0,0],
                [0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
k = np.ones((3, 3), np.uint8)
ero = cv2.erode(img, k, borderValue=0)                 # 図形を収縮（画像外=背景）
bg_dil = cv2.dilate(1 - img, k, borderValue=1)         # 背景を膨張（画像外=背景=1）
print(np.array_equal(ero, 1 - bg_dil))                 # (A⊖B)^c = A^c⊕B
dil = cv2.dilate(img, k, borderValue=0)
bg_ero = cv2.erode(1 - img, k, borderValue=1)
print(np.array_equal(dil, 1 - bg_ero))                 # (A⊕B)^c = A^c⊖B
'''))

# トップハット（1D濃淡）
xs1 = np.arange(60)
bgprof = 60 + xs1 * 2.0
sig = bgprof.copy()
for c0, w_ in [(12, 2), (30, 3), (47, 2)]:
    sig[c0:c0 + w_] += 50
def gmin(s, k):
    p = np.pad(s, k // 2, mode='edge'); return np.array([p[i:i + k].min() for i in range(len(s))])
def gmax(s, k):
    p = np.pad(s, k // 2, mode='edge'); return np.array([p[i:i + k].max() for i in range(len(s))])
opened = gmax(gmin(sig, 7), 7)
th_ = sig - opened
E.append(dict(id='binary-tophat', steps=[
    "① 入力：明るさが右上がりに変化する背景（照明むら）の上に、細い明るい線（幅2〜3画素）がある濃淡画像",
    "② 構造要素（幅7）でオープニング（最小値→最大値フィルタ）：幅7より細い明るい山が削られ、背景だけが残る",
    "③ 元画像 − オープニング結果 ＝ トップハット：削られた『細い明るい山』だけが残り、背景の傾きは 0 になる",
    "④ 例：背景 84 の上の山 134 → オープニングでは 84〜86 → トップハット ≈ 50。背景部分はどこでも 0",
    "⑤ 出力を固定しきい値（例 25）で2値化すれば、照明むらに関係なく細い明るい対象（文字・傷・粒子）を抽出できる",
], example=f"x=12 の値 {f(sig[12])}、オープニング {f(opened[12])} → トップハット {f(th_[12])}。x=40（背景）では {f(sig[40])} − {f(opened[40])} = {f(th_[40])}",
    figures=[gfig(chart([(xs1, sig, '#333'), (xs1, opened, BLUE, '4 2'), (xs1, th_, RED)], W=310, H=170, xr=(0, 59), yr=(0, 240), xticks=[0, 20, 40, 59], yticks=[0, 100, 200], xlabel='画素位置', legend=[('入力f', '#333'), ('f∘B', BLUE), ('f−f∘B', RED)]), 'トップハット＝入力 − オープニング：細い明るい山だけが残る')],
    code=r'''import numpy as np
import cv2

x = np.arange(60)
f = 60 + 2.0 * x                                  # 右上がりの背景（照明むら）
for c, w in [(12, 2), (30, 3), (47, 2)]:
    f[c:c + w] += 50                              # 細い明るい線
f = np.tile(f, (5, 1)).astype(np.uint8)           # 5行の画像にする
k = np.ones((1, 7), np.uint8)                     # 幅7の構造要素
opened = cv2.dilate(cv2.erode(f, k), k)           # オープニング（min→max）
tophat = f.astype(int) - opened
print(tophat[2, 8:20])
print(np.array_equal(tophat, cv2.morphologyEx(f, cv2.MORPH_TOPHAT, k)))
print(np.nonzero(tophat[2] > 25)[0])              # しきい値で線だけ抽出
'''))

sig2 = bgprof.copy()
for c0, w_ in [(12, 2), (30, 3), (47, 2)]:
    sig2[c0:c0 + w_] -= 40
closed = gmin(gmax(sig2, 7), 7)
bh = closed - sig2
E.append(dict(id='binary-blackhat', steps=[
    "① 入力：照明むらのある背景の上に、細い暗い線（傷・文字・ひび割れ）がある濃淡画像",
    "② 構造要素（幅7）でクロージング（最大値→最小値フィルタ）：細い暗い谷が埋められ、背景だけになる",
    "③ クロージング結果 − 元画像 ＝ ブラックハット：埋められた『細い暗い谷』だけが正の値で残る",
    "④ 例：背景 120 の中の谷 80 → クロージングで約 120 → ブラックハット ≈ 40。背景部分は 0",
    "⑤ トップハットが明るい小物体、ブラックハットが暗い小物体を取り出す（両者は双対）",
], example=f"x=30 の値 {f(sig2[30])}、クロージング {f(closed[30])} → ブラックハット {f(bh[30])}。式：BH(f) = (f • B) − f",
    figures=[gfig(chart([(xs1, sig2, '#333'), (xs1, closed, BLUE, '4 2'), (xs1, bh, RED)], W=310, H=170, xr=(0, 59), yr=(0, 200), xticks=[0, 20, 40, 59], yticks=[0, 100, 200], xlabel='画素位置', legend=[('入力f', '#333'), ('f•B', BLUE), ('f•B−f', RED)]), 'ブラックハット＝クロージング − 入力：細い暗い谷だけが残る')],
    code=r'''import numpy as np
import cv2

x = np.arange(60)
f = 60 + 2.0 * x
for c, w in [(12, 2), (30, 3), (47, 2)]:
    f[c:c + w] -= 40                              # 細い暗い線
f = np.tile(f, (5, 1)).astype(np.uint8)
k = np.ones((1, 7), np.uint8)
closed = cv2.erode(cv2.dilate(f, k), k)           # クロージング（max→min）
bh = closed.astype(int) - f
print(bh[2, 26:36])
print(np.array_equal(bh, cv2.morphologyEx(f, cv2.MORPH_BLACKHAT, k)))
'''))

# ヒットオアミス：右端の端点検出（線の右端）
HM = A('''
000000000
011111000
000001000
000001110
010001000
000000000''')
B1 = np.array([[0, 0, 0], [0, 1, 0], [0, 0, 0]])   # 中心が1
B2 = np.array([[1, 1, 1], [0, 0, 1], [1, 1, 1]])   # 右・上下が0（左は don't care）... 端点(右端)
# 右端点: 中心1, 左1, それ以外0
B1 = np.array([[0, 0, 0], [1, 1, 0], [0, 0, 0]])
B2 = np.array([[1, 1, 1], [0, 0, 1], [1, 1, 1]])
hm = ero(HM, B1) & ero(1 - HM, B2)
pat = [['1' if B1[r, c] else '0' if B2[r, c] else '*' for c in range(3)] for r in range(3)]
patcol = [['#222' if B1[r, c] else '#fff' if B2[r, c] else '#ddd' for c in range(3)] for r in range(3)]
hmcol = [[('#e4572e' if hm[r, c] else '#222' if HM[r, c] else '#fff') for c in range(9)] for r in range(6)]
E.append(dict(id='binary-hit-or-miss', steps=[
    "① 検出したい局所パターンを『1であるべき画素 B1』と『0であるべき画素 B2』の組で表す（どちらでもない＝don't care）",
    "② 例：右向きの端点 = 中心と左が1、残り6画素が0（左上・左下も0）",
    "③ A を B1 で収縮（B1 の位置が全部1か）し、Aᶜ を B2 で収縮（B2 の位置が全部0か）して、両方の AND を取る",
    f"④ 結果は、パターンが完全に一致した位置だけが1。例：線の右端 {', '.join(f'({int(y)},{int(x)})' for y, x in np.argwhere(hm))} が検出された（赤）",
    "⑤ 用途：端点・分岐点・孤立点・角の検出、細線化（一致した画素を順に消す）、凸包の構成",
], example="(1,5) は右・上・下・斜めがすべて 0？ → 下 (2,5) が 1 なので不一致。(3,7) は左だけ1で他は0 → 一致",
    figures=[gfig(panels([dict(a=np.zeros((3, 3)), title='パターン(*=任意)', colors=patcol, values=pat), dict(a=HM, title='入力', mode='bin'), dict(a=HM, title='一致した位置（赤）', colors=hmcol)], W=320, arrows=['', '']), 'B1（黒=1であるべき）と B2（白=0であるべき）が同時に満たされる位置')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0],[0,0,0,0,0,1,0,0,0],
                [0,0,0,0,0,1,1,1,0],[0,1,0,0,0,1,0,0,0],[0,0,0,0,0,0,0,0,0]], np.uint8)
B1 = np.array([[0, 0, 0], [1, 1, 0], [0, 0, 0]], np.uint8)   # 1であるべき位置
B2 = np.array([[1, 1, 1], [0, 0, 1], [1, 1, 1]], np.uint8)   # 0であるべき位置
hit = cv2.erode(img, B1, borderValue=0)                      # B1 が全部1
miss = cv2.erode(1 - img, B2, borderValue=1)                 # B2 が全部0
res = hit & miss
print(np.argwhere(res))                                      # 右端点の位置
# OpenCV：1=前景, -1=背景, 0=don't care の1つのカーネルで
k = B1.astype(int) - B2.astype(int)
print(np.array_equal(res, cv2.morphologyEx(img, cv2.MORPH_HITMISS, k) // 255))
'''))

dB, eB = dil(BASE), ero(BASE)
grad = dB - eB
E.append(dict(id='binary-morph-gradient', steps=[
    "① 入力画像を膨張した画像 A⊕B と、収縮した画像 A⊖B を作る",
    "② 差 (A⊕B) − (A⊖B) をとると、境界をまたぐ幅2〜3画素の帯（内側の境界＋外側の境界）が残る",
    "③ 内側の境界だけなら A − (A⊖B)、外側の境界だけなら (A⊕B) − A",
    f"④ 例：3×3 正方形で、勾配の画素数 {grad.sum()} = 膨張 {dB.sum()} − 収縮 {eB.sum()}",
    "⑤ 濃淡画像では『近傍の最大値 − 最小値』＝エッジの強さ。微分フィルタより雑音に強い輪郭抽出になる",
], example=f"内側の境界 {(BASE - eB).sum()} 画素、外側の境界 {(dB - BASE).sum()} 画素、合計 {grad.sum()} 画素。濃淡なら 3×3 の最大 200・最小 50 の画素は勾配 150",
    figures=[gfig(panels([dict(a=BASE, title='入力', mode='bin'), dict(a=grad, title='膨張 − 収縮', colors=[[('#e4572e' if (grad[r, c] and BASE[r, c]) else '#3a86ff' if grad[r, c] else '#fff') for c in range(11)] for r in range(8)])], W=310, arrows=['']), '赤＝内側の境界（A−A⊖B）、青＝外側の境界（A⊕B−A）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,1,0],
                [0,1,1,0,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0,0,0,0],
                [0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
k = np.ones((3, 3), np.uint8)
d, e = cv2.dilate(img, k), cv2.erode(img, k, borderValue=0)
grad = d - e                                       # モルフォロジー勾配
inner, outer = img - e, d - img                    # 内側・外側の境界
print(grad)
print(grad.sum(), inner.sum(), outer.sum())
print(np.array_equal(grad, cv2.morphologyEx(img, cv2.MORPH_GRADIENT, k, borderValue=0)))
# 濃淡画像ではエッジ強度
g = np.array([[50, 50, 200], [50, 50, 200], [50, 50, 200]], np.uint8)
print(cv2.morphologyEx(g, cv2.MORPH_GRADIENT, k))
'''))

# ---------------- 距離変換 ----------------
DS = A('''
00000000000
01111111100
01111111100
01111111110
01111111110
01111111100
00000000000''')
Dc = dist(DS, 'city')
E.append(dict(id='binary-distance-transform', steps=[
    "① 入力：2値画像（1=図形）。各図形画素について『最も近い背景画素までの距離』を求める",
    "② 距離の定義を選ぶ：市街地距離（4近傍）、チェス盤距離（8近傍）、ユークリッド距離、面取り距離（3-4 など）",
    "③ 2回のラスタ走査で計算：順方向（左上→右下）に D = min(D, 左+1, 上+1)、逆方向（右下→左上）に D = min(D, 右+1, 下+1)",
    f"④ 出力：境界に近い画素ほど小さく、中央ほど大きい値の画像。例：この長方形では最大値 {Dc.max()}（中央の行）",
    "⑤ 用途：太さの計測、中心軸（距離値の尾根）、ウォーターシェッドのマーカー作り、膨張・収縮の高速計算（D ≥ k の画素 = k−1 回収縮）",
], example="1行目の図形画素はすべて1（すぐ上が背景）。中央の行は上下左右どちらから数えても最短が3 → 3",
    figures=[gfig(panels([dict(a=DS, title='入力', mode='bin'), dict(a=Dc, title='距離変換（市街地距離）', mode='gray', mx=4, values=[[str(v) if v else '' for v in r] for r in 4 - Dc] if False else [[str(v) if v else '' for v in r] for r in Dc], colors=[[(f"rgb({255 - v * 50},{255 - v * 35},255)" if v else '#fff') for v in r] for r in Dc])], W=320, arrows=['']), '各画素の値＝最も近い背景までの距離')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0,0],
                [0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,1,0],[0,1,1,1,1,1,1,1,1,0,0],
                [0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
H, W = img.shape
INF = 999
D = np.where(img > 0, INF, 0)
for y in range(H):                                # 順方向走査：左と上から
    for x in range(W):
        if D[y, x]:
            D[y, x] = min(D[y, x], D[y, x - 1] + 1 if x else INF, D[y - 1, x] + 1 if y else INF)
for y in range(H - 1, -1, -1):                    # 逆方向走査：右と下から
    for x in range(W - 1, -1, -1):
        if D[y, x]:
            D[y, x] = min(D[y, x], D[y, x + 1] + 1 if x < W - 1 else INF, D[y + 1, x] + 1 if y < H - 1 else INF)
print(D)
print(np.array_equal(D, cv2.distanceTransform(img, cv2.DIST_L1, 3).astype(int)))
'''))

P1 = np.ones((7, 7), int); P1[3, 3] = 0
d4 = dist(P1, 'city'); d8 = dist(P1, 'chess'); de = dist(P1, 'euclid')


def dgrid(D, title, fmt=lambda v: f(v), mx=None):
    mx = mx or D.max()
    cols = [[(f"rgb({int(255 - v / mx * 160)},{int(255 - v / mx * 110)},255)" if v else '#ffb703') for v in r] for r in D]
    return dict(a=D, title=title, colors=cols, values=[[('●' if v == 0 else fmt(v)) for v in r] for r in D])


E.append(dict(id='binary-cityblock', steps=[
    "① 2点 (x1, y1), (x2, y2) の市街地距離 d4 = |x1 − x2| + |y1 − y2|（碁盤の目の道を縦横だけで歩く距離）",
    "② 4近傍への1歩を距離1とした最短歩数に等しい。斜めの隣は 1+1 = 2",
    "③ 例：中心 (3,3) から (5,4) までは |2| + |1| = 3、角 (6,6) までは 3 + 3 = 6",
    "④ 中心から等距離の点の集まりは菱形（45°傾いた正方形）になる",
    "⑤ 距離変換では順・逆2回の走査で、4近傍（左・上 / 右・下）だけを見て +1 する",
], example="中心から距離1の画素は4個、距離2は8個、距離3は12個（菱形の輪）。ユークリッド距離 √8 = 2.83 の角でも d4 = 4",
    figures=[gfig(panels([dgrid(d4.astype(int), '市街地距離 d4（菱形）')], W=260, cs=26), '中心（●）からの d4 の値。同じ値が菱形に並ぶ')],
    code=r'''import numpy as np
import cv2

c = (3, 3)
yy, xx = np.mgrid[0:7, 0:7]
d4 = np.abs(xx - c[1]) + np.abs(yy - c[0])          # |dx| + |dy|
print(d4)
print('(5,4)までの距離', d4[4, 5])                  # x=5,y=4
# 距離変換で同じものを得る：中心だけ背景(0)にした画像
img = np.ones((7, 7), np.uint8); img[c] = 0
print(np.array_equal(cv2.distanceTransform(img, cv2.DIST_L1, 3).astype(int), d4))
'''))

E.append(dict(id='binary-chessboard', steps=[
    "① 2点の チェス盤距離 d8 = max(|x1 − x2|, |y1 − y2|)（チェスのキングが動く手数）",
    "② 8近傍への1歩（斜めを含む）を距離1とした最短歩数に等しい",
    "③ 例：中心 (3,3) から (5,4) までは max(2, 1) = 2、角 (6,6) までも max(3, 3) = 3",
    "④ 中心から等距離の点の集まりは正方形（軸に平行）になる",
    "⑤ 距離変換では8近傍（左上・上・右上・左 / その逆）を見て +1 する。d8 ≤ ユークリッド距離 ≤ d4",
], example="中心から距離1の画素は8個、距離2は16個、距離3は24個（正方形の輪）。斜め (6,6)：d8=3、d4=6、ユークリッド=4.24",
    figures=[gfig(panels([dgrid(d8.astype(int), 'チェス盤距離 d8（正方形）')], W=260, cs=26), '中心（●）からの d8 の値。同じ値が正方形に並ぶ')],
    code=r'''import numpy as np
import cv2

c = (3, 3)
yy, xx = np.mgrid[0:7, 0:7]
d8 = np.maximum(np.abs(xx - c[1]), np.abs(yy - c[0]))   # max(|dx|, |dy|)
print(d8)
img = np.ones((7, 7), np.uint8); img[c] = 0
print(np.array_equal(cv2.distanceTransform(img, cv2.DIST_C, 3).astype(int), d8))
print('(6,6): d8 =', d8[6, 6], ' d4 =', 6, ' euclid =', round(np.hypot(3, 3), 2))
'''))

E.append(dict(id='binary-euclidean-distance', steps=[
    "① 2点のユークリッド距離 dE = √((x1 − x2)² + (y1 − y2)²)（直線距離）",
    "② 例：中心 (3,3) から (5,4) までは √(4 + 1) = 2.24、角 (6,6) までは √18 = 4.24",
    "③ 等距離の点の集まりが円になり、回転しても値が変わらない（d4, d8 は向きで値が変わる）",
    "④ 正確なユークリッド距離変換は局所的な +1 の伝播では求まらず、最近傍の背景画素の座標を伝播する方法などが必要",
    "⑤ OpenCV の cv2.distanceTransform(img, cv2.DIST_L2, cv2.DIST_MASK_PRECISE) で厳密値、マスク3/5 では近似値",
], example="同じ点 (6,3)（中心から右へ3）：d4 = d8 = dE = 3。斜め (5,5)：d4=4, d8=2, dE=2.83",
    figures=[gfig(panels([dgrid(de, 'ユークリッド距離 dE（円）', fmt=lambda v: f"{v:.1f}")], W=260, cs=28), '中心（●）からの直線距離（小数1桁）。同じ値が円状に並ぶ')],
    code=r'''import numpy as np
import cv2

c = (3, 3)
yy, xx = np.mgrid[0:7, 0:7]
dE = np.sqrt((xx - c[1]) ** 2 + (yy - c[0]) ** 2)
print(dE.round(1))
img = np.ones((7, 7), np.uint8); img[c] = 0
exact = cv2.distanceTransform(img, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
approx = cv2.distanceTransform(img, cv2.DIST_L2, 3)          # 3x3 マスクの近似
print(np.allclose(exact, dE, atol=1e-3))
print(approx.round(2)[3])
'''))

dch = dist(P1, 'chamfer')
E.append(dict(id='binary-chamfer', steps=[
    "① 距離変換で、上下左右への1歩をコスト a、斜めへの1歩をコスト b とする（例：a = 3, b = 4 の『3-4距離』）",
    "② 2回の走査で D = min(D, 隣の D + a（縦横）, 隣の D + b（斜め）) を伝播する",
    "③ 例：中心から右へ3 → 3+3+3 = 9 → 9/3 = 3.0。斜め (6,6) → 4+4+4 = 12 → 4.0（真値 4.24）",
    "④ 結果を a で割るとユークリッド距離のよい近似（b/a = 4/3 = 1.33 ≈ √2 = 1.41）。等距離線は八角形",
    "⑤ 5-7（7/5 = 1.4）や 5-7-11（5×5 マスク）ではさらに精度が上がる。整数演算だけで速い",
], example="(5,4)：横2・縦1 → 斜め1歩(4)＋横1歩(3) = 7 → 7/3 = 2.33（真値 2.24）。市街地距離なら 3、チェス盤なら 2",
    figures=[gfig(panels([dgrid(dch.astype(int), '3-4 距離（値）'), dgrid(dch / 3, '÷3（近似距離）', fmt=lambda v: f"{v:.1f}")], W=320, cs=20), '左：面取り距離 3-4 の値、右：3で割った近似ユークリッド距離')],
    code=r'''import numpy as np
import cv2

img = np.ones((7, 7), np.uint8); img[3, 3] = 0          # 中心だけ背景
a, b = 3, 4                                              # 縦横 a、斜め b
INF = 10 ** 6
D = np.where(np.pad(img, 1) > 0, INF, 0)
fw = [(-1, -1, b), (-1, 0, a), (-1, 1, b), (0, -1, a)]
for y in range(1, 8):                                    # 順方向
    for x in range(1, 8):
        D[y, x] = min([D[y, x]] + [D[y + dy, x + dx] + w for dy, dx, w in fw])
for y in range(7, 0, -1):                                # 逆方向
    for x in range(7, 0, -1):
        D[y, x] = min([D[y, x]] + [D[y - dy, x - dx] + w for dy, dx, w in fw])
D = D[1:-1, 1:-1]
print(D); print((D / a).round(2)[6])
# OpenCV：DIST_L2 + マスク3 は a=0.955, b=1.3693 の面取り距離
print(cv2.distanceTransform(img, cv2.DIST_L2, 3).round(2)[6])
'''))

# ---------------- 細線化 ----------------
TH = A('''
0000000000000
0111111111100
0111111111100
0111111111100
0000011100000
0000011100000
0000011100000
0000011100000
0000000000000''')
zs, zhist = zhang_suen(TH, record=True)
hd = hilditch(TH)
ovz = [[('#e4572e' if zs[r, c] else '#c9d6ff' if TH[r, c] else '#fff') for c in range(13)] for r in range(9)]
ovh = [[('#e4572e' if hd[r, c] else '#c9d6ff' if TH[r, c] else '#fff') for c in range(13)] for r in range(9)]
E.append(dict(id='binary-thinning', steps=[
    "① 入力：太さのある図形（例：幅3のT字）",
    "② 境界の画素のうち『消しても図形がちぎれない（連結性を保つ）』『端点ではない』画素を1層ずつ消す",
    "③ これを消せる画素がなくなるまで繰り返す（例：幅3なら外側の2層が消える）",
    f"④ 出力：幅1画素の線（赤）。T字の形・枝の本数・つながり（位相）は保たれる。{TH.sum()} → {zs.sum()} 画素",
    "⑤ 用途：文字・指紋・血管・道路の形を線として解析（端点・分岐点の検出、線の長さ）。似た概念の骨格は復元可能な表現",
], example="T字の交点の画素は連結数3（3本の枝をつなぐ）なので消されない。端の画素は近傍に1が1つしかない端点なので残す",
    figures=[gfig(panels([dict(a=TH, title='入力（幅3）', mode='bin'), dict(a=TH, title='細線化（Zhang–Suen）', colors=ovz)], W=310, arrows=['']), '赤＝細線化の結果、薄青＝削られた画素')],
    code=r'''import numpy as np
import cv2

img = np.zeros((9, 13), np.uint8)
img[1:4, 1:11] = 1; img[4:8, 5:8] = 1                 # 幅3のT字
def nb(p, y, x):      # x1=右から反時計回り
    return [p[y,x+1], p[y-1,x+1], p[y-1,x], p[y-1,x-1], p[y,x-1], p[y+1,x-1], p[y+1,x], p[y+1,x+1]]
def nc8(n):           # 8連結の連結数（消しても図形がちぎれないなら1）
    b = [1 - v for v in n] + [1 - n[0]]
    return sum(b[k] - b[k] * b[k + 1] * b[k + 2] for k in (0, 2, 4, 6))
p = np.pad(img.copy(), 1); changed = True
while changed:                                        # 上・下・左・右の境界を順に1層ずつ消す
    changed = False
    for k in (2, 6, 4, 0):                            # 背景がある方向（x3=上, x7=下, x5=左, x1=右）
        dels = [(y, x) for y, x in zip(*np.nonzero(p))
                if nb(p, y, x)[k] == 0 and sum(nb(p, y, x)) >= 2 and nc8(nb(p, y, x)) == 1]
        for y, x in dels: p[y, x] = 0                 # 同じ方向の判定はまとめて削除
        changed |= bool(dels)
print(p[1:-1, 1:-1])
'''))

E.append(dict(id='binary-hilditch', steps=[
    "① ラスタ走査しながら、各1画素が次の条件をすべて満たすか調べる",
    "② 条件：(1) 境界点（4近傍に0がある）、(2) 端点でない（近傍の1が2つ以上）、(3) 孤立点でない、(4) 消しても連結数が1のまま（8連結）、(5) この走査で消した画素を考慮しても幅2の線が消えない",
    "③ 条件を満たす画素は『削除予定（−1）』として印を付け、走査の途中の判定にもすぐ反映する（逐次型）",
    "④ 1回の走査が終わったら −1 を 0 にし、削除が1つもなくなるまで繰り返す",
    f"⑤ 出力：8連結の幅1の線（赤）。この例では {TH.sum()} → {hd.sum()} 画素。逐次型なので走査方向による偏りに注意",
], example="T字の幅3の縦棒：1回目の走査で左右の列が削除予定になり、真ん中の列は条件(4)で残る。2回目の走査で削除がなくなり終了",
    figures=[gfig(panels([dict(a=TH, title='入力（幅3）', mode='bin'), dict(a=TH, title='ヒルディッチ法', colors=ovh)], W=310, arrows=['']), '赤＝細線化の結果、薄青＝削られた画素')],
    code=r'''import numpy as np

img = np.zeros((9, 13), int); img[1:4, 1:11] = 1; img[4:8, 5:8] = 1   # T字
def nb(p, y, x):   # x1=右から反時計回り x1..x8
    return [p[y,x+1], p[y-1,x+1], p[y-1,x], p[y-1,x-1], p[y,x-1], p[y+1,x-1], p[y+1,x], p[y+1,x+1]]
def nc8(n):        # 8連結の連結数
    b = [1 - v for v in n] + [1 - n[0]]
    return sum(b[k] - b[k] * b[k + 1] * b[k + 2] for k in (0, 2, 4, 6))
p = np.pad(img, 1)
while True:
    cnt = 0
    for y, x in zip(*np.nonzero(p == 1)):
        n = nb(p, y, x); bn = [1 if v else 0 for v in n]      # 削除予定(-1)も1扱い
        if all(n[k] for k in (0, 2, 4, 6)): continue          # (1) 境界点でない
        if sum(abs(v) for v in n) < 2: continue               # (2) 端点
        if sum(v == 1 for v in n) < 1: continue               # (3) 孤立点
        if nc8(bn) != 1: continue                             # (4) 連結性
        if any(n[k] == -1 and nc8(bn[:k] + [0] + bn[k + 1:]) != 1 for k in range(8)): continue  # (5)
        p[y, x] = -1; cnt += 1                                # 削除予定に印
    p[p == -1] = 0
    if cnt == 0: break
print(p[1:-1, 1:-1])
'''))

first_del = zhist[0]
sub1 = [[('#e4572e' if (r, c) in first_del else '#222' if TH[r, c] else '#fff') for c in range(13)] for r in range(9)]
after1 = TH.copy()
for y, x in first_del:
    after1[y, x] = 0
sub2 = [[('#3a86ff' if (r, c) in zhist[1] else '#222' if after1[r, c] else '#fff') for c in range(13)] for r in range(9)]
E.append(dict(id='binary-zhang-suen', steps=[
    "① 注目画素 P1 の8近傍を上 P2 から時計回りに P2〜P9 とし、B = 近傍の1の数、A = P2→P3→…→P9→P2 の順で 0→1 に変わる回数",
    "② 第1サブイテレーション：2 ≤ B ≤ 6、A = 1、P2·P4·P6 = 0、P4·P6·P8 = 0 を満たす画素を全画素同時に判定して削除（右下側の境界と左上の角）",
    "③ 第2サブイテレーション：後半を P2·P4·P8 = 0、P2·P6·P8 = 0 に変えて同様に削除（左上側の境界と右下の角）",
    f"④ 例：T字では第1サブで {len(zhist[0])} 画素（赤）、第2サブで {len(zhist[1])} 画素（青）が消える。これを削除がなくなるまで繰り返す",
    f"⑤ 出力：幅1の線（{zs.sum()} 画素）。並列型なので走査順に依存しない。斜め線で2画素幅が残ることがある",
], example="T字上辺の画素 (1,4)：B=5, A=1, P2=0 なので P2·P4·P6=0, P4·P6·P8: P4=1,P6=1,P8=1 → 1 ≠ 0 → 第1では消えない、第2で消える",
    figures=[gfig(panels([dict(a=TH, title='第1サブで削除（赤）', colors=sub1), dict(a=after1, title='第2サブで削除（青）', colors=sub2)], W=320, arrows=['']), '1回目の繰り返しで消える画素：右下側が先、左上側が後'),
             gfig(panels([dict(a=TH, title='入力', mode='bin'), dict(a=zs, title='最終結果', mode='bin')], W=300, arrows=['繰返し']), 'Zhang–Suen の最終結果')],
    code=r'''import numpy as np

img = np.zeros((9, 13), int); img[1:4, 1:11] = 1; img[4:8, 5:8] = 1   # 幅3のT字
p = np.pad(img, 1)
def P(p, y, x):     # P2..P9（上から時計回り）
    return [p[y-1,x], p[y-1,x+1], p[y,x+1], p[y+1,x+1], p[y+1,x], p[y+1,x-1], p[y,x-1], p[y-1,x-1]]
it = 0
while True:
    removed = 0
    for step in (0, 1):
        dels = []
        for y, x in zip(*np.nonzero(p)):
            n = P(p, y, x); p2, p3, p4, p5, p6, p7, p8, p9 = n
            B = sum(n)
            A = sum(n[i] == 0 and n[(i + 1) % 8] == 1 for i in range(8))
            c = (p2*p4*p6 == 0 and p4*p6*p8 == 0) if step == 0 else (p2*p4*p8 == 0 and p2*p6*p8 == 0)
            if 2 <= B <= 6 and A == 1 and c: dels.append((y, x))
        for y, x in dels: p[y, x] = 0               # 判定後にまとめて削除（並列型）
        print(f'iter{it} sub{step + 1}: {len(dels)} 画素削除'); removed += len(dels)
    it += 1
    if removed == 0: break
print(p[1:-1, 1:-1])
'''))

cn_ex = {
    '端点': [[0, 0, 0], [0, 1, 1], [0, 0, 0]],
    '境界点': [[1, 1, 1], [1, 1, 1], [0, 0, 0]],
    '内部点': [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    '連結点': [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
    '分岐点': [[1, 0, 1], [0, 1, 0], [0, 1, 0]],
}
cn_vals = {}
for k_, m in cn_ex.items():
    m = np.array(m)
    cn_vals[k_] = nc8(nbs(m, 1, 1))
E.append(dict(id='binary-connectivity-number', steps=[
    "① 注目画素の8近傍を、右 x1 から反時計回りに x1〜x8 とする（x9 = x1）。8連結では x̄ = 1 − x（反転）を使う",
    "② N8 = Σ_{k=1,3,5,7} ( x̄k − x̄k·x̄k+1·x̄k+2 )。4連結は反転しない N4 = Σ (xk − xk·xk+1·xk+2)",
    "③ 例（縦線の途中の点）：上 x3 と下 x7 だけが1 → x̄ は x3, x7 だけ0。k=1: 1−1·0·0=1, k=3: 0−0=0, k=5: 1−0=1, k=7: 0 → N8 = 2",
    "④ 意味：その画素を消すと周囲がいくつに分かれるか。0=孤立点か内部点、1=端点・境界点（消しても連結性は変わらない）、2=連結点、3=分岐点、4=交差点",
    "⑤ 細線化では『連結数が1の境界画素だけを消す』ことで、図形がちぎれないようにする",
], example="連結数：" + '、'.join(f"{k}={v}" for k, v in cn_vals.items()),
    figures=[gfig(panels([dict(a=np.array(m), title=f"{k} N8={cn_vals[k]}", colors=[[('#e4572e' if (r == 1 and c == 1) else '#222' if m[r][c] else '#fff') for c in range(3)] for r in range(3)]) for k, m in cn_ex.items()], W=330, cs=18, gap=10, title_size=9), '中央（赤）の画素の8連結の連結数')],
    code=r'''import numpy as np

def nb(m):        # x1=右から反時計回り x1..x8（中央が注目画素の3x3）
    return [m[1,2], m[0,2], m[0,1], m[0,0], m[1,0], m[2,0], m[2,1], m[2,2]]
def N8(m):
    x = [1 - v for v in nb(m)]; x.append(x[0])                  # 反転して x9=x1
    return sum(x[k] - x[k] * x[k + 1] * x[(k + 2) % 8 if k < 6 else 8] for k in (0, 2, 4, 6))
def N4(m):
    x = nb(m) + [nb(m)[0]]
    return sum(x[k] - x[k] * x[k + 1] * x[(k + 2) % 8 if k < 6 else 8] for k in (0, 2, 4, 6))
ex = {'端点': [[0,0,0],[0,1,1],[0,0,0]], '境界点': [[1,1,1],[1,1,1],[0,0,0]],
      '内部点': [[1,1,1],[1,1,1],[1,1,1]], '連結点': [[0,1,0],[0,1,0],[0,1,0]],
      '分岐点': [[1,0,1],[0,1,0],[0,1,0]]}
for k, m in ex.items():
    m = np.array(m); print(k, 'N8 =', N8(m), ' N4 =', N4(m))
'''))

# 骨格（モルフォロジー骨格）
SK = A('''
00000000000
01111111110
01111111110
01111111110
01111111110
01111111110
00000000000''')
skel = np.zeros_like(SK)
er = SK.copy(); k_ = 0
while er.any():
    skel |= er - opn(er)
    er = ero(er); k_ += 1
E.append(dict(id='binary-skeleton', steps=[
    "① 図形の形を、内部を通る線で要約したもの。定義はいくつかある（中心軸、距離変換の尾根、モルフォロジー骨格、細線化結果）",
    "② モルフォロジー骨格：k 回収縮した図形 A⊖kB から、そのオープニングを引いた差 Sk = (A⊖kB) − (A⊖kB)∘B を各 k で集めて和をとる",
    f"③ 例：5×9 の長方形 → 収縮を {k_} 回でき、各段階の差を集めると中央の横線＋四隅への斜め線（赤）になる",
    "④ 各 Sk の画素を k 回膨張して和をとると元の図形を完全に復元できる（細線化結果は復元できない）",
    "⑤ 境界の小さな凹凸で余計な枝（ひげ）が出やすいので、短い枝を刈る（プルーニング）",
], example=f"長方形の骨格画素数 {skel.sum()}。中心軸（最大内接円の中心）と同じく、長方形では中央線＋四隅への斜線",
    figures=[gfig(panels([dict(a=SK, title='入力（長方形）', mode='bin'), dict(a=SK, title='モルフォロジー骨格', colors=[[('#e4572e' if skel[r, c] else '#c9d6ff' if SK[r, c] else '#fff') for c in range(11)] for r in range(7)])], W=310, arrows=['']), '赤＝骨格（中央線と四隅への斜線）')],
    code=r'''import numpy as np
import cv2

img = np.zeros((7, 11), np.uint8); img[1:6, 1:10] = 1      # 長方形
k = np.ones((3, 3), np.uint8)
skel = np.zeros_like(img); parts = []
er = img.copy()
while er.any():
    opened = cv2.morphologyEx(er, cv2.MORPH_OPEN, k)
    S = er - opened                                        # S_k = (A⊖kB) - (A⊖kB)∘B
    skel |= S; parts.append(S)
    er = cv2.erode(er, k, borderValue=0)
print(skel)
# 復元：S_k を k 回膨張して和をとると元に戻る
rec = np.zeros_like(img)
for i, S in enumerate(parts):
    rec |= cv2.dilate(S, k, iterations=i) if i else S
print(np.array_equal(rec, img))
'''))

Dm = dist(SK, 'chess')
pd = np.pad(Dm, 1)
locmax = np.zeros_like(Dm)
for y in range(Dm.shape[0]):
    for x in range(Dm.shape[1]):
        if Dm[y, x] and Dm[y, x] >= pd[y:y + 3, x:x + 3].max():
            locmax[y, x] = 1
E.append(dict(id='binary-mat', steps=[
    "① 図形に内接する円（ディジタルではチェス盤距離なら正方形）のうち、他のどの内接円にも含まれない極大なものを考える",
    "② その中心の集まりが中心軸、中心＋半径の組が中心軸変換。境界から一斉に火をつけたとき火の前線がぶつかって消える点（草原火災モデル）",
    "③ ディジタル画像では距離変換を計算し、近傍のどの値以上でもある『局所最大』の画素を取り出す",
    f"④ 例：5×9 の長方形のチェス盤距離 → 中央の行（値3）が局所最大 → 中心軸。値（半径）付きで {locmax.sum()} 画素",
    "⑤ 各中心軸画素を中心に『半径＝距離値』の正方形（円）を描いて和をとると元の図形を復元できる",
], example="中央の行の画素 (3,5) の距離値は3 → 中心 (3,5)・半径3（7×7 の正方形から外にはみ出る部分を除く）。長方形の連続的な中心軸は中央線と四隅への斜線",
    figures=[gfig(panels([dict(a=Dm, title='距離変換（d8）', colors=[[(f"rgb({255 - v * 45},{255 - v * 30},255)" if v else '#fff') for v in r] for r in Dm], values=[[str(v) if v else '' for v in r] for r in Dm]), dict(a=Dm, title='局所最大＝中心軸', colors=[[('#e4572e' if locmax[r, c] else '#e7efff' if SK[r, c] else '#fff') for c in range(11)] for r in range(7)], values=[[str(Dm[r, c]) if locmax[r, c] else '' for c in range(11)] for r in range(7)])], W=320, arrows=['']), '赤＝距離値の局所最大（中心軸）、数字＝内接円の半径')],
    code=r'''import numpy as np
import cv2

img = np.zeros((7, 11), np.uint8); img[1:6, 1:10] = 1          # 長方形
D = cv2.distanceTransform(img, cv2.DIST_C, 3).astype(int)       # チェス盤距離
mx = cv2.dilate(D.astype(np.uint8), np.ones((3, 3), np.uint8))  # 3x3 の最大値
axis = (D > 0) & (D >= mx)                                       # 局所最大 = 中心軸
print(D); print(axis.astype(int))
# 復元：各中心軸画素に半径 D の正方形を置く（d8 の円 = 正方形）
rec = np.zeros_like(img)
for y, x in np.argwhere(axis):
    r = D[y, x] - 1
    rec[y - r:y + r + 1, x - r:x + r + 1] = 1
print(np.array_equal(rec, img))
'''))

# ---------------- 特徴量 ----------------
SHP = A('''
0000000000
0011100000
0111110000
0111111100
0011111110
0001111100
0000110000
0000000000''')
mo = moments(SHP)
E.append(dict(id='binary-area', steps=[
    "① 入力：2値画像（またはラベル画像の1つの成分）",
    "② 面積 S ＝ 図形に属する（値1の）画素の数を数える。0次モーメント m00 と同じ",
    f"③ 例：この図形は各行 3, 5, 7, 7, 5, 2 個 → S = {int(SHP.sum())} 画素",
    "④ 実寸に直すには 1画素あたりの面積（例 0.1 mm × 0.1 mm）を掛ける",
    "⑤ 回転・平行移動で（ほぼ）不変。ノイズ除去（小さい成分を捨てる）や大きさによる分類に使う",
], example=f"S = 3+5+7+7+5+2 = {int(SHP.sum())}。1画素 0.5 mm 角なら {int(SHP.sum()) * 0.25} mm²。cv2.countNonZero でも同じ",
    figures=[gfig(panels([dict(a=SHP, title=f'面積 S = {int(SHP.sum())}', mode='bin', values=[[str(int(SHP[r, :c + 1].sum())) if SHP[r, c] else '' for c in range(10)] for r in range(8)])], W=260, cs=22), '各画素の数字＝その行で左から数えた個数（行ごとの合計の和が面積）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,0,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0],
                [0,1,1,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,1,0],[0,0,0,1,1,1,1,1,0,0],
                [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
print('行ごと', img.sum(axis=1), ' 面積', img.sum())
print(cv2.countNonZero(img), cv2.moments(img, binaryImage=True)['m00'])
cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
print(cv2.contourArea(cs[0]))     # 輪郭（画素中心を結んだ多角形）の面積は画素数より小さい
'''))

pts_s, codes_s = trace(SHP)
ev_s, od_s, pl_s = perim_chain(codes_s)
bp_s = int(border_pixels(SHP).sum())
cr_s = crack_len(SHP)
E.append(dict(id='binary-perimeter', steps=[
    "① 定義A：境界画素（4近傍に背景がある図形画素）の数を数える",
    "② 定義B：境界追跡のチェーンコードで、縦横の移動（偶数コード）を1、斜め（奇数コード）を √2 として合計",
    "③ 定義C：図形と背景の間の画素の辺（クラック）の本数を数える",
    f"④ 例（同じ図形）：A = {bp_s}、B = {ev_s} + {od_s}√2 = {f(pl_s, 2)}、C = {cr_s}。定義で値が大きく違う",
    "⑤ 斜めの境界が多いほど差が大きい。円形度などに使うときは定義をそろえる（OpenCV の arcLength は B と同じ考え方）",
], example=f"チェーンコード {''.join(map(str, codes_s))}：偶数 {ev_s} 個、奇数 {od_s} 個 → {ev_s} + {od_s}×1.414 = {f(pl_s, 2)}",
    figures=[gfig(panels([dict(a=SHP, title='境界画素（A）', colors=[[('#ffb703' if border_pixels(SHP)[r, c] else '#e7efff' if SHP[r, c] else '#fff') for c in range(10)] for r in range(8)])], W=240, cs=20), '黄＝境界画素'),
             {"type": "table", "head": ["定義", "数え方", "値"], "rows": [["A 境界画素数", "4近傍に0がある画素", str(bp_s)], ["B チェーンコード", f"偶数{ev_s}×1 + 奇数{od_s}×√2", f(pl_s, 2)], ["C クラック長", "図形と背景の境の辺", str(cr_s)]]}],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,0,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0],
                [0,1,1,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,1,0],[0,0,0,1,1,1,1,1,0,0],
                [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
cross = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
border = img - cv2.erode(img, cross, borderValue=0)     # A: 4近傍に0がある画素
print('A 境界画素数', border.sum())
cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
d = np.abs(np.diff(np.r_[cs[0][:, 0], cs[0][:1, 0]], axis=0)).sum(1)   # 1=縦横, 2=斜め
print('B チェーンコード長', (d == 1).sum() + (d == 2).sum() * np.sqrt(2), cv2.arcLength(cs[0], True))
p = np.pad(img, 1).astype(int)
print('C クラック長', np.abs(np.diff(p, axis=0)).sum() + np.abs(np.diff(p, axis=1)).sum())
'''))

# 円形度
def disk(r, n):
    yy, xx = np.mgrid[0:n, 0:n]; c = (n - 1) / 2
    return ((xx - c) ** 2 + (yy - c) ** 2 <= r * r).astype(int)
circ_shapes = {'円': disk(5.2, 13), '正方形': np.pad(np.ones((9, 9), int), 2), '細長い長方形': np.pad(np.ones((3, 11), int), (5, 1))}
crows = []
for k, s in circ_shapes.items():
    pts_, cds = trace(s)
    _, _, L_ = perim_chain(cds)
    S_ = s.sum()
    crows.append([k, str(int(S_)), f(L_, 1), f(4 * math.pi * S_ / L_ ** 2, 3)])
E.append(dict(id='binary-circularity', steps=[
    "① 面積 S と周囲長 L を求める（L はチェーンコード長など、定義をそろえる）",
    "② 円形度 e = 4πS / L²。真円なら S = πr², L = 2πr より e = 1（最大）",
    "③ 連続図形の理論値：正方形 π/4 = 0.785、正三角形 0.605、細長いほど・ギザギザなほど 0 に近づく",
    f"④ ディジタル画像の例：円 e = {crows[0][3]}、正方形 e = {crows[1][3]}、細長い長方形 e = {crows[2][3]}",
    "⑤ 大きさ・向きによらない（無次元）ので、形の分類（丸い錠剤か、欠けているか）に使える。小さい図形では周囲長の誤差で1を超えることも",
], example=f"正方形：S={crows[1][1]}, L={crows[1][2]}（画素中心を結んだ周囲）→ 4π·{crows[1][1]}/{crows[1][2]}² = {crows[1][3]}（理論値 0.785 に近い）",
    figures=[gfig(panels([dict(a=s, title=f"{k} e={r[3]}", mode='bin') for (k, s), r in zip(circ_shapes.items(), crows)], W=320, gap=14), '形と円形度'),
             {"type": "table", "head": ["図形", "面積 S", "周囲長 L", "e = 4πS/L²"], "rows": crows}],
    code=r'''import numpy as np
import cv2

def circularity(img):
    cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    S = img.sum()                          # 面積 = 画素数
    L = cv2.arcLength(cs[0], True)         # 周囲長（縦横1・斜め√2）
    return S, round(L, 1), round(4 * np.pi * S / L ** 2, 3)
yy, xx = np.mgrid[0:13, 0:13]
disk = (((xx - 6) ** 2 + (yy - 6) ** 2) <= 5.2 ** 2).astype(np.uint8)
square = np.pad(np.ones((9, 9), np.uint8), 2)
bar = np.pad(np.ones((3, 11), np.uint8), ((5, 5), (1, 1)))
for name, im in [('円', disk), ('正方形', square), ('細長', bar)]:
    print(name, circularity(im))
'''))

mrows = [["m00（面積）", f(mo['m00'])], ["m10 = Σx", f(mo['m10'])], ["m01 = Σy", f(mo['m01'])], ["重心 (m10/m00, m01/m00)", f"({f(mo['xg'], 3)}, {f(mo['yg'], 3)})"], ["μ20 = Σ(x−xg)²", f(mo['mu20'], 2)], ["μ02 = Σ(y−yg)²", f(mo['mu02'], 2)], ["μ11 = Σ(x−xg)(y−yg)", f(mo['mu11'], 2)]]
E.append(dict(id='binary-moment', steps=[
    "① 図形の各画素の座標 (x, y)（x=列, y=行）を使い、m_pq = Σ x^p · y^q を計算（2値画像では1の画素について和をとる）",
    f"② 0次：m00 = 画素数 = 面積 = {f(mo['m00'])}",
    f"③ 1次：m10 = Σx = {f(mo['m10'])}、m01 = Σy = {f(mo['m01'])} → 重心 = (m10/m00, m01/m00) = ({f(mo['xg'], 2)}, {f(mo['yg'], 2)})",
    f"④ 2次の中心モーメント（重心からの座標で計算）：μ20 = {f(mo['mu20'], 1)}、μ02 = {f(mo['mu02'], 1)}、μ11 = {f(mo['mu11'], 1)} → 広がり方と傾き",
    "⑤ 中心モーメントは平行移動に不変。正規化して組み合わせると拡大・回転にも不変な Hu モーメントになる",
], example=f"μ20 > μ02 なので横方向に広がった図形。μ11 = {f(mo['mu11'], 1)} > 0 は（y 下向きの画像座標で）右下がりの傾き",
    figures=[gfig(panels([dict(a=SHP, title='図形（x=列, y=行）', mode='bin')], W=240, cs=20), '同じ図形（面積の項と共通）'),
             {"type": "table", "head": ["モーメント", "値"], "rows": mrows}],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,0,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0],
                [0,1,1,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,1,0],[0,0,0,1,1,1,1,1,0,0],
                [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
ys, xs = np.nonzero(img)                       # 1の画素の座標（x=列, y=行）
m = lambda p, q: (xs ** p * ys ** q).sum()
m00, m10, m01 = m(0, 0), m(1, 0), m(0, 1)
xg, yg = m10 / m00, m01 / m00                  # 重心
mu = lambda p, q: ((xs - xg) ** p * (ys - yg) ** q).sum()
print(m00, m10, m01, round(xg, 3), round(yg, 3))
print(round(mu(2, 0), 2), round(mu(0, 2), 2), round(mu(1, 1), 2))
M = cv2.moments(img, binaryImage=True)         # OpenCV
print(M['m00'], M['m10'], M['m01'], round(M['mu20'], 2), round(M['mu02'], 2), round(M['mu11'], 2))
'''))


def cent_fig():
    W = 260
    cs = 22
    ox, oy = 20, 20
    b = [grid(SHP, ox, oy, cs, colors=[[('#c9d6ff' if SHP[r, c] else '#fff') for c in range(10)] for r in range(8)])]
    for c in range(10):
        b.append(T(ox + c * cs + cs / 2, oy - 6, str(c), 9, fill='#777'))
    for r in range(8):
        b.append(T(ox - 6, oy + r * cs + cs / 2 + 3, str(r), 9, 'end', fill='#777'))
    gx, gy = ox + (mo['xg'] + 0.5) * cs, oy + (mo['yg'] + 0.5) * cs
    b.append(L(gx, oy, gx, oy + 8 * cs, RED, 1, '3 2') + L(ox, gy, ox + 10 * cs, gy, RED, 1, '3 2'))
    b.append(C(gx, gy, 5, RED))
    b.append(T(gx + 8, gy - 6, f"({f(mo['xg'], 2)}, {f(mo['yg'], 2)})", 10, 'start', fill=RED, weight='bold'))
    return svg(W, oy + 8 * cs + 6, ''.join(b))


E.append(dict(id='binary-centroid', steps=[
    "① 図形の全画素の x 座標の平均と y 座標の平均を求める",
    f"② xg = Σx / S = m10 / m00 = {f(mo['m10'])} / {f(mo['m00'])} = {f(mo['xg'], 3)}",
    f"③ yg = Σy / S = m01 / m00 = {f(mo['m01'])} / {f(mo['m00'])} = {f(mo['yg'], 3)}",
    "④ 重心は画素の格子上にあるとは限らない（小数になる＝サブピクセル精度の位置）",
    "⑤ 用途：物体の代表位置（ロボットのつかみ位置、追跡の座標）、中心モーメントの基準点",
], example=f"列ごとの画素数 {list(map(int, SHP.sum(axis=0)))} から Σx = {f(mo['m10'])}。重心 ({f(mo['xg'], 2)}, {f(mo['yg'], 2)})（赤）",
    figures=[gfig(cent_fig(), '赤●＝重心（画素中心を整数座標とした）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0],[0,0,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,0,0,0,0],
                [0,1,1,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,1,0],[0,0,0,1,1,1,1,1,0,0],
                [0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]], np.uint8)
ys, xs = np.nonzero(img)
print('重心', xs.mean().round(3), ys.mean().round(3))      # Σx/S, Σy/S
# 列ごと・行ごとの画素数（射影）からも計算できる
cx = (img.sum(axis=0) * np.arange(img.shape[1])).sum() / img.sum()
cy = (img.sum(axis=1) * np.arange(img.shape[0])).sum() / img.sum()
print(round(cx, 3), round(cy, 3))
M = cv2.moments(img, binaryImage=True)
print(round(M['m10'] / M['m00'], 3), round(M['m01'] / M['m00'], 3))
'''))

# 主軸
PA = np.zeros((9, 12), int)
for i_ in range(10):
    y = 1 + int(round(i_ * 0.6)); x = 1 + i_
    PA[y:y + 2, x] = 1
PA[3, 4] = 1; PA[5, 8] = 1
mp = moments(PA)
thp = 0.5 * math.atan2(2 * mp['mu11'], mp['mu20'] - mp['mu02'])


def pa_fig():
    W = 300
    cs = 22
    ox, oy = 14, 12
    b = [grid(PA, ox, oy, cs, colors=[[('#c9d6ff' if PA[r, c] else '#fff') for c in range(12)] for r in range(9)])]
    gx, gy = ox + (mp['xg'] + 0.5) * cs, oy + (mp['yg'] + 0.5) * cs
    Lh = 7 * cs
    b.append(L(gx - Lh * math.cos(thp), gy - Lh * math.sin(thp), gx + Lh * math.cos(thp), gy + Lh * math.sin(thp), RED, 2))
    b.append(L(gx - 2 * cs * math.cos(thp + math.pi / 2), gy - 2 * cs * math.sin(thp + math.pi / 2), gx + 2 * cs * math.cos(thp + math.pi / 2), gy + 2 * cs * math.sin(thp + math.pi / 2), BLUE, 1.2, '4 2'))
    b.append(C(gx, gy, 4, RED))
    b.append(T(ox + 6 * cs, oy + 9 * cs + 14, f"θ = {f(math.degrees(thp), 1)}°（x軸から、画像座標で下向きに）", 10, fill=RED))
    return svg(W, oy + 9 * cs + 22, ''.join(b))


E.append(dict(id='binary-principal-axis', steps=[
    "① 重心 (xg, yg) を求め、2次の中心モーメント μ20, μ02, μ11 を計算",
    f"② 例：μ20 = {f(mp['mu20'], 1)}, μ02 = {f(mp['mu02'], 1)}, μ11 = {f(mp['mu11'], 1)}",
    f"③ 主軸の角度 θ = ½·atan2(2μ11, μ20 − μ02) = ½·atan2({f(2 * mp['mu11'], 1)}, {f(mp['mu20'] - mp['mu02'], 1)}) = {f(math.degrees(thp), 1)}°",
    "④ 主軸＝重心を通り、軸まわりの慣性モーメント（軸からの距離の2乗和）が最小の直線＝図形が一番長く伸びている方向（赤線）",
    "⑤ 画像座標は y が下向きなので θ > 0 は画面上で右下がり。この角度だけ逆回転すれば向きをそろえられる（回転の正規化）",
], example=f"慣性楕円の長軸・短軸の2乗に比例する量 λ = (μ20+μ02 ± √((μ20−μ02)² + 4μ11²))/2 = {f((mp['mu20'] + mp['mu02'] + math.sqrt((mp['mu20'] - mp['mu02']) ** 2 + 4 * mp['mu11'] ** 2)) / 2, 1)}, {f((mp['mu20'] + mp['mu02'] - math.sqrt((mp['mu20'] - mp['mu02']) ** 2 + 4 * mp['mu11'] ** 2)) / 2, 1)}",
    figures=[gfig(pa_fig(), '赤＝主軸（慣性最小の方向）、青破線＝それに直交する軸')],
    code=r'''import numpy as np
import cv2

img = np.zeros((9, 12), np.uint8)
for i in range(10):                         # 右下がりの細長い図形
    y = 1 + int(round(i * 0.6)); img[y:y + 2, 1 + i] = 1
img[3, 4] = 1; img[5, 8] = 1
ys, xs = np.nonzero(img)
xg, yg = xs.mean(), ys.mean()
mu20 = ((xs - xg) ** 2).sum(); mu02 = ((ys - yg) ** 2).sum(); mu11 = ((xs - xg) * (ys - yg)).sum()
theta = 0.5 * np.arctan2(2 * mu11, mu20 - mu02)
print(round(mu20, 1), round(mu02, 1), round(mu11, 1), round(np.rad2deg(theta), 1))
# 共分散行列の固有ベクトルでも同じ方向
w, v = np.linalg.eigh(np.cov(np.vstack([xs, ys])))
print(round(np.rad2deg(np.arctan2(v[1, 1], v[0, 1])), 1))
M = cv2.moments(img, True)
print(round(np.rad2deg(0.5 * np.arctan2(2 * M['mu11'], M['mu20'] - M['mu02'])), 1))
'''))


def bbox_fig():
    W = 300
    cs = 22
    ox, oy = 14, 12
    b = [grid(PA, ox, oy, cs, colors=[[('#c9d6ff' if PA[r, c] else '#fff') for c in range(12)] for r in range(9)])]
    ys_, xs_ = np.nonzero(PA)
    x0, x1, y0, y1 = xs_.min(), xs_.max(), ys_.min(), ys_.max()
    b.append(R(ox + x0 * cs, oy + y0 * cs, (x1 - x0 + 1) * cs, (y1 - y0 + 1) * cs, 'none', RED, 2))
    rect = cv2.minAreaRect(np.column_stack([xs_, ys_]).astype(np.float32))
    box = cv2.boxPoints(rect)
    b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in box], 'none', GREEN, 2, dash='5 3'))
    b.append(T(ox + 6 * cs, oy + 9 * cs + 14, f"赤：外接矩形 {x1 - x0 + 1}×{y1 - y0 + 1}　緑：最小外接矩形", 10))
    return svg(W, oy + 9 * cs + 22, ''.join(b)), (x0, y0, x1 - x0 + 1, y1 - y0 + 1), rect


bbsvg, bb, mrect = bbox_fig()
E.append(dict(id='binary-bbox', steps=[
    "① 図形の画素の x 座標・y 座標の最小値と最大値を求める",
    f"② 例：x = {bb[0]}〜{bb[0] + bb[2] - 1}、y = {bb[1]}〜{bb[1] + bb[3] - 1}",
    f"③ 外接矩形（軸に平行）＝左上 ({bb[0]}, {bb[1]})、幅 {bb[2]}、高さ {bb[3]}（赤枠）",
    f"④ 縦横比 = {bb[2]}/{bb[3]} = {f(bb[2] / bb[3], 2)}、充填率 = 面積 / 矩形面積 = {PA.sum()}/{bb[2] * bb[3]} = {f(PA.sum() / (bb[2] * bb[3]), 2)}",
    "⑤ 傾いた図形には回転を許した最小外接矩形（緑）の方がぴったり合う。物体の切り出し・大きさのおおまかな把握に使う",
], example=f"最小外接矩形：中心 ({f(mrect[0][0], 1)}, {f(mrect[0][1], 1)})、大きさ {f(mrect[1][0], 1)}×{f(mrect[1][1], 1)}、角度 {f(mrect[2], 1)}°（cv2.minAreaRect、画素中心を結んだ大きさ）",
    figures=[gfig(bbsvg, '外接矩形（赤）と回転を許した最小外接矩形（緑）')],
    code=r'''import numpy as np
import cv2

img = np.zeros((9, 12), np.uint8)
for i in range(10):
    y = 1 + int(round(i * 0.6)); img[y:y + 2, 1 + i] = 1
img[3, 4] = 1; img[5, 8] = 1
ys, xs = np.nonzero(img)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
w, h = x1 - x0 + 1, y1 - y0 + 1
print('外接矩形', (x0, y0, w, h), ' 縦横比', round(w / h, 2), ' 充填率', round(img.sum() / (w * h), 2))
print(cv2.boundingRect(img))                     # (x, y, w, h)
pts = np.column_stack([xs, ys]).astype(np.float32)
print(cv2.minAreaRect(pts))                      # ((中心), (幅, 高さ), 角度)
'''))

CVX = A('''
000000000000
011100001110
011110011110
001111111100
000111111000
000111111000
001111111100
000000000000''')
ysx, xsx = np.nonzero(CVX)
hull = cv2.convexHull(np.column_stack([xsx, ysx]).astype(np.int32))[:, 0]
hull_fill = np.zeros_like(CVX, np.uint8)
corners = []
for y, x in zip(ysx, xsx):
    corners += [(x - 0.5, y - 0.5), (x + 0.5, y - 0.5), (x - 0.5, y + 0.5), (x + 0.5, y + 0.5)]
hull_px = cv2.convexHull(np.array(corners, np.float32))[:, 0]
yy_, xx_ = np.mgrid[0:CVX.shape[0], 0:CVX.shape[1]]
inside = np.array([[cv2.pointPolygonTest(hull_px, (float(x), float(y)), False) >= 0 for x in range(CVX.shape[1])] for y in range(CVX.shape[0])]).astype(int)
deficit = inside - CVX


def cvx_fig():
    W = 300
    cs = 22
    ox, oy = 18, 10
    cols = [[('#222' if CVX[r, c] else '#ffd166' if deficit[r, c] else '#fff') for c in range(12)] for r in range(8)]
    b = [grid(CVX, ox, oy, cs, colors=cols)]
    b.append(P([(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs) for x, y in hull_px], 'none', RED, 2))
    b.append(T(ox + 6 * cs, oy + 8 * cs + 14, f"赤：凸包　黄：凹み（凸包−図形）{deficit.sum()} 画素", 10))
    return svg(W, oy + 8 * cs + 22, ''.join(b))


E.append(dict(id='binary-convex-hull', steps=[
    "① 図形を含む最小の凸多角形（輪ゴムを図形の周りにかけた形）を求める",
    "② 図形の画素の角の点（または輪郭点）に Graham スキャンや Andrew の単調鎖法などのアルゴリズムを適用",
    f"③ 例：上が V 字に凹んだ図形 → 凸包（赤）は凹みをまたいで直線で結ぶ。凸包内の画素 {inside.sum()}、図形 {CVX.sum()}",
    f"④ 凸包 − 図形 ＝ 凹み（黄、{deficit.sum()} 画素）。凸性（solidity）= 図形面積 / 凸包面積 = {f(CVX.sum() / inside.sum(), 2)}",
    "⑤ 用途：手の指の数（指の間の凹み＝凸欠陥）、部品の欠け・割れの検出、形状の特徴量",
], example=f"凸包の頂点数 {len(hull_px)}。凸性 1.0 なら凸図形（凹みなし）。cv2.convexHull と cv2.convexityDefects で凹みの深さも分かる",
    figures=[gfig(cvx_fig(), '凸包（赤）と凹み部分（黄）')],
    code=r'''import numpy as np
import cv2

img = np.array([[0,0,0,0,0,0,0,0,0,0,0,0],[0,1,1,1,0,0,0,0,1,1,1,0],[0,1,1,1,1,0,0,1,1,1,1,0],
                [0,0,1,1,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,1,1,0,0,0],
                [0,0,1,1,1,1,1,1,1,1,0,0],[0,0,0,0,0,0,0,0,0,0,0,0]], np.uint8)
ys, xs = np.nonzero(img)
pts = np.column_stack([xs, ys])
def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
P = sorted(map(tuple, pts)); lower, upper = [], []
for p in P:                                   # Andrew の単調鎖法
    while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0: lower.pop()
    lower.append(p)
for p in reversed(P):
    while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0: upper.pop()
    upper.append(p)
hull = lower[:-1] + upper[:-1]
print('凸包の頂点', hull)
h2 = cv2.convexHull(pts.astype(np.int32))
print(len(h2), round(cv2.contourArea(h2), 1))  # 画素中心を結んだ凸包の面積
mask = np.zeros_like(img); cv2.fillConvexPoly(mask, h2, 1)
print('凹みの画素数', int((mask - img).sum()))
'''))

LA_ = A('''
00000000
01111000
01111000
01111000
01111000
00000000
00000000''')
LB_ = np.roll(np.roll(LA_, 2, axis=1), 1, axis=0)
ops_ = [('A AND B', LA_ & LB_), ('A OR B', LA_ | LB_), ('A XOR B', LA_ ^ LB_), ('A − B', LA_ & (1 - LB_))]
E.append(dict(id='binary-logic-op', steps=[
    "① 同じ大きさの2値画像 A, B を画素ごとに論理演算する",
    f"② AND（積集合 A∩B）：両方1の画素だけ1 → 重なり部分（{(LA_ & LB_).sum()} 画素）",
    f"③ OR（和集合 A∪B）：どちらかが1 → 合わせた部分（{(LA_ | LB_).sum()} 画素）",
    f"④ XOR（排他的論理和）：片方だけ1 → 違う部分（{(LA_ ^ LB_).sum()} 画素）。A − B = A AND (NOT B)（{(LA_ & (1 - LB_)).sum()} 画素）",
    "⑤ 用途：マスク処理（AND）、検出結果の統合（OR）、2枚の差の検出・検査（XOR）、境界抽出（A − 収縮A）",
], example=f"A={LA_.sum()}画素、B={LB_.sum()}画素：|A∪B| = |A| + |B| − |A∩B| = {LA_.sum()}+{LB_.sum()}−{(LA_ & LB_).sum()} = {(LA_ | LB_).sum()}",
    figures=[gfig(panels([dict(a=LA_, title='A', colors=[[('#3a86ff' if v else '#fff') for v in r] for r in LA_]), dict(a=LB_, title='B', colors=[[('#e4572e' if v else '#fff') for v in r] for r in LB_])], W=240, gap=20), '入力 A, B'),
             gfig(panels([dict(a=o, title=t, mode='bin') for t, o in ops_], W=320, gap=12), '画素ごとの論理演算の結果')],
    code=r'''import numpy as np
import cv2

A = np.zeros((7, 8), np.uint8); A[1:5, 1:5] = 1
B = np.zeros((7, 8), np.uint8); B[2:6, 3:7] = 1
print('AND', (A & B).sum(), ' OR', (A | B).sum(), ' XOR', (A ^ B).sum(), ' A-B', (A & ~B & 1).sum())
print(A ^ B)
# OpenCV の対応関数
print(np.array_equal(cv2.bitwise_and(A, B), A & B), np.array_equal(cv2.bitwise_xor(A, B), A ^ B))
# A-B = A AND NOT B
print(np.array_equal(cv2.bitwise_and(A, cv2.bitwise_not(B) & 1), A & (1 - B)))
'''))

# グラニュロメトリ
GR = np.zeros((14, 22), int)
for (y, x, s) in [(1, 1, 1), (1, 4, 1), (4, 2, 1), (8, 1, 2), (1, 8, 2), (5, 6, 2), (10, 5, 3), (1, 12, 3), (6, 11, 3), (9, 16, 4), (2, 17, 4)]:
    GR[y:y + s, x:x + s] = 1
areas_g = [int(GR.sum())]
for n in range(1, 5):
    k = np.ones((n * 2 - 1 + 0, n * 2 - 1 + 0), int) if False else np.ones((n + 1, n + 1), int)
    # n+1 角の正方形でオープニング
    def ero_k(a, k):
        H, W = a.shape; out = np.ones_like(a)
        for dy in range(k.shape[0]):
            for dx in range(k.shape[1]):
                out &= np.pad(a, ((0, k.shape[0]), (0, k.shape[1])))[dy:dy + H, dx:dx + W]
        return out
    def dil_k(a, k):
        H, W = a.shape; out = np.zeros_like(a)
        p = np.pad(a, ((k.shape[0], 0), (k.shape[1], 0)))
        for dy in range(k.shape[0]):
            for dx in range(k.shape[1]):
                out |= p[k.shape[0] - dy:k.shape[0] - dy + H, k.shape[1] - dx:k.shape[1] - dx + W]
        return out
    areas_g.append(int(dil_k(ero_k(GR, k), k).sum()))
spec = [areas_g[i] - areas_g[i + 1] for i in range(4)]
E.append(dict(id='binary-granulometry', steps=[
    "① 入力：大きさの違う粒子（1×1, 2×2, 3×3, 4×4 の正方形）が散らばった2値画像",
    "② 構造要素の大きさ n を 1→2→3→4→5 と大きくしながらオープニングし、そのたびに残った面積を測る（ふるいの目を粗くしていく）",
    f"③ 残った面積：{' → '.join(map(str, areas_g))}（n×n の構造要素は n×n 未満の粒子を消す）",
    f"④ 隣り合う段階の差＝パターンスペクトル：{', '.join(f'{i + 1}×{i + 1}の粒子 {v}' for i, v in enumerate(spec))} 画素",
    "⑤ 粒子が接触していてラベリングで分けられなくても、大きさの分布が分かる。粉体・細胞・テクスチャの解析に使う",
], example=f"1×1 の粒子は3個で 3 画素、2×2 は3個で 12 画素、3×3 は3個で 27 画素、4×4 は2個で 32 画素 → スペクトル {spec}",
    figures=[gfig(panels([dict(a=GR, title='入力（粒子の大きさ 1〜4）', mode='bin')], W=260, cs=11), '入力画像'),
             gfig(chart([(list(range(1, 6)), areas_g, BLUE)], bars=([1.5, 2.5, 3.5, 4.5], spec, '#f4a261'), W=300, H=160, xr=(0.5, 5.5), yr=(0, max(areas_g) * 1.15), xticks=[(1, '1'), (2, '2'), (3, '3'), (4, '4'), (5, '5')], xlabel='構造要素の大きさ n（n×n でオープニング）', legend=[('残った面積', BLUE), ('差＝パターンスペクトル', ORANGE)]), '面積の減り方（青）と、その差（橙）')],
    code=r'''import numpy as np
import cv2

img = np.zeros((14, 22), np.uint8)
for y, x, s in [(1,1,1),(1,4,1),(4,2,1),(8,1,2),(1,8,2),(5,6,2),(10,5,3),(1,12,3),(6,11,3),(9,16,4),(2,17,4)]:
    img[y:y + s, x:x + s] = 1                       # 大きさ s の正方形の粒子
areas = []
for n in range(1, 6):                               # n×n の構造要素でオープニング
    k = np.ones((n, n), np.uint8)
    areas.append(int(cv2.morphologyEx(img, cv2.MORPH_OPEN, k, borderValue=0).sum()))
spectrum = -np.diff(areas)                          # パターンスペクトル
print('残った面積', areas)
print('パターンスペクトル', spectrum)               # 大きさ1,2,3,4 の粒子の面積
'''))

if __name__ == '__main__':
    finalize('binary', E, run='--norun' not in sys.argv)
