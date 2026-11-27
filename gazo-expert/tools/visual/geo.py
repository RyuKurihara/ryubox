import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
import cv2
from vh import *

E = []
F_PTS = [(0, 0), (1, 0), (1, 2), (2, 2), (2, 3), (1, 3), (1, 4), (3, 4), (3, 5), (0, 5)]  # Fの字（y上向き）


def H2(M):
    M = np.asarray(M, float)
    if M.shape == (2, 2):
        A = np.eye(3); A[:2, :2] = M; return A
    if M.shape == (2, 3):
        A = np.eye(3); A[:2] = M; return A
    return M


def ap(M, pts):
    M = H2(M)
    out = []
    for x, y in pts:
        v = M @ [x, y, 1]
        out.append((v[0] / v[2], v[1] / v[2]))
    return out


def mfig(M, label, cap=None, d=3):
    M = np.asarray(M, float)
    fg = {"type": "matrix", "data": [[f(v, d) for v in r] for r in M], "label": label}
    if cap:
        fg["caption"] = cap
    return fg


def ffig(M, xr, yr, cap, W=300, mark=(3, 5), mlabel=None, extra=None, step=1, lab_every=1, before='変換前', after='変換後'):
    p = Plane(xr, yr, W=W).axes(step, lab_every=lab_every)
    p.poly(F_PTS, '#bbb', '#888', 1.2, dash='3 2', op=0.35)
    q = ap(M, F_PTS)
    p.poly(q, BLUE, BLUE, 1.6, op=0.25)
    if mark:
        m2 = ap(M, [mark])[0]
        p.dot(mark, 2.6, '#666', f"({f(mark[0])},{f(mark[1])})")
        p.dot(m2, 2.8, RED, mlabel or f"({f(m2[0])},{f(m2[1])})")
    if extra:
        extra(p)
    p.raw(R(p.W - 92, 4, 88, 26, '#fff', '#ccc', 0.6) + R(p.W - 88, 8, 10, 7, '#ddd', '#888', 0.8) + T(p.W - 74, 15, before, 9, 'start') + R(p.W - 88, 19, 10, 7, '#c6d3fa', BLUE, 0.8) + T(p.W - 74, 26, after, 9, 'start'))
    return {"type": "svg", "svg": p.svg(), "caption": cap}


# ---------------- 幾何学的変換 ----------------
th = math.radians(30)
Rot30 = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
M_gt = H2(np.array([[1, 0, 4], [0, 1, 0]])) @ H2(Rot30)
E.append(dict(id='geo-geometric-transform', steps=[
    "① 入力：画像（ここでは F の字）。各画素の座標 (x, y) を、変換式 (x', y') = T(x, y) で新しい位置へ動かす（座標変換）",
    "② 例：30°回転して x 方向に +4 平行移動 → x' = 0.866x − 0.5y + 4,  y' = 0.5x + 0.866y",
    "③ F の右上の角 (3, 5) は (4.10, 5.83) へ移る。角(0,0)は(4,0)へ。形は崩れず、位置と向きだけが変わる",
    "④ 移動先の座標は一般に整数にならないので、実際の画像では『出力画素ごとに逆変換で入力位置を求め、補間で画素値を決める』（再標本化）",
    "⑤ 出力：F が傾いて右へずれた画像。変換の種類（回転・拡大・せん断・射影…）によって、保存される性質（長さ・角度・平行性）が違う",
], example="(3,5) → x' = 0.866·3 − 0.5·5 + 4 = 4.10,  y' = 0.5·3 + 0.866·5 = 5.83。幾何学的変換＝『座標の変換』＋『画素値の決定（補間）』の2段階",
    figures=[ffig(M_gt, (-1, 8), (-1, 7), '灰色の F（変換前）を 30°回転＋右へ4 移動 → 青の F')],
    code=r'''import numpy as np
import cv2

# 入力：10x10 の画像に縦棒（白=255）
img = np.zeros((10, 10), np.uint8); img[2:8, 3] = 255
th = np.deg2rad(30)
# 2x3 のアフィン行列（回転30°＋平行移動）
M = np.array([[np.cos(th), -np.sin(th), 2],
              [np.sin(th),  np.cos(th), 0]], np.float32)
# ① 座標の変換：点 (3,5) の行き先
print(M @ np.array([3, 5, 1]))
# ② 画像全体：出力画素ごとに逆変換＋補間（OpenCV）
out = cv2.warpAffine(img, M, (10, 10), flags=cv2.INTER_LINEAR)
print(out)
'''))

S = np.diag([2, 0.5])
E.append(dict(id='geo-scaling', steps=[
    "① 入力：F の字（幅3・高さ5）。拡大率 sx（横）, sy（縦）を決める。例 sx = 2, sy = 0.5",
    "② 各点に x' = sx·x, y' = sy·y を適用（原点が不動点。原点から離れた点ほど大きく動く）",
    "③ 角 (3, 5) → (6, 2.5)。F は横に2倍・縦に半分の“横長でつぶれた F”になる",
    "④ 画像として拡大するときは、出力画素 (x', y') ごとに入力 (x'/sx, y'/sy) を逆算し、補間で値を決める（例：x'=5 → x=2.5 は画素2と3の中間）",
    "⑤ sx = sy なら形は相似のまま。縮小では細かい模様がエイリアシングを起こすので平滑化（面積平均など）を併用する",
], example="行列 [[2,0],[0,0.5]]。(3,5)→(6,2.5)、(1,4)→(2,2)。面積は sx·sy = 1 倍（行列式）。画像を2倍拡大：出力幅 W'=2W",
    figures=[ffig(S, (-1, 7), (-1, 6), 'sx=2, sy=0.5 の拡大・縮小（原点が中心）'), mfig(np.eye(3) * [2, 0.5, 1], 'S =', '同次座標の拡大縮小行列')],
    code=r'''import numpy as np
import cv2

img = np.arange(16, dtype=np.uint8).reshape(4, 4) * 10   # 入力 4x4
sx, sy = 2.0, 2.0
H, W = img.shape
out = np.zeros((int(H * sy), int(W * sx)), np.uint8)
# 逆変換：出力 (x', y') → 入力 (x'/sx, y'/sy) を最近傍で読む
for yo in range(out.shape[0]):
    for xo in range(out.shape[1]):
        xi, yi = int(xo / sx), int(yo / sy)
        out[yo, xo] = img[yi, xi]
print(out)
# OpenCV の対応関数
out2 = cv2.resize(img, None, fx=sx, fy=sy, interpolation=cv2.INTER_NEAREST)
print(np.array_equal(out, out2))
'''))

q = ap(Rot30, [(3, 5)])[0]
E.append(dict(id='geo-rotation', steps=[
    "① 入力：F の字と回転角 θ（例 30°、原点まわり・反時計回り）",
    "② 各点に x' = x·cosθ − y·sinθ,  y' = x·sinθ + y·cosθ を適用",
    f"③ 角 (3, 5) → ({f(q[0])}, {f(q[1])})。原点からの距離はどちらも √34 = 5.83 で変わらない（長さ・角度を保存）",
    "④ 画像の場合は y 軸が下向きなので、同じ式でも画面上は時計回りに見える点に注意",
    "⑤ 出力：F が 30°傾いた画像。画像中心まわりに回したいときは『中心を原点へ移動 → 回転 → 戻す』を合成する",
], example=f"cos30°=0.866, sin30°=0.5 → x'=0.866·3−0.5·5={f(q[0])}, y'=0.5·3+0.866·5={f(q[1])}。逆変換は −θ 回転（転置行列）",
    figures=[ffig(Rot30, (-3, 5), (-1, 7), '原点まわりに 30° 回転'), mfig([[0.866, -0.5, 0], [0.5, 0.866, 0], [0, 0, 1]], 'R(30°) =')],
    code=r'''import numpy as np
import cv2

th = np.deg2rad(30)
R = np.array([[np.cos(th), -np.sin(th)],
              [np.sin(th),  np.cos(th)]])
p = np.array([3, 5])
q = R @ p
print(q.round(2), np.linalg.norm(p), np.linalg.norm(q))  # 長さ不変
print(np.allclose(np.linalg.inv(R), R.T))                 # 逆行列=転置

# 画像の中心まわりの回転（OpenCVは画面上で反時計回りが正）
img = np.zeros((9, 9), np.uint8); img[4, 4:9] = 255   # 中心から右へ伸びる線
M = cv2.getRotationMatrix2D((4, 4), 90, 1.0)          # 2x3 行列
print(M.round(3))
print(cv2.warpAffine(img, M, (9, 9), flags=cv2.INTER_NEAREST))  # 線が上向きになる
'''))

Tm = np.array([[1, 0, 3], [0, 1, 1]])
E.append(dict(id='geo-translation', steps=[
    "① 入力：F の字と移動量 (tx, ty)。例 (tx, ty) = (3, 1)",
    "② 全ての点に x' = x + tx,  y' = y + ty（形・向きは不変、位置だけ移動）",
    "③ 角 (3, 5) → (6, 6)、角 (0, 0) → (3, 1)",
    "④ 2×2 行列の掛け算では表せないので、同次座標 (x, y, 1) を使い 3×3 行列の右端の列に (tx, ty) を入れる",
    "⑤ 画像の場合：出力 (x', y') の値 = 入力 (x'−tx, y'−ty) の値。はみ出た部分は欠け、空いた部分は背景（0 など）になる",
], example="[[1,0,3],[0,1,1],[0,0,1]]·(3,5,1)ᵀ = (6,6,1)ᵀ。画像では 5×5 の画像を右に2画素ずらすと、左端2列が0（黒）になる",
    figures=[ffig(Tm, (-1, 7), (-1, 7), '(tx, ty) = (3, 1) の平行移動'), mfig([[1, 0, 3], [0, 1, 1], [0, 0, 1]], 'T =')],
    code=r'''import numpy as np
import cv2

img = np.arange(1, 26, dtype=np.uint8).reshape(5, 5)
tx, ty = 2, 1
# NumPy：出力(y', x') ← 入力(y'-ty, x'-tx)
out = np.zeros_like(img)
out[ty:, tx:] = img[:5 - ty, :5 - tx]
print(out)
# OpenCV：2x3 行列で同じことをする
M = np.float32([[1, 0, tx], [0, 1, ty]])
print(np.array_equal(out, cv2.warpAffine(img, M, (5, 5))))
'''))


def refl_extra(p):
    q = ap(np.diag([1, -1]), F_PTS)
    p.poly(q, '#ffd8c9', RED, 1.4, op=0.5)
    p.text((1.5, -2.8), 'x軸で鏡映', 9, fill=RED)
    p.text((-1.5, 5.7), 'y軸で鏡映', 9, fill=BLUE)


E.append(dict(id='geo-reflection', steps=[
    "① 入力：F の字。対称軸を決める（y 軸 / x 軸 / 原点）",
    "② y 軸に関する鏡映（左右反転）：x' = −x, y' = y → 行列 [[−1,0],[0,1]]",
    "③ x 軸に関する鏡映（上下反転）：x' = x, y' = −y → 行列 [[1,0],[0,−1]]。両方行うと 180° 回転と同じ",
    "④ 角 (3, 5) は左右反転で (−3, 5)、上下反転で (3, −5)。F の向きが裏返り『鏡文字』になる（行列式 −1：回転では作れない）",
    "⑤ 画像では幅 W のとき x' = W−1−x。補間不要で画素を並べ替えるだけ",
], example="4×4 画像の1行 [1,2,3,4] を左右反転 → [4,3,2,1]（x'=3−x）。cv2.flip(img,1)=左右, 0=上下, −1=両方",
    figures=[ffig(np.diag([-1, 1]), (-4, 4), (-6, 6), '灰：元の F、青：左右反転、赤：上下反転', W=260, extra=refl_extra, step=1, lab_every=2, after='左右反転')],
    code=r'''import numpy as np
import cv2

img = np.array([[1, 2, 3, 4],
                [5, 6, 7, 8],
                [9, 10, 11, 12]], np.uint8)
print(img[:, ::-1])          # 左右反転（y軸鏡映）: x' = W-1-x
print(img[::-1, :])          # 上下反転（x軸鏡映）
print(img[::-1, ::-1])       # 両方 = 180°回転
# OpenCV: 1=左右, 0=上下, -1=両方
print(np.array_equal(cv2.flip(img, 1), img[:, ::-1]))
# 行列式 -1 → 向きが裏返る（回転では作れない）
print(np.linalg.det([[-1, 0], [0, 1]]))
'''))

Sk = np.array([[1, 0.5], [0, 1]])


def sq_extra(p):
    sq = [(0, 0), (2, 0), (2, 2), (0, 2)]
    p.poly(sq, 'none', '#888', 1, dash='3 2')
    p.poly(ap(Sk, sq), 'none', GREEN, 1.5)
    p.text((5.2, 2.4), '正方形→平行四辺形', 9, fill=GREEN)


E.append(dict(id='geo-skew', steps=[
    "① 入力：F の字（または正方形）とせん断係数 a（=tanφ）。例 a = 0.5（φ ≈ 26.6°）",
    "② x 方向のせん断：x' = x + a·y, y' = y。高い位置（y 大）ほど右へずれる。y=0 の辺は動かない",
    "③ 角 (3, 5) → (3 + 0.5·5, 5) = (5.5, 5)。(0, 5) → (2.5, 5)。F が右に傾いたイタリック体のようになる",
    "④ 正方形 (0,0)-(2,2) → 平行四辺形。底辺と高さが同じなので面積は不変（行列式 = 1）",
    "⑤ 直線・平行性は保存、角度・長さは保存されない（アフィン変換の一種）",
], example="行列 [[1,0.5],[0,1]]。(0,2)→(1,2)、(2,2)→(3,2)。正方形の左辺は傾き 1/0.5 = 2 の斜線になる",
    figures=[ffig(Sk, (-1, 7), (-1, 6), 'x方向せん断 a=0.5（上ほど右にずれる）', extra=sq_extra), mfig([[1, 0.5, 0], [0, 1, 0], [0, 0, 1]], 'Sx =')],
    code=r'''import numpy as np
import cv2

a = 0.5
Sx = np.array([[1, a], [0, 1]])
pts = np.array([[0, 0], [2, 0], [2, 2], [0, 2]]).T   # 正方形の4頂点（列ベクトル）
print((Sx @ pts).T)                                  # 平行四辺形の4頂点
print(np.linalg.det(Sx))                             # 1 → 面積は不変

# 画像：縦線がせん断で斜線になる（画像は y 下向き）
img = np.zeros((6, 8), np.uint8); img[:, 1] = 255
M = np.float32([[1, a, 0], [0, 1, 0]])
print(cv2.warpAffine(img, M, (8, 6), flags=cv2.INTER_NEAREST) // 255)
'''))

E.append(dict(id='geo-homogeneous', steps=[
    "① 2次元の点 (x, y) に 1 を付け足して (x, y, 1) と表す。(2x, 2y, 2) なども同じ点を表す（定数倍は同一視）",
    "② 平行移動 x' = x + tx は 2×2 行列では書けないが、3×3 行列の第3列に (tx, ty) を入れれば掛け算1回で書ける",
    "③ 例：点 (2, 1) を『30°回転 → (3, 1) 平行移動』。3×3 行列を掛け合わせて1つにまとめる（合成）",
    "④ 結果ベクトル (x', y', w) を w で割って2次元に戻す。アフィンなら w = 1、射影変換では w ≠ 1 になる",
    "⑤ 出力：回転・拡大・平行移動・射影をすべて『3×3 行列の積』で扱える",
], example=(lambda M: f"M = T(3,1)·R(30°) = [[0.866,−0.5,3],[0.5,0.866,1],[0,0,1]]、M·(2,1,1)ᵀ = ({f(M[0], 3)}, {f(M[1], 3)}, 1)ᵀ → 点 ({f(M[0], 3)}, {f(M[1], 3)})。(4,2,2) は (2,1) と同じ点")(H2([[1, 0, 3], [0, 1, 1]]) @ H2(Rot30) @ [2, 1, 1]),
    figures=[mfig(H2([[1, 0, 3], [0, 1, 1]]) @ H2(Rot30), 'M = T·R =', '回転と平行移動を1つの3×3行列に'),
             {"type": "table", "head": ["", "x", "y", "w"], "rows": [["入力 (2,1)", "2", "1", "1"], ["M を掛ける"] + [f(v, 3) for v in H2([[1, 0, 3], [0, 1, 1]]) @ H2(Rot30) @ [2, 1, 1]], ["w で割る"] + [f(v, 3) for v in H2([[1, 0, 3], [0, 1, 1]]) @ H2(Rot30) @ [2, 1, 1]]], "caption": "同次座標での計算（アフィンなので w=1）"}],
    code=r'''import numpy as np

th = np.deg2rad(30)
R = np.array([[np.cos(th), -np.sin(th), 0],
              [np.sin(th),  np.cos(th), 0],
              [0, 0, 1]])
T = np.array([[1, 0, 3],
              [0, 1, 1],
              [0, 0, 1]])
M = T @ R                       # 右から順に適用：先に回転、後で平行移動
p = np.array([2, 1, 1])         # 点(2,1)を同次座標に
q = M @ p
print(M.round(3))
print(q.round(3), '->', (q[:2] / q[2]).round(3))   # wで割って2次元へ
# 定数倍は同じ点
print(np.allclose((M @ (2 * p))[:2] / (M @ (2 * p))[2], q[:2]))
'''))

src = np.float32([[0, 0], [4, 0], [0, 4]])
dst = np.float32([[1, 1], [5, 2], [2, 5]])
Aff = cv2.getAffineTransform(src, dst)


def aff_fig():
    p = Plane((-1, 9), (-1, 7), W=300).axes(1)
    for i in range(0, 5):
        p.line((i, 0), (i, 4), '#aaa', 0.8, '2 2'); p.line((0, i), (4, i), '#aaa', 0.8, '2 2')
        a, b = ap(Aff, [(i, 0), (i, 4)]); p.line(a, b, BLUE, 1)
        a, b = ap(Aff, [(0, i), (4, i)]); p.line(a, b, BLUE, 1)
    for s, d, n in zip(src, dst, 'ABC'):
        p.dot(s, 2.6, '#666', n, -10, -3)
        p.dot(d, 2.8, RED, n + "'")
    p.text((6.5, 0.3), '格子 → 平行な格子', 9, fill=BLUE)
    return {"type": "svg", "svg": p.svg(), "caption": '3組の対応点 A→A\', B→B\', C→C\' で決まるアフィン変換。平行線は平行のまま'}


E.append(dict(id='geo-affine', steps=[
    "① 変換式：x' = a·x + b·y + c,  y' = d·x + e·y + f（未知数6個＝自由度6）",
    "② 3組の対応点（同一直線上にない）を与えると連立方程式で6個の係数が決まる。例 A(0,0)→(1,1), B(4,0)→(5,2), C(0,4)→(2,5)",
    "③ 解くと a=1, b=0.25, c=1, d=0.25, e=1, f=1。正方形の格子が“傾いた平行四辺形の格子”になる",
    "④ 回転・拡大縮小・せん断・鏡映・平行移動とその組合せはすべてアフィン変換",
    "⑤ 保存：直線性・平行性・平行線分の長さの比・面積比。保存されない：長さ・角度",
], example=f"A=(0,0)→(1,1) から c=1,f=1。B=(4,0)→(5,2) から 4a+1=5, 4d+1=2 → a=1, d=0.25。C から b=0.25, e=1。点 (4,4) → ({f(ap(Aff, [(4, 4)])[0][0])}, {f(ap(Aff, [(4, 4)])[0][1])})",
    figures=[aff_fig(), mfig(H2(Aff), 'A =')],
    code=r'''import numpy as np
import cv2

src = np.float32([[0, 0], [4, 0], [0, 4]])
dst = np.float32([[1, 1], [5, 2], [2, 5]])
# NumPy：x' = a x + b y + c, y' = d x + e y + f を連立方程式で解く
A, b = [], []
for (x, y), (u, v) in zip(src, dst):
    A.append([x, y, 1, 0, 0, 0]); b.append(u)
    A.append([0, 0, 0, x, y, 1]); b.append(v)
p = np.linalg.solve(np.array(A), np.array(b))
print(p.reshape(2, 3))
# OpenCV
M = cv2.getAffineTransform(src, dst)
print(M)
print(M @ [4, 4, 1])            # (4,4) の行き先
'''))

Rr = H2(Rot30 * 0 + np.array([[0, -1], [1, 0]]))  # 90°
Tt = H2(np.array([[1, 0, 4], [0, 1, 0]]))


def comp_fig():
    p = Plane((-6, 6), (-1, 8), W=300).axes(1, lab_every=2)
    p.poly(F_PTS, '#bbb', '#888', 1.2, dash='3 2', op=0.35)
    p.poly(ap(Tt @ Rr, F_PTS), BLUE, BLUE, 1.5, op=0.25)
    p.poly(ap(Rr @ Tt, F_PTS), '#ffd8c9', RED, 1.5, op=0.5)
    p.text((2.8, 6.0), '回転→移動', 10, fill=BLUE)
    p.text((-2.5, 7.4), '移動→回転', 10, fill=RED)
    return {"type": "svg", "svg": p.svg(), "caption": '90°回転と x方向+4移動：順序を変えると結果が違う'}


E.append(dict(id='geo-composite', steps=[
    "① 複数の変換を続けて行うとき、それぞれの 3×3 行列を掛け合わせて1つの行列にまとめる",
    "② 『先に A、次に B』は M = B·A（右から順に作用）。行列の積は一般に交換できない",
    "③ 例：R = 90°回転、T = x 方向 +4。T·R（回転してから移動）では (3,5) → (−5+4, 3) = (−1, 3)",
    "④ R·T（移動してから回転）では (3,5) → (7,5) → (−5, 7)。同じ部品でも結果の位置が違う",
    "⑤ まとめた1つの行列で一度だけ再標本化すれば、補間による劣化も1回で済む",
], example="T·R = [[0,−1,4],[1,0,0],[0,0,1]]、R·T = [[0,−1,0],[1,0,4],[0,0,1]]。(3,5)→ T·R で(−1,3)、R·T で(−5,7)",
    figures=[comp_fig(), {"type": "table", "head": ["順序", "行列", "(3,5)の行き先"], "rows": [["回転→移動", "T·R", "(−1, 3)"], ["移動→回転", "R·T", "(−5, 7)"]]}],
    code=r'''import numpy as np

R = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])   # 90°回転
T = np.array([[1, 0, 4], [0, 1, 0], [0, 0, 1]])    # x方向に+4
p = np.array([3, 5, 1])
print('T@R', T @ R @ p)   # 先に回転、次に移動
print('R@T', R @ T @ p)   # 先に移動、次に回転
print(np.array_equal(T @ R, R @ T))  # False：順序で結果が変わる
# 3つ以上でも1つの行列にまとめられる
S = np.diag([2, 2, 1])
M = T @ R @ S
print(M, M @ p)
'''))

c = (2, 2)
Rc = H2([[1, 0, c[0]], [0, 1, c[1]]]) @ Rr @ H2([[1, 0, -c[0]], [0, 1, -c[1]]])


def rc_extra(p):
    p.dot(c, 3.2, GREEN, '中心(2,2)', 5, 12)


E.append(dict(id='geo-rotation-about-point', steps=[
    "① 回転中心 (cx, cy) を決める。例：(2, 2) まわりに 90°",
    "② 中心を原点へ移す T(−cx, −cy) → 原点まわりに回転 R(θ) → 元に戻す T(cx, cy)",
    "③ 合成行列 M = T(cx,cy)·R(θ)·T(−cx,−cy)。90°なら M = [[0,−1,4],[1,0,0],[0,0,1]]",
    "④ 角 (3, 5) → (1, 3) → (−3, 1) → (−1, 3)。中心 (2,2) 自身は動かない（不動点）",
    "⑤ 画像を中心まわりに回すとき（cv2.getRotationMatrix2D）は内部でこれを行っている",
], example="M = [[cosθ, −sinθ, cx − cx·cosθ + cy·sinθ],[sinθ, cosθ, cy − cx·sinθ − cy·cosθ]]。θ=90°, c=(2,2) → 第3列 = (4, 0)",
    figures=[ffig(Rc, (-4, 5), (-1, 6), '点 (2,2) まわりに 90° 回転', W=280, extra=rc_extra), mfig(Rc, 'M =')],
    code=r'''import numpy as np
import cv2

def T(tx, ty): return np.array([[1, 0, tx], [0, 1, ty], [0, 0, 1]], float)
th = np.deg2rad(90)
R = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]])
cx, cy = 2, 2
M = T(cx, cy) @ R @ T(-cx, -cy)          # 戻す・回す・原点へ（右から適用）
print(M.round(3))
print((M @ [3, 5, 1]).round(3))           # (3,5) → (-1,3)
print((M @ [cx, cy, 1]).round(3))         # 中心は不動点
# OpenCV（画面座標では y が下向きなので角度の符号が逆に見える）
print(cv2.getRotationMatrix2D((cx, cy), -90, 1.0).round(3))
'''))

Eu = H2([[1, 0, 4], [0, 1, 1]]) @ H2([[math.cos(math.radians(40)), -math.sin(math.radians(40))], [math.sin(math.radians(40)), math.cos(math.radians(40))]])
E.append(dict(id='geo-euclidean', steps=[
    "① 回転 θ と平行移動 (tx, ty) だけの変換：x' = x cosθ − y sinθ + tx,  y' = x sinθ + y cosθ + ty",
    "② パラメータは θ, tx, ty の3つ（自由度3）。2組の対応点があれば決まる（1組では回転が決まらない）",
    "③ 例：40°回転＋(4, 1) 移動。F の各辺の長さ（例 縦棒の長さ5）、角の直角はそのまま",
    "④ 物体を“持ち上げて置き直す”だけの変換なので剛体変換とも呼ぶ。面積・長さ・角度すべて保存",
    "⑤ 用途：ベルトコンベア上の部品の位置・向き計測、手ぶれ補正（回転＋平行移動）",
], example=(lambda a, b: f"(0,0)→(4,1)、(0,5)→({f(a[0])},{f(a[1])})。2点間の距離は 5 → {f(math.dist(a, b))}（不変）")(ap(Eu, [(0, 5)])[0], ap(Eu, [(0, 0)])[0]),
    figures=[ffig(Eu, (-1, 8), (-1, 7), '40°回転＋(4,1)移動：形も大きさも同じ', mark=(0, 5))],
    code=r'''import numpy as np

th = np.deg2rad(40)
M = np.array([[np.cos(th), -np.sin(th), 4],
              [np.sin(th),  np.cos(th), 1],
              [0, 0, 1]])
F = np.array([[0, 0], [1, 0], [1, 2], [2, 2], [2, 3], [1, 3], [1, 4], [3, 4], [3, 5], [0, 5]], float)
Fh = np.c_[F, np.ones(len(F))] @ M.T          # 全頂点を変換
edge = lambda P: np.linalg.norm(np.diff(np.r_[P, P[:1]], axis=0), axis=1)
print(edge(F).round(3))
print(edge(Fh[:, :2]).round(3))               # 各辺の長さが一致
# 2組の対応点から θ と t を復元
p, q = F[[0, 9]], Fh[[0, 9], :2]
d0, d1 = p[1] - p[0], q[1] - q[0]
th_est = np.arctan2(d1[1], d1[0]) - np.arctan2(d0[1], d0[0])
print(np.rad2deg(th_est).round(2), (q[0] - p[0]).round(2))
'''))

s_ = 0.6
Sim = H2([[1, 0, 4], [0, 1, 0.5]]) @ H2(s_ * np.array([[math.cos(math.radians(30)), -math.sin(math.radians(30))], [math.sin(math.radians(30)), math.cos(math.radians(30))]]))
E.append(dict(id='geo-similarity', steps=[
    "① ユークリッド変換に一様な拡大縮小 s を加えたもの：x' = s(x cosθ − y sinθ) + tx,  y' = s(x sinθ + y cosθ) + ty",
    "② パラメータ s, θ, tx, ty の4つ（自由度4）。2組の対応点で決まる",
    "③ 例：s = 0.6, θ = 30°, t = (4, 0.5)。F は小さく傾くが、形（角度・辺の長さの比）は同じ",
    "④ 縦棒の長さ 5 → 3、上の横棒 2 → 1.2：比 5:2 は保存。直角は直角のまま",
    "⑤ 用途：カメラとの距離が変わった物体の照合（スケールが変わっても形は同じ）",
], example="行列の左上2×2 = s·R = [[0.52,−0.3],[0.3,0.52]]。a=s cosθ, b=s sinθ とおくと [[a,−b,tx],[b,a,ty]] の4未知数",
    figures=[ffig(Sim, (-1, 7), (-1, 6), 's=0.6, θ=30°, t=(4,0.5) の相似変換', mark=(0, 5)), mfig(Sim, 'M =')],
    code=r'''import numpy as np
import cv2

s, th = 0.6, np.deg2rad(30)
a, b = s * np.cos(th), s * np.sin(th)
M = np.array([[a, -b, 4], [b, a, 0.5]])
src = np.float32([[0, 0], [0, 5], [3, 5], [1, 2]])
dst = (np.c_[src, np.ones(4)] @ M.T).astype(np.float32)
# 縦棒(0,0)-(0,5)と横棒(0,5)-(3,5)の長さの比は保存
n = np.linalg.norm
print(n(src[1] - src[0]) / n(src[2] - src[1]), n(dst[1] - dst[0]) / n(dst[2] - dst[1]))
# OpenCV：相似変換（4自由度）を対応点から推定
M_est, _ = cv2.estimateAffinePartial2D(src, dst)
print(M_est.round(3))
print(np.hypot(*M_est[:, 0]).round(3), np.rad2deg(np.arctan2(M_est[1, 0], M_est[0, 0])).round(1))
'''))

srcq = np.float32([[0, 0], [4, 0], [4, 4], [0, 4]])
dstq = np.float32([[0, 0], [6, 1], [5, 5], [1, 4]])
Hq = cv2.getPerspectiveTransform(srcq, dstq)


def proj_fig():
    p = Plane((-1, 9), (-1, 6), W=300).axes(1)
    for i in range(0, 5):
        p.line((i, 0), (i, 4), '#bbb', 0.8, '2 2'); p.line((0, i), (4, i), '#bbb', 0.8, '2 2')
    for i in np.linspace(0, 4, 5):
        pts = ap(Hq, [(i, y) for y in np.linspace(0, 4, 9)]); p.poly(pts, 'none', BLUE, 1, False)
        pts = ap(Hq, [(x, i) for x in np.linspace(0, 4, 9)]); p.poly(pts, 'none', BLUE, 1, False)
    m = ap(Hq, [(2, 2)])[0]
    p.dot((2, 2), 2.6, '#666', '(2,2)', 3, 11)
    p.dot(m, 2.8, RED, f"({f(m[0])},{f(m[1])})", 4, -4)
    p.text((7, 0.3), '平行線が平行でなくなる', 9, fill=BLUE)
    return {"type": "svg", "svg": p.svg(), "caption": '正方形の格子（灰）→ 任意の四角形（青）。直線は直線のまま'}


Hn = Hq / Hq[2, 2]
v = Hn @ [2, 2, 1]
E.append(dict(id='geo-projective', steps=[
    "① 変換式：x' = (h11x + h12y + h13)/(h31x + h32y + h33),  y' = (h21x + h22y + h23)/(…同じ分母…)",
    "② 3×3 行列 H を同次座標に掛け、最後に w で割る。h33 = 1 とおくと未知数8個（自由度8）→ 4組の対応点で決まる",
    "③ 例：正方形 (0,0),(4,0),(4,4),(0,4) → 四角形 (0,0),(6,1),(5,5),(1,4)",
    f"④ 中心 (2,2) は H·(2,2,1)ᵀ = ({f(v[0], 3)}, {f(v[1], 3)}, {f(v[2], 3)}) → w で割って ({f(v[0] / v[2])}, {f(v[1] / v[2])})。四角形の“見た目の中心”にはならない",
    "⑤ 直線は直線のまま、平行性は失われる（遠近感）。斜めから撮った平面（書類・看板・床）を正面から見た画像に直すのに使う",
], example=f"h31={f(Hn[2, 0], 4)}, h32={f(Hn[2, 1], 4)} が 0 でないので分母 w が場所ごとに変わる → 遠近の効果。h31=h32=0 ならアフィン変換",
    figures=[proj_fig(), mfig(Hn, 'H =', 'h33=1 に正規化')],
    code=r'''import numpy as np
import cv2

src = np.float32([[0, 0], [4, 0], [4, 4], [0, 4]])
dst = np.float32([[0, 0], [6, 1], [5, 5], [1, 4]])
H = cv2.getPerspectiveTransform(src, dst)      # 4組の対応点から H
print(H.round(4))
v = H @ np.array([2, 2, 1.0])                  # 同次座標で掛けて
print(v.round(3), '->', (v[:2] / v[2]).round(2))  # w で割る
# 点列をまとめて変換
pts = np.float32([[[2, 0]], [[4, 2]]])
print(cv2.perspectiveTransform(pts, H).reshape(-1, 2).round(2))
# 画像全体：cv2.warpPerspective(img, H, (幅, 高さ))
img = np.zeros((5, 5), np.uint8); img[::2, :] = 255
print(cv2.warpPerspective(img, H, (7, 6), flags=cv2.INTER_NEAREST) // 255)
'''))


def inv_fig():
    sq = [(0, 0), (2, 0), (2, 2), (0, 2)]
    tfs = [('ユークリッド', H2([[1, 0, 0.6], [0, 1, 0.3]]) @ H2(np.array([[0.866, -0.5], [0.5, 0.866]]))),
           ('相似', H2(np.array([[0.55, -0.32, 0.5], [0.32, 0.55, 0.5]]))),
           ('アフィン', H2(np.array([[1, 0.6, 0], [0.1, 0.7, 0.4]]))),
           ('射影', cv2.getPerspectiveTransform(np.float32(sq), np.float32([[0.2, 0.3], [2.4, 0], [1.9, 2.0], [0.5, 1.4]])))]
    b = []
    W = 320
    for k, (name, M) in enumerate(tfs):
        ox = 8 + k * 78
        s = 26
        X = lambda x: ox + 6 + x * s
        Y = lambda y: 78 - y * s
        b.append(P([(X(x), Y(y)) for x, y in sq], 'none', '#aaa', 1, dash='2 2'))
        b.append(P([(X(x), Y(y)) for x, y in ap(M, sq)], '#c6d3fa', BLUE, 1.5))
        b.append(T(ox + 36, 96, name, 10))
    return {"type": "svg", "svg": svg(W, 104, ''.join(b)), "caption": '正方形（点線）が各変換でどう変わるか'}


E.append(dict(id='geo-invariants', steps=[
    "① 正方形（1辺2、角90°）を各変換で写し、何が残るかを見る",
    "② ユークリッド（3自由度）：位置・向きだけ変わる → 長さ 2・角度 90°・面積 4 がすべて残る",
    "③ 相似（4自由度）：大きさが変わる（例 1辺 2→1.27）→ 角度 90°と辺の比 1:1 が残る",
    "④ アフィン（6自由度）：平行四辺形になる → 角度は崩れるが平行性・平行線分の長さの比・面積比が残る",
    "⑤ 射影（8自由度）：一般の四角形 → 平行性も失われる。残るのは直線性（直線→直線）と複比だけ。上位ほど自由度が多く、保存される性質が少ない",
], example="正方形の対辺は アフィンでは平行のまま、射影では交わる（消失点）。正方形の中点 → アフィンでは像の中点、射影では中点にならない",
    figures=[inv_fig(), {"type": "table", "head": ["", "ユークリッド", "相似", "アフィン", "射影"], "rows": [["自由度", "3", "4", "6", "8"], ["長さ", "○", "×", "×", "×"], ["角度", "○", "○", "×", "×"], ["平行性", "○", "○", "○", "×"], ["長さの比", "○", "○", "△※", "×"], ["直線性・複比", "○", "○", "○", "○"]], "caption": "※アフィンは平行な線分どうしの長さの比のみ保存"}],
    code=r'''import numpy as np
import cv2

sq = np.float32([[0, 0], [2, 0], [2, 2], [0, 2]])
A = np.float32([[1, 0.6, 0], [0.1, 0.7, 0.4]])                     # アフィン
H = cv2.getPerspectiveTransform(sq, np.float32([[0.2, 0.3], [2.4, 0], [1.9, 2.0], [0.5, 1.4]]))
pa = cv2.transform(sq[None], A)[0]
pp = cv2.perspectiveTransform(sq[None], H)[0]
def parallel(p):            # 対辺 0-1 と 3-2 の外積（0なら平行）
    d1, d2 = p[1] - p[0], p[2] - p[3]
    return round(float(d1[0] * d2[1] - d1[1] * d2[0]), 4)
print('affine 平行?', parallel(pa), ' 射影 平行?', parallel(pp))
# 中点の保存：辺0-1の中点を写したものと、写した端点の中点
m = (sq[0] + sq[1]) / 2
print(cv2.transform(m[None, None], A)[0, 0], (pa[0] + pa[1]) / 2)
print(cv2.perspectiveTransform(m[None, None], H)[0, 0].round(3), ((pp[0] + pp[1]) / 2).round(3))
'''))

# 複比
A4 = np.array([0, 1, 2, 4.0])
def cr(p):
    a, b, c_, d = p
    return ((c_ - a) * (d - b)) / ((c_ - b) * (d - a))
# 投影：上の直線 y=0 の点(x,0) を中心 O=(5,4) から 直線 y=2- (x)*0.3 ... 簡単のため射影1次元 x' = (2x+1)/(0.3x+1)
proj = lambda x: (2 * x + 1) / (0.25 * x + 1)
B4 = proj(A4)


def cr_fig():
    W, Hh = 300, 150
    b = []
    X = lambda x: 20 + x * 55
    # 下の直線：A,B,C,D
    b.append(L(10, 120, 290, 120, '#333', 1.2))
    b.append(L(10, 40, 290, 40, '#333', 1.2))
    # 上の直線は射影像（等間隔でなくなる）
    for i, (a, bb, n) in enumerate(zip(A4, B4, 'ABCD')):
        x1, x2 = X(a), 20 + (bb - 1) * 55
        b.append(L(x1, 120, x2, 40, '#bbb', 0.8, '3 2'))
        b.append(C(x1, 120, 3, RED) + T(x1, 135, f"{n}={f(a)}", 10, fill=RED))
        b.append(C(x2, 40, 3, BLUE) + T(x2, 30, f"{n}'={f(bb)}", 10, fill=BLUE))
    b.append(T(150, 12, f"複比 (A,B;C,D) = {f(cr(A4), 3)}   (A',B';C',D') = {f(cr(B4), 3)}", 10, weight='bold'))
    b.append(T(150, 148, '長さの比は変わるが複比は同じ', 9, fill='#555'))
    return {"type": "svg", "svg": svg(W, Hh + 6, ''.join(b)), "caption": "下の直線の4点を射影変換 x'=(2x+1)/(0.25x+1) で写した"}


E.append(dict(id='geo-cross-ratio', steps=[
    "① 同一直線上の4点 A, B, C, D の座標を読む。例：0, 1, 2, 4",
    "② 複比 (A,B;C,D) = (AC·BD)/(BC·AD) = (2·3)/(1·4) = 1.5",
    f"③ これを射影変換（透視投影）で別の直線へ写すと A'={f(B4[0])}, B'={f(B4[1])}, C'={f(B4[2])}, D'={f(B4[3])}。間隔の比はバラバラに変わる（AB:BC = 1:1 → {f(B4[1] - B4[0])}:{f(B4[2] - B4[1])}）",
    f"④ それでも複比は (A'C'·B'D')/(B'C'·A'D') = {f(cr(B4), 3)} で元と同じ → 射影不変量",
    "⑤ 用途：写真上の電柱・窓など等間隔に並んだ物の位置から、遠くの点の実際の位置を逆算する",
], example=f"A'C'={f(B4[2] - B4[0], 3)}, B'D'={f(B4[3] - B4[1], 3)}, B'C'={f(B4[2] - B4[1], 3)}, A'D'={f(B4[3] - B4[0], 3)} → {f(cr(B4), 3)}",
    figures=[cr_fig()],
    code=r'''import numpy as np

def cross_ratio(a, b, c, d):          # (A,B;C,D) = (AC*BD)/(BC*AD)
    return ((c - a) * (d - b)) / ((c - b) * (d - a))

x = np.array([0, 1, 2, 4.0])          # 直線上の4点
print(cross_ratio(*x))                # 1.5
# 1次元の射影変換 x' = (p x + q)/(r x + s)
p, q, r, s = 2, 1, 0.25, 1
y = (p * x + q) / (r * x + s)
print(y.round(3))                     # 間隔はバラバラ
print(np.diff(x), np.diff(y).round(3))
print(round(cross_ratio(*y), 6))      # でも複比は 1.5 のまま
'''))


def imgcoord_fig():
    W = 300
    b = []
    ox, oy, cs = 40, 26, 26
    a = np.array([[10, 50, 90, 130, 170], [30, 70, 110, 150, 190], [60, 100, 140, 180, 220], [90, 130, 170, 210, 250]])
    b.append(grid(a, ox, oy, cs, 'gray', True, mx=255))
    b.append(arrow(ox, oy - 8, ox + 5 * cs + 16, oy - 8, None, RED))
    b.append(T(ox + 5 * cs + 20, oy - 4, 'x（列）', 10, 'start', fill=RED))
    b.append(arrow(ox - 8, oy, ox - 8, oy + 4 * cs + 16, None, RED))
    b.append(T(ox - 10, oy + 4 * cs + 28, 'y（行）', 10, fill=RED))
    for i in range(5):
        b.append(T(ox + i * cs + cs / 2, oy - 12, str(i), 9, fill='#777'))
    for j in range(4):
        b.append(T(ox - 15, oy + j * cs + cs / 2 + 3, str(j), 9, fill='#777'))
    b.append(T(ox - 14, oy - 12, '(0,0)', 9, fill=RED))
    b.append(R(ox + 3 * cs + 1, oy + 1 * cs + 1, cs - 2, cs - 2, 'none', BLUE, 2.2))
    b.append(T(180, 60, '(x,y)=(3,1)', 10, 'start', fill=BLUE))
    b.append(T(180, 74, '= img[1, 3]', 10, 'start', fill=BLUE))
    b.append(T(180, 88, '= 150', 10, 'start', fill=BLUE))
    b.append(T(180, 118, 'y軸は下向き', 10, 'start', fill='#444'))
    b.append(T(180, 132, '→ 画面上で', 10, 'start', fill='#444'))
    b.append(T(180, 146, '　回転の向きが逆', 10, 'start', fill='#444'))
    return {"type": "svg", "svg": svg(W, 160, ''.join(b)), "caption": '5×4 画像。配列は [行, 列] = [y, x] の順でアクセス'}


E.append(dict(id='geo-image-coordinate', steps=[
    "① 原点 (0,0) は左上の画素。x は右向き（列番号）、y は下向き（行番号）",
    "② 幅 W=5・高さ H=4 の画像なら x = 0〜4、y = 0〜3。右下の画素は (4, 3)",
    "③ プログラムの配列は img[行, 列] = img[y, x] の順。(x,y)=(3,1) の値は img[1, 3] = 150",
    "④ 数学の座標（y 上向き）と y の向きが逆なので、反時計回りの回転式 R(θ) をそのまま使うと画面上は時計回りに回る",
    "⑤ 画素中心を整数座標とするか、画素の左上隅を整数とするか（0.5 のずれ）で、拡大縮小の対応が半画素ずれる",
], example="画素中心基準の拡大（倍率 s）：x_in = (x_out + 0.5)/s − 0.5。s=2 の出力 x=0 → 入力 −0.25（0.5ずれを無視すると 0）",
    figures=[imgcoord_fig()],
    code=r'''import numpy as np
import cv2

img = np.array([[10, 50, 90, 130, 170],
                [30, 70, 110, 150, 190],
                [60, 100, 140, 180, 220],
                [90, 130, 170, 210, 250]], np.uint8)
H, W = img.shape              # shape は (高さ, 幅) の順
x, y = 3, 1
print(H, W, img[y, x])        # 配列は [y, x] = [行, 列]
# OpenCV の座標指定は (x, y) の順（cv2.circle, cv2.resize の dsize など）
print(cv2.resize(img, (10, 8)).shape)     # dsize=(幅, 高さ) → shape (8,10)
# 画素中心基準での拡大時の対応（倍率2）
s = 2
for xo in range(4):
    print(xo, (xo + 0.5) / s - 0.5)
'''))

# 順変換 / 逆変換
src3 = np.array([[40, 120, 200], [80, 160, 240], [20, 100, 180]])
fw = np.full((6, 6), -1)
for yy in range(3):
    for xx in range(3):
        fw[yy * 2, xx * 2] = src3[yy, xx]
holes = [[('穴' if fw[r, c] < 0 else f(fw[r, c])) for c in range(6)] for r in range(6)]
fw_col = [[('#ffd6e0' if fw[r, c] < 0 else gray(fw[r, c])[0]) for c in range(6)] for r in range(6)]
inv = np.array([[src3[r // 2, c // 2] for c in range(6)] for r in range(6)])


def fw_fig(out, vals, cols, title):
    W = 320
    b = [T(55, 12, '入力 3×3', 10), T(220, 12, title, 10)]
    b.append(grid(src3, 12, 20, 28, 'gray', True))
    b.append(grid(out, 140, 20, 26, 'gray', vals, colors=cols, size=9))
    b.append(arrow(102, 62, 134, 62, None))
    b.append(T(118, 54, '×2', 10))
    return svg(W, 182, ''.join(b))


fwfig = {"type": "svg", "svg": fw_fig(np.where(fw < 0, 0, fw), holes, fw_col, '順変換で2倍（6×6）'), "caption": '入力画素 (x,y) → (2x,2y) に置くだけ：値が入らない出力画素（ピンク）が穴になる'}
E.append(dict(id='geo-forward-mapping', steps=[
    "① 入力画像の各画素 (x, y) について、変換先 (x', y') = T(x, y) を計算し、そこへ値を書き込む",
    "② 例：3×3 画像を2倍拡大 → (x, y) を (2x, 2y) に置く。入力9画素 → 出力 36画素のうち9画素にしか値が入らない",
    "③ 残りの 27 画素は誰からも書き込まれない＝『穴』（ピンク）。回転でも斜めの線上に点状の穴ができる",
    "④ 逆に縮小では、複数の入力が同じ出力画素に重なって上書きされる（値が失われる）",
    "⑤ そのため画像の幾何学的変換では、出力側から逆算する逆変換（逆写像）を使うのが基本",
], example="入力 (1,0)=120 → 出力 (2,0)=120。出力 (1,0) には x=0.5 の入力画素が必要だが、整数画素しかないので値が来ない → 穴",
    figures=[fwfig],
    code=r'''import numpy as np

src = np.array([[40, 120, 200],
                [80, 160, 240],
                [20, 100, 180]])
s = 2
out = np.full((6, 6), -1)                 # -1 = まだ値が入っていない
# 順変換：入力画素ごとに行き先を計算して書き込む
for y in range(3):
    for x in range(3):
        xo, yo = int(round(x * s)), int(round(y * s))
        out[yo, xo] = src[y, x]
print(out)
print('穴の数', (out < 0).sum())           # 27 画素が空のまま
# 回転でも穴ができる例（10x10を30°回転）
th = np.deg2rad(30); hit = np.zeros((16, 16), bool)
for y in range(10):
    for x in range(10):
        hit[int(round(x*np.cos(th) - y*np.sin(th))) + 6, int(round(x*np.sin(th) + y*np.cos(th)))] = True
print('回転後の領域内でも当たらない画素がある:', (~hit[6:13, 2:10]).sum())
'''))


def inv_fig2():
    W = 320
    b = [T(55, 12, '入力 3×3', 10), T(220, 12, '逆変換で2倍（6×6）', 10)]
    b.append(grid(src3, 12, 20, 28, 'gray', True))
    b.append(grid(inv, 140, 20, 26, 'gray', True, size=9, hl=[(3, 5)]))
    b.append(R(12 + 2 * 28 + 1, 20 + 1 * 28 + 1, 26, 26, 'none', RED, 2))
    b.append(f"<path d='M {f(140 + 5 * 26 + 13)} {f(20 + 3 * 26 + 2)} C 250 40, 120 0, {f(12 + 2 * 28 + 14)} {f(20 + 1 * 28 + 4)}' fill='none' stroke='{RED}' stroke-width='1.3' stroke-dasharray='4 2'/>")
    b.append(T(160, 194, "出力(5,3) → 入力(2.5,1.5) → 最近傍 (2,1)", 10, fill=RED))
    return svg(W, 200, ''.join(b))


E.append(dict(id='geo-inverse-mapping', steps=[
    "① 出力画像の各画素 (x', y') について、逆変換 (x, y) = T⁻¹(x', y') で『入力のどこを見ればよいか』を計算する",
    "② 例：2倍拡大の逆変換は x = x'/2, y = y'/2。出力 (5, 3) → 入力 (2.5, 1.5)",
    "③ (2.5, 1.5) は画素の間なので補間で値を決める。最近傍なら (2, 1) の 240 を採用（双線形なら周囲4画素の平均的な値）",
    "④ 出力の全画素について必ず1回値が決まるので、順変換のような穴も重複もない",
    "⑤ 出力：すき間のない 6×6 画像。入力範囲外を指す出力画素は背景色（0 など）で埋める",
], example="出力 (0,0)→入力(0,0)=40、(1,0)→(0.5,0)→最近傍(0,0)=40、(2,0)→(1,0)=120…。cv2.warpAffine/warpPerspective/resize は内部で逆変換を使う",
    figures=[{"type": "svg", "svg": inv_fig2(), "caption": '出力側から入力を探しに行くので、穴があかない'}],
    code=r'''import numpy as np
import cv2

src = np.array([[40, 120, 200],
                [80, 160, 240],
                [20, 100, 180]], np.uint8)
M = np.array([[2, 0, 0], [0, 2, 0], [0, 0, 1.0]])    # 順変換（2倍）
Minv = np.linalg.inv(M)                              # 逆変換
out = np.zeros((6, 6), np.uint8)
for yo in range(6):
    for xo in range(6):
        x, y, _ = Minv @ [xo, yo, 1]                 # 出力→入力の位置
        xi, yi = int(np.floor(x + 0.5)), int(np.floor(y + 0.5))  # 最近傍
        if 0 <= xi < 3 and 0 <= yi < 3:
            out[yo, xo] = src[yi, xi]
print(out)
# OpenCV：WARP_INVERSE_MAP を付けると M を『出力→入力』として使う
o2 = cv2.warpAffine(src, Minv[:2].astype(np.float32), (6, 6), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP)
print(o2)
'''))


def resamp_fig():
    W = 300
    b = []
    cs = 30
    ox, oy = 14, 14
    for r in range(5):
        for c_ in range(6):
            b.append(R(ox + c_ * cs, oy + r * cs, cs, cs, '#f4f4f4', '#ccc', 0.6))
            b.append(C(ox + c_ * cs + cs / 2, oy + r * cs + cs / 2, 1.8, '#999'))
    th = math.radians(20)
    for j in range(4):
        for i in range(5):
            x = 0.9 + i * math.cos(th) - j * math.sin(th) + 0.5
            y = 0.4 + i * math.sin(th) + j * math.cos(th)
            b.append(C(ox + x * cs, oy + y * cs, 3, RED))
    b.append(T(ox + 6 * cs + 8, 30, '灰●：入力の', 9, 'start', fill='#666'))
    b.append(T(ox + 6 * cs + 8, 42, '画素中心', 9, 'start', fill='#666'))
    b.append(T(ox + 6 * cs + 8, 70, '赤●：出力画素を', 9, 'start', fill=RED))
    b.append(T(ox + 6 * cs + 8, 82, '逆変換した位置', 9, 'start', fill=RED))
    b.append(T(ox + 6 * cs + 8, 110, '→ 格子からずれた', 9, 'start', fill='#333'))
    b.append(T(ox + 6 * cs + 8, 122, '位置の値を補間', 9, 'start', fill='#333'))
    return svg(W, 190, ''.join(b))


E.append(dict(id='geo-resampling', steps=[
    "① 入力画像は整数格子（灰●）の上にしか値がない",
    "② 出力画像の各画素を逆変換で入力上に戻すと、その位置（赤●）は一般に格子点からずれる。例：20°回転なら (1.4, 0.4), (2.34, 0.74) …",
    "③ 格子点の間の値を、周りの画素から補間して推定する（再標本化＝標本化し直し）",
    "④ 補間法：最近傍（1画素、速いがギザギザ）、双線形（2×2、ぼやける）、双3次（4×4、鮮鋭）、Lanczos（6×6 など）",
    "⑤ 出力：新しい格子で標本化された画像。縮小時はサンプル間隔が粗くなるので先に平滑化しないとエイリアシングが出る",
], example="位置 (2.34, 0.74)：最近傍 → (2,1) の値、双線形 → (2,0),(3,0),(2,1),(3,1) を重み (0.66·0.26),(0.34·0.26),(0.66·0.74),(0.34·0.74) で平均",
    figures=[{"type": "svg", "svg": resamp_fig(), "caption": '回転後の出力画素の位置（赤）は入力格子（灰）に乗らない'}],
    code=r'''import numpy as np
import cv2

img = np.array([[0, 50, 100], [50, 100, 150], [100, 150, 200]], np.float32)
def bilinear(img, x, y):          # 格子点の間 (x, y) の値を補間
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    dx, dy = x - x0, y - y0
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (1-dx)*(1-dy)*a + dx*(1-dy)*b + (1-dx)*dy*c + dx*dy*d
print(bilinear(img, 0.5, 0.5), bilinear(img, 1.25, 0.75))
# OpenCV の remap：出力画素ごとの『入力座標』を地図として与える
mapx = np.float32([[0.5, 1.25]]); mapy = np.float32([[0.5, 0.75]])
print(cv2.remap(img, mapx, mapy, cv2.INTER_LINEAR))
print(cv2.remap(img, mapx, mapy, cv2.INTER_NEAREST))
'''))

s22 = np.array([[50, 200], [100, 250]])
nn = np.kron(s22, np.ones((2, 2), int))
E.append(dict(id='geo-nearest', steps=[
    "① 逆変換で求めた入力位置 (x, y) を四捨五入し、最も近い1画素の値をそのまま使う",
    "② 例：入力位置 (0.6, 0.3) → 最も近い画素 (1, 0) の値",
    "③ 2×2 画像 [[50,200],[100,250]] を2倍拡大すると、各画素が 2×2 のブロックに複製される",
    "④ 新しい画素値を作らない（元にある値しか出ない）ので、ラベル画像・2値画像の変換に向く",
    "⑤ 欠点：拡大でブロック状（モザイク状）、斜め線がギザギザ（ジャギー）。計算は最も速い",
], example="入力 (0.6,0.3) → round → (1,0) = 200。出力 4×4 の左上 2×2 はすべて 50",
    figures=[{"type": "svg", "svg": panels([dict(a=s22, title='入力 2×2', mode='gray', values=True), dict(a=nn, title='最近傍で2倍', mode='gray', values=True)], W=260, cs=30, arrows=['×2']), "caption": '同じ値のブロックになる（値は 50,100,200,250 だけ）'}],
    code=r'''import numpy as np
import cv2

img = np.array([[50, 200], [100, 250]], np.uint8)
# 逆変換＋四捨五入：出力(xo,yo) → 入力 (xo/2, yo/2) に一番近い画素
s = 2
out = np.zeros((4, 4), np.uint8)
for yo in range(4):
    for xo in range(4):
        x = (xo + 0.5) / s - 0.5          # 画素中心をそろえた対応
        y = (yo + 0.5) / s - 0.5
        xi = min(max(int(np.floor(x + 0.5)), 0), 1)
        yi = min(max(int(np.floor(y + 0.5)), 0), 1)
        out[yo, xo] = img[yi, xi]
print(out)
print(cv2.resize(img, (4, 4), interpolation=cv2.INTER_NEAREST))
'''))


def bil_fig():
    W = 300
    b = []
    X = lambda x: 40 + x * 170
    Y = lambda y: 22 + y * 120
    vals = {(0, 0): 10, (1, 0): 20, (0, 1): 30, (1, 1): 40}
    b.append(R(X(0), Y(0), 170, 120, '#f7f7f7', '#999'))
    for (x, y), v in vals.items():
        b.append(C(X(x), Y(y), 4, '#333') + T(X(x) + (-14 if x == 0 else 14), Y(y) + (-6 if y == 0 else 14), str(v), 11, weight='bold'))
    dx, dy = 0.3, 0.6
    top = 10 + dx * 10
    bot = 30 + dx * 10
    val = (1 - dy) * top + dy * bot
    b.append(L(X(dx), Y(0), X(dx), Y(1), BLUE, 1, '3 2'))
    b.append(C(X(dx), Y(0), 3, BLUE) + T(X(dx), Y(0) - 6, f"{f(top)}", 10, fill=BLUE))
    b.append(C(X(dx), Y(1), 3, BLUE) + T(X(dx), Y(1) + 14, f"{f(bot)}", 10, fill=BLUE))
    b.append(C(X(dx), Y(dy), 4.5, RED) + T(X(dx) + 8, Y(dy) + 4, f"P = {f(val)}", 11, 'start', fill=RED, weight='bold'))
    b.append(T(X(0.15), Y(0) + 14, 'dx=0.3', 9, fill='#555'))
    b.append(T(X(dx) - 4, Y(0.3), 'dy=0.6', 9, 'end', fill='#555'))
    b.append(T(W / 2, 168, '①上で横に補間 13 ②下で 33 ③縦に補間 → 25', 10, fill='#333'))
    return svg(W, 176, ''.join(b))


bl = cv2.resize(np.array([[0, 90], [90, 180]], np.uint8), (4, 4), interpolation=cv2.INTER_LINEAR)
E.append(dict(id='geo-bilinear', steps=[
    "① 求める位置 P を囲む 2×2 画素を取り出す。例：左上10, 右上20, 左下30, 右下40、P は左上から dx = 0.3, dy = 0.6",
    "② 上の辺で横方向に線形補間：10·(1−0.3) + 20·0.3 = 13",
    "③ 下の辺で同様に：30·0.7 + 40·0.3 = 33",
    "④ 縦方向に補間：13·(1−0.6) + 33·0.6 = 25 → P = 25",
    "⑤ 一括の式：f = (1−dx)(1−dy)·10 + dx(1−dy)·20 + (1−dx)dy·30 + dx·dy·40。拡大すると滑らかだがエッジは少しぼやける",
], example="重み = 0.7·0.4=0.28, 0.3·0.4=0.12, 0.7·0.6=0.42, 0.3·0.6=0.18（合計1）。0.28·10+0.12·20+0.42·30+0.18·40 = 25",
    figures=[{"type": "svg", "svg": bil_fig(), "caption": '2×2 画素からの双線形補間（横→縦の順に2回の線形補間）'},
             {"type": "svg", "svg": panels([dict(a=[[0, 90], [90, 180]], title='入力 2×2', mode='gray', values=True), dict(a=bl, title='双線形で2倍 (cv2.resize)', mode='gray', values=True)], W=270, cs=28, arrows=['×2']), "caption": '最近傍と違い中間の値が作られる'}],
    code=r'''import numpy as np
import cv2

def bilinear(img, x, y):
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    dx, dy = x - x0, y - y0
    f00, f10 = img[y0, x0], img[y0, x0 + 1]        # 左上, 右上
    f01, f11 = img[y0 + 1, x0], img[y0 + 1, x0 + 1]  # 左下, 右下
    top = (1 - dx) * f00 + dx * f10                # 上の辺で横に補間
    bot = (1 - dx) * f01 + dx * f11                # 下の辺で横に補間
    return (1 - dy) * top + dy * bot               # 縦に補間

img = np.array([[10, 20], [30, 40]], np.float64)
print(bilinear(img, 0.3, 0.6))                     # 25.0
# OpenCV（画素中心をそろえた2倍拡大）
print(cv2.resize(np.array([[0, 90], [90, 180]], np.uint8), (4, 4), interpolation=cv2.INTER_LINEAR))
'''))


def h_cubic(t, a=-1.0):
    t = abs(t)
    if t <= 1:
        return (a + 2) * t ** 3 - (a + 3) * t ** 2 + 1
    if t <= 2:
        return a * t ** 3 - 5 * a * t ** 2 + 8 * a * t - 4 * a
    return 0.0


ts = np.linspace(-2.5, 2.5, 101)
samples = [10, 20, 80, 90]
d = 0.5
ws = [h_cubic(1 + d), h_cubic(d), h_cubic(1 - d), h_cubic(2 - d)]
bc_val = sum(w * s for w, s in zip(ws, samples))
ws5 = [h_cubic(1 + d, -0.5), h_cubic(d, -0.5), h_cubic(1 - d, -0.5), h_cubic(2 - d, -0.5)]
E.append(dict(id='geo-bicubic', steps=[
    "① 求める位置のまわり 4×4 = 16 画素を使う（1次元なら左右2画素ずつ計4画素）",
    "② 各画素との距離 t に応じた重み h(t) を計算。テキストの核：h(t)=|t|³−2|t|²+1（|t|≤1）、−|t|³+5|t|²−8|t|+4（1<|t|≤2）",
    f"③ 1次元の例：画素値 10, 20, 80, 90 の真ん中（20 と 80 の中間、d=0.5）。距離 1.5, 0.5, 0.5, 1.5 → 重み {', '.join(f(w, 4) for w in ws)}",
    f"④ 補間値 = {f(ws[0], 4)}·10 + {f(ws[1], 4)}·20 + {f(ws[2], 4)}·80 + {f(ws[3], 4)}·90 = {f(bc_val, 3)}（双線形なら単純平均 50）",
    "⑤ 2次元では横方向に4回、縦方向に1回この1次元補間を行う。負の重みがあるのでエッジが鋭く出る（わずかなオーバーシュートも）",
], example=f"Keys の a=−0.5 の核では重み {', '.join(f(w, 4) for w in ws5)} → {f(sum(w * s for w, s in zip(ws5, samples)), 3)}。重みの合計はいずれも 1",
    figures=[{"type": "svg", "svg": chart([(ts, [h_cubic(t) for t in ts], BLUE), (ts, [h_cubic(t, -0.5) for t in ts], ORANGE, '4 2'), (ts, [math.sin(math.pi * t) / (math.pi * t) if t else 1 for t in ts], '#aaa', '2 2')], W=300, H=160, xr=(-2.5, 2.5), yr=(-0.25, 1.1), xticks=[-2, -1, 0, 1, 2], yticks=[0, 0.5, 1], xlabel='距離 t', legend=[('a=−1（テキスト）', BLUE), ('a=−0.5', ORANGE), ('sinc', '#aaa')]), "caption": '双3次補間の核 h(t)：sinc を |t|≤2 で近似。1<|t|<2 で負'}],
    code=r'''import numpy as np
import cv2

def h(t, a=-1.0):               # 双3次補間の核（テキストは a=-1）
    t = abs(t)
    if t <= 1: return (a + 2) * t**3 - (a + 3) * t**2 + 1
    if t <= 2: return a * t**3 - 5 * a * t**2 + 8 * a * t - 4 * a
    return 0.0

f = np.array([10, 20, 80, 90], float)   # x = -1, 0, 1, 2 の画素値
x = 0.5                                 # 画素0と1の中間を補間
w = np.array([h(x - k) for k in (-1, 0, 1, 2)])
print(w.round(4), w.sum())              # 重み（合計1、外側は負）
print((w * f).sum())                    # 補間値
# 2次元：OpenCV（内部は a=-0.75）
img = np.array([[10, 20, 80, 90]] * 4, np.uint8)
print(cv2.resize(img, (8, 4), interpolation=cv2.INTER_CUBIC)[0])
'''))


def lanc(x, a):
    if abs(x) >= a:
        return 0.0
    sc = lambda v: 1.0 if v == 0 else math.sin(math.pi * v) / (math.pi * v)
    return sc(x) * sc(x / a)


tl = np.linspace(-3.2, 3.2, 161)
lw = [lanc(0.3 - k, 3) for k in range(-2, 4)]
E.append(dict(id='geo-lanczos', steps=[
    "① 理想的な補間核 sinc(x) = sin(πx)/(πx) は無限に続くので、幅 a の窓 sinc(x/a) を掛けて |x| < a で打ち切る：L(x) = sinc(x)·sinc(x/a)",
    "② Lanczos2 は a=2（4×4 画素）、Lanczos3 は a=3（6×6 画素）を使う",
    f"③ 1次元の例（a=3）：補間位置が画素0から 0.3 ずれているとき、画素 −2〜3 までの6つの重みは {', '.join(f(w, 3) for w in lw)}",
    "④ 重みを正規化（合計1）して画素値と積和を取る。2次元では横→縦の順に行う",
    "⑤ 双3次より高周波をよく残し鮮鋭だが、計算量が多くリンギング（エッジ近くの波打ち）がわずかに出る",
], example=f"重みの合計 = {f(sum(lw), 4)}（正規化して使う）。L(0)=1、L(±1)=L(±2)=0（整数点では元の画素値を通る）",
    figures=[{"type": "svg", "svg": chart([(tl, [lanc(t, 3) for t in tl], BLUE), (tl, [lanc(t, 2) for t in tl], ORANGE, '4 2'), (tl, [math.sin(math.pi * t) / (math.pi * t) if t else 1 for t in tl], '#aaa', '2 2')], W=300, H=160, xr=(-3.2, 3.2), yr=(-0.25, 1.1), xticks=[-3, -2, -1, 0, 1, 2, 3], yticks=[0, 0.5, 1], xlabel='x', legend=[('Lanczos3', BLUE), ('Lanczos2', ORANGE), ('sinc', '#aaa')]), "caption": 'Lanczos 核：sinc に窓 sinc(x/a) を掛けて |x|<a で打ち切る'}],
    code=r'''import numpy as np
import cv2

def lanczos(x, a=3):
    x = np.asarray(x, float)
    return np.where(np.abs(x) < a, np.sinc(x) * np.sinc(x / a), 0.0)  # np.sinc = sin(πx)/(πx)

f = np.array([10, 10, 20, 80, 90, 90], float)   # 画素 -2..3
x = 0.3                                          # 画素0から0.3の位置
k = np.arange(-2, 4)
w = lanczos(x - k)
print(w.round(3), w.sum().round(4))
print((w * f).sum() / w.sum())                   # 正規化して積和
# OpenCV：INTER_LANCZOS4（8×8 画素を使う Lanczos）
img = np.tile(np.array([10, 10, 20, 80, 90, 90], np.uint8), (6, 1))
print(cv2.resize(img, (12, 6), interpolation=cv2.INTER_LANCZOS4)[0])
'''))

stripe = np.tile([0, 255], (6, 3))
dec = stripe[::2, ::2]
avg = stripe.reshape(3, 2, 3, 2).mean(axis=(1, 3)).astype(int)
E.append(dict(id='geo-antialias-downscale', steps=[
    "① 入力：1画素おきの縦縞（0, 255, 0, 255, …）＝最も細かい模様",
    "② 1/2 に間引く（2画素に1画素だけ取る）と偶数列の 0 だけが残り、真っ黒な画像になる＝模様が消える/別の模様に化ける（エイリアシング）",
    "③ 対策：縮小前に平滑化（低域通過フィルタ）して、新しいサンプル間隔では表せない細かい成分を取り除く",
    "④ 例：2×2 の平均を取ってから間引くと (0+255+0+255)/4 = 127.5 → 一様な灰色。『細かい縞を遠くから見た色』として正しい",
    "⑤ 実装：ガウシアンで平滑化→間引き、面積平均法（cv2.INTER_AREA）、画像ピラミッド（cv2.pyrDown）など",
], example="サンプリング定理：縮小率 1/2 なら、元画像の周期2画素未満の成分（ナイキスト周波数の半分超）を事前に除く必要がある。モアレ（縞模様の出現）もエイリアシングの一種",
    figures=[{"type": "svg", "svg": panels([dict(a=stripe, title='入力（縦縞）', mode='gray'), dict(a=dec, title='間引き', mode='gray', values=True), dict(a=avg, title='平均して縮小', mode='gray', values=True)], W=320, cs=17, arrows=['1/2', '']), "caption": '間引くと縞が消えて真っ黒（誤った結果）、平均すると灰色 127'}],
    code=r'''import numpy as np
import cv2

img = np.tile(np.array([0, 255], np.uint8), (6, 3))    # 1画素おきの縦縞 6x6
dec = img[::2, ::2]                                     # 単純な間引き
print(dec)                                              # 全部0 → 縞が消えた
# 平滑化してから間引く（2x2平均）
avg = img.reshape(3, 2, 3, 2).mean(axis=(1, 3))
print(avg)                                              # 127.5 の灰色
# OpenCV
print(cv2.resize(img, (3, 3), interpolation=cv2.INTER_NEAREST))  # 間引きと同じ問題
print(cv2.resize(img, (3, 3), interpolation=cv2.INTER_AREA))     # 面積平均
blur = cv2.GaussianBlur(img, (3, 3), 0)                 # ぼかしてから間引く
print(blur[::2, ::2])
'''))

a66 = np.array([[10, 20, 30, 40, 50, 60], [20, 30, 40, 50, 60, 70], [100, 100, 200, 200, 0, 0], [100, 100, 200, 200, 0, 0], [0, 50, 0, 50, 255, 255], [50, 0, 50, 0, 255, 255]])
ar = a66.reshape(3, 2, 3, 2).mean(axis=(1, 3))
a3 = np.array([[30, 90, 150]])
w32 = cv2.resize(np.array([[30, 90, 150]], np.uint8), (2, 1), interpolation=cv2.INTER_AREA)
E.append(dict(id='geo-area-average', steps=[
    "① 出力1画素を入力画像に逆投影し、その画素が覆う矩形領域を求める",
    "② 1/2 縮小なら出力1画素 = 入力 2×2 画素。例：左上の 2×2 = 10, 20, 20, 30 → 平均 20",
    "③ 縮小率が整数でない場合は、重なる面積で重み付け。例：横 3画素 → 2画素（1.5倍の幅）では、出力0 = 画素0 の全部（面積1）＋画素1 の左半分（0.5）",
    f"④ 値 30, 90, 150 を 2画素に → (30·1 + 90·0.5)/1.5 = 50、(90·0.5 + 150·1)/1.5 = 130",
    "⑤ 平均化が低域通過フィルタとして働き、縮小のエイリアシングが起きにくい。縮小時の定番（cv2.INTER_AREA）",
], example="6×6 → 3×3 の結果：" + ' / '.join(','.join(f(v) for v in r) for r in ar) + f"。cv2.resize で 3→2画素：{list(map(int, w32[0]))}",
    figures=[{"type": "svg", "svg": panels([dict(a=a66, title='入力 6×6', mode='gray', values=True, size=8), dict(a=ar.astype(int), title='面積平均 3×3', mode='gray', values=True)], W=300, cs=22, arrows=['1/2']), "caption": '出力1画素 = 対応する 2×2 画素の平均'}],
    code=r'''import numpy as np
import cv2

def area_resize_1d(f, n_out):
    """1次元の面積平均：出力画素が覆う入力区間 [i*s, (i+1)*s) を面積で重み付け"""
    s = len(f) / n_out
    out = []
    for i in range(n_out):
        a, b = i * s, (i + 1) * s
        w = [max(0, min(b, k + 1) - max(a, k)) for k in range(len(f))]  # 重なり長さ
        out.append(np.dot(w, f) / s)
    return np.array(out)

print(area_resize_1d(np.array([30, 90, 150.]), 2))        # [50, 130]
img = np.array([[10, 20, 30, 40], [20, 30, 40, 50],
                [100, 100, 200, 200], [100, 100, 200, 200]], np.uint8)
print(img.reshape(2, 2, 2, 2).mean(axis=(1, 3)))         # 2x2 平均
print(cv2.resize(img, (2, 2), interpolation=cv2.INTER_AREA))
print(cv2.resize(np.array([[30, 90, 150]], np.uint8), (2, 1), interpolation=cv2.INTER_AREA))
'''))

# 位置合わせ（SSD 探索）
rng = np.random.default_rng(1)
base = (rng.random((12, 12)) * 200).astype(int)
ref = base[2:10, 2:10]
tgt = base[3:11, 4:12]   # (dx,dy)=(2,1) ずれ
ssd = {}
for dy in range(-2, 3):
    for dx in range(-2, 3):
        ssd[(dx, dy)] = int(((base[2 + dy:10 + dy, 2 + dx:10 + dx] - tgt) ** 2).sum()) if 0 <= 2 + dx and 0 <= 2 + dy else None
best = min(ssd, key=lambda k: ssd[k])
tab = [[f"{dy}"] + [f(ssd[(dx, dy)] / 1000, 0) + 'k' if ssd[(dx, dy)] else '0' for dx in range(-2, 3)] for dy in range(-2, 3)]
# 2画像の図
p1 = np.zeros((8, 8), int); p1[2:5, 1:4] = 1; p1[5, 2] = 1
p2 = np.zeros((8, 8), int); p2[3:6, 3:6] = 1; p2[6, 4] = 1
ov = [[('#3a86ff' if p1[r, c] and p2[r, c] else '#9db8ff' if p1[r, c] else '#ffb59e' if p2[r, c] else '#fff') for c in range(8)] for r in range(8)]
E.append(dict(id='geo-registration', steps=[
    "① 入力：基準画像と、少しずれて撮られた対象画像",
    "② 変換モデルを決める（平行移動のみ、相似、アフィン、射影 など）",
    "③ 方法A（面積ベース）：ずらし量 (dx, dy) を変えながら重なり部分の SSD（差の2乗和）を計算し、最小になる位置を探す",
    "④ 方法B（特徴ベース）：コーナーなどの特徴点を対応付け、最小二乗法や RANSAC で変換行列を推定する",
    "⑤ 推定した変換で対象画像をワープすると、基準画像にぴったり重なる（差分画像がほぼ0になる）",
], example=f"乱数画像を (dx,dy)=(2,1) ずらした例：SSD は (2,1) で 0、それ以外では {min(v for k, v in ssd.items() if k != best) // 1000}k 以上 → ずれ (2,1) と推定",
    figures=[{"type": "svg", "svg": panels([dict(a=p1, title='基準', mode='bin'), dict(a=p2, title='対象（ずれ）', mode='bin', colors=[[('#e4572e' if p2[r, c] else '#fff') for c in range(8)] for r in range(8)]), dict(a=p1, title='重ね合わせ', colors=ov)], W=320, cs=12, arrows=['', '']), "caption": '青＝基準、赤＝対象。(dx,dy)=(2,1) 動かすと一致する'},
             {"type": "table", "head": ["dy/dx"] + [f"{dx}" for dx in range(-2, 3)], "rows": tab, "caption": 'ずらし量ごとの SSD（k=1000）。最小(=0)は dx=2, dy=1'}],
    code=r'''import numpy as np
import cv2

rng = np.random.default_rng(1)
base = cv2.GaussianBlur((rng.random((80, 80)) * 200).astype(np.float32), (0, 0), 1)
tgt = base[3:67, 4:68]                      # 対象：(dx,dy)=(2,1) ずれた 64x64
best = None
for dy in range(-2, 3):                     # 総当たりで SSD 最小を探す
    for dx in range(-2, 3):
        ref = base[2 + dy:66 + dy, 2 + dx:66 + dx]
        ssd = ((ref - tgt) ** 2).sum()
        if best is None or ssd < best[0]:
            best = (ssd, dx, dy)
print(best)                                  # (0.0, 2, 1)
# OpenCV：位相限定相関でサブピクセルの平行移動を推定
win = cv2.createHanningWindow((64, 64), cv2.CV_32F)     # 端の影響を減らす窓
(sx, sy), resp = cv2.phaseCorrelate(base[2:66, 2:66], tgt, win)
print(round(sx, 1), round(sy, 1))           # 約(-2,-1)：基準→対象で見た内容の移動量
# 特徴ベースなら cv2.findHomography / cv2.estimateAffine2D を使う
'''))

# DLT
srcd = np.array([[0, 0], [4, 0], [4, 4], [0, 4]], float)
dstd = np.array([[0, 0], [6, 1], [5, 5], [1, 4]], float)
Arows = []
for (x, y), (u, v_) in zip(srcd, dstd):
    Arows.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
    Arows.append([0, 0, 0, -x, -y, -1, v_ * x, v_ * y, v_])
Ad = np.array(Arows)
_, _, Vt = np.linalg.svd(Ad)
hd = Vt[-1] / Vt[-1, -1]
E.append(dict(id='geo-dlt', steps=[
    "① 対応点 (x, y) → (u, v) について、射影変換の式 u = (h11x+h12y+h13)/(h31x+h32y+h33) の分母を払う",
    "② u(h31x+h32y+h33) − (h11x+h12y+h13) = 0、v についても同様 → h について線形な式が1組あたり2本",
    "③ 4組の対応点から 8×9 の行列 A を作り、A·h = 0（h は9要素）を解く。例：(4,0)→(6,1) の行は [−4,0,−1, 0,0,0, 24,0,6] と [0,0,0, −4,0,−1, 4,0,1]",
    "④ ‖h‖=1 の制約のもと、A の特異値分解で最小特異値に対応する右特異ベクトルが解。5組以上でも同じ手順で最小二乗解になる",
    "⑤ h33 = 1 に正規化して 3×3 に並べると H。精度のため座標は事前に正規化（重心を原点、平均距離 √2）するのが定石",
], example="h（h33=1に正規化）= [" + ', '.join(f(x, 4) for x in hd) + "]。cv2.getPerspectiveTransform と同じ結果",
    figures=[{"type": "matrix", "data": [[f(v_, 0) for v_ in r] for r in Ad[2:6]], "label": 'A=', "caption": '8×9 行列 A のうち (4,0)→(6,1) と (4,4)→(5,5) の4行'}, mfig(hd.reshape(3, 3), 'H =', 'SVD の最小特異値ベクトル')],
    code=r'''import numpy as np
import cv2

src = np.array([[0, 0], [4, 0], [4, 4], [0, 4]], float)
dst = np.array([[0, 0], [6, 1], [5, 5], [1, 4]], float)
A = []
for (x, y), (u, v) in zip(src, dst):     # 1組の対応点から2行
    A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
    A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
A = np.array(A)                          # 8x9
_, S, Vt = np.linalg.svd(A)
h = Vt[-1]                               # 最小特異値に対応する右特異ベクトル
H = (h / h[-1]).reshape(3, 3)            # h33=1 に正規化
print(H.round(4))
H_cv, _ = cv2.findHomography(src, dst)   # OpenCV（5組以上なら RANSAC も可）
print(np.allclose(H, H_cv, atol=1e-6))
'''))


def mosaic_fig():
    W = 320
    b = []
    b.append(R(10, 30, 110, 80, '#e7efff', BLUE, 1.5) + T(65, 24, '画像1', 10, fill=BLUE))
    b.append(R(140, 30, 110, 80, '#ffeee7', RED, 1.5) + T(195, 24, '画像2', 10, fill=RED))
    for (x1, y1), (x2, y2) in [((95, 50), (160, 52)), ((100, 85), (166, 80)), ((85, 70), (150, 70))]:
        b.append(C(x1, y1, 3, '#333') + C(x2, y2, 3, '#333') + L(x1, y1, x2, y2, '#2a9d8f', 1, '3 2'))
    b.append(T(130, 124, '対応点 → RANSAC → H を推定', 10, fill=GREEN))
    b.append(arrow(130, 130, 130, 144))
    b.append(R(30, 150, 110, 70, '#e7efff', BLUE, 1.5))
    b.append(P([(110, 146), (230, 156), (226, 224), (106, 218)], '#ffeee7', RED, 1.5, op=0.6))
    b.append(T(70, 188, '画像1', 10, fill=BLUE) + T(185, 192, '画像2をHでワープ', 10, fill=RED))
    b.append(T(125, 236, '重なり部分をブレンド → 1枚のパノラマ', 10))
    return svg(W, 244, ''.join(b))


E.append(dict(id='geo-mosaicing', steps=[
    "① 入力：視野が一部重なるように撮った複数枚の画像（例：カメラを横に振りながら2枚）",
    "② 各画像から特徴点（SIFT, ORB など）を検出し、特徴量で対応付ける",
    "③ 誤対応を RANSAC で除きつつ、画像間の射影変換 H を推定（カメラの回転のみ、または平面シーンなら H で正確に重なる）",
    "④ 一方の画像を H でワープして共通のキャンバスに貼る",
    "⑤ 重なり部分の明るさの差や継ぎ目を、αブレンド・マルチバンドブレンド・シーム探索で目立たなくする → 横長のパノラマ画像",
], example="画像2の点 (10, 50) → H で (310, 52) へ（幅 300 の画像1の右側に並ぶ）。対応点が100組中70組が正しければ RANSAC で正しい H を得られる",
    figures=[{"type": "svg", "svg": mosaic_fig(), "caption": 'パノラマ合成の流れ'}],
    code=r'''import numpy as np
import cv2

# 合成用の画像：大きなシーンから重なりのある2枚を切り出す（100画素重なる）
rng = np.random.default_rng(0)
scene = cv2.GaussianBlur((rng.random((200, 400)) * 255).astype(np.uint8), (0, 0), 3)
scene = cv2.normalize(scene, None, 0, 255, cv2.NORM_MINMAX)
img1, img2 = scene[:, :250], scene[:, 150:]
sift = cv2.SIFT_create()                                   # 特徴点＋特徴量
k1, d1 = sift.detectAndCompute(img1, None)
k2, d2 = sift.detectAndCompute(img2, None)
m = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True).match(d2, d1)
p2 = np.float32([k2[x.queryIdx].pt for x in m])
p1 = np.float32([k1[x.trainIdx].pt for x in m])
H, inl = cv2.findHomography(p2, p1, cv2.RANSAC, 3.0)       # 画像2→画像1 の H
print(len(m), int(inl.sum()), H.round(2))                  # ほぼ x方向+150 の平行移動
pano = cv2.warpPerspective(img2, H, (400, 200))            # 画像2をキャンバスへ
ov = pano[:, 150:250] > 0                                  # 重なり部分は平均（簡易ブレンド）
pano[:, :250] = img1
pano[:, 150:250] = np.where(ov, img1[:, 150:] // 2 + cv2.warpPerspective(img2, H, (400, 200))[:, 150:250] // 2, img1[:, 150:])
print(np.abs(pano.astype(int) - scene).max())              # 元のシーンとほぼ一致
'''))


def dist_fig():
    W = 300
    b = []
    k1 = -0.08
    def dist(x, y):
        r2 = x * x + y * y
        s = 1 + k1 * r2
        return x * s, y * s
    for panel, fn, title in [(0, lambda x, y: (x, y), '理想（歪みなし）'), (1, dist, '樽型歪み k1=−0.08')]:
        ox = 10 + panel * 150
        X = lambda x: ox + 65 + x * 40
        Y = lambda y: 80 - y * 40
        for v in np.linspace(-1.5, 1.5, 5):
            pts = [fn(v, t) for t in np.linspace(-1.5, 1.5, 21)]
            b.append(P([(X(x), Y(y)) for x, y in pts], 'none', BLUE if panel else '#555', 1.2, False))
            pts = [fn(t, v) for t in np.linspace(-1.5, 1.5, 21)]
            b.append(P([(X(x), Y(y)) for x, y in pts], 'none', BLUE if panel else '#555', 1.2, False))
        b.append(T(ox + 65, 160, title, 10))
        if panel:
            xd, yd = dist(1.5, 1.5)
            b.append(C(X(xd), Y(yd), 3, RED) + T(X(xd), Y(yd) - 5, f"({f(xd)},{f(yd)})", 9, fill=RED))
        else:
            b.append(C(X(1.5), Y(1.5), 3, RED) + T(X(1.5), Y(1.5) - 5, '(1.5,1.5)', 9, fill=RED))
    return svg(W, 168, ''.join(b))


E.append(dict(id='geo-lens-distortion', steps=[
    "① 理想座標（ピンホールモデル、画像中心を原点・焦点距離で正規化）を (x, y)、r² = x² + y² とする",
    "② 半径方向歪みモデル：x_d = x(1 + k1r² + k2r⁴)、y_d = y(1 + k1r² + k2r⁴)。k1 < 0 で樽型（外側が縮む）、k1 > 0 で糸巻き型",
    "③ 例 k1 = −0.08：点 (1, 1) は r² = 2 → 倍率 1 − 0.16 = 0.84 → (0.84, 0.84) に写る。(1.5, 1.5) は r²=4.5 → 倍率 0.64 → (0.96, 0.96)。直線の格子が外側ほど内側へ曲がる",
    "④ 補正：チェスボードを何枚か撮って k1, k2（＋接線歪み p1, p2）とカメラ行列を推定（キャリブレーション）",
    "⑤ 出力画像の各画素（理想座標）について歪みモデルで『歪んだ画像のどこか』を計算し、補間して値を取る（逆変換）→ 直線が直線に戻る",
], example="k1=−0.08, 点(1,0)：r²=1 → x_d = 1·(1−0.08) = 0.92。中心(0,0)は動かず、中心から遠いほどずれが大きい（r³ に比例）",
    figures=[{"type": "svg", "svg": dist_fig(), "caption": '格子の直線が樽型に曲がる（中心からの距離で縮み方が変わる）'}],
    code=r'''import numpy as np
import cv2

k1, k2 = -0.08, 0.0
def distort(x, y):                     # 正規化座標での半径方向歪み
    r2 = x * x + y * y
    s = 1 + k1 * r2 + k2 * r2 * r2
    return x * s, y * s
print(distort(1, 0), distort(1, 1))     # (0.92,0) (0.84,0.84)

# 補正：出力(理想)の各画素 → 歪んだ入力の位置を計算して remap
H, W, f = 101, 101, 50.0
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
xn, yn = (xx - 50) / f, (yy - 50) / f   # 正規化座標
xd, yd = distort(xn, yn)
mapx, mapy = (xd * f + 50).astype(np.float32), (yd * f + 50).astype(np.float32)
img = np.zeros((H, W), np.uint8); img[::10, :] = 255
fixed = cv2.remap(img, mapx, mapy, cv2.INTER_LINEAR)
# OpenCV の標準：cv2.undistort(img, K, distCoeffs)（K はカメラ行列）
K = np.array([[f, 0, 50], [0, f, 50], [0, 0, 1]])
print(cv2.undistortPoints(np.float32([[[96, 50]]]), K, np.array([k1, k2, 0, 0])) )
'''))

quad = np.float32([[60, 20], [250, 45], [270, 160], [30, 140]])
rect = np.float32([[0, 0], [210, 0], [210, 297], [0, 297]])
Hp = cv2.getPerspectiveTransform(quad, rect)


def persp_fig():
    W = 320
    b = []
    b.append(R(0, 0, 320, 180, '#f6f6f6', 'none'))
    b.append(P([tuple(p * [0.6, 1] + [0, 6]) for p in quad], '#fff', '#333', 1.5))
    for i, p in enumerate(quad):
        x, y = p * [0.6, 1] + [0, 6]
        b.append(C(x, y, 3, RED) + T(x, y + (-5 if i < 2 else 13), f"({int(p[0])},{int(p[1])})", 9, fill=RED))
    for t in np.linspace(0.25, 0.75, 3):
        a = quad[0] + (quad[1] - quad[0]) * t; c = quad[3] + (quad[2] - quad[3]) * t
        b.append(L(*(a * [0.6, 1] + [0, 6]), *(c * [0.6, 1] + [0, 6]), '#bbb', 0.8))
    b.append(T(95, 175, '斜めから撮った書類', 10))
    b.append(arrow(175, 90, 205, 90, None) + T(190, 82, 'H', 10))
    b.append(R(215, 15, 70, 99, '#fff', BLUE, 1.5))
    for t in np.linspace(0.25, 0.75, 3):
        b.append(L(215 + 70 * t, 15, 215 + 70 * t, 114, '#bbb', 0.8))
    b.append(T(250, 128, '210×297 の長方形', 9, fill=BLUE))
    b.append(T(250, 142, '（A4比率）', 9, fill=BLUE))
    return svg(W, 182, ''.join(b))


E.append(dict(id='geo-perspective-correction', steps=[
    "① 入力：斜めから撮った書類・看板・建物の壁の画像。本来長方形のものが台形〜一般の四角形に写っている",
    "② 四隅の画像座標を指定（手動、または輪郭検出＋多角形近似で自動）。例：(60,20), (250,45), (270,160), (30,140)",
    "③ 出力の長方形の四隅を決める。例：A4 比率で (0,0), (210,0), (210,297), (0,297)",
    "④ 4組の対応点から射影変換 H を計算（cv2.getPerspectiveTransform）し、cv2.warpPerspective で出力画像を作る（内部は逆変換＋補間）",
    "⑤ 出力：正面から撮ったような長方形の画像。平行な罫線が平行に戻る。ただし平面上の物体にしか正しく効かない",
], example=(lambda v: f"入力四角形の中心付近 (150, 90) → H で出力 ({f(v[0] / v[2], 1)}, {f(v[1] / v[2], 1)})。書類の真ん中は画像上の真ん中ではない（遠い側が縮んで写る）")(Hp @ [150, 90, 1]),
    figures=[{"type": "svg", "svg": persp_fig(), "caption": '4隅の対応から射影変換して正面化'}],
    code=r'''import numpy as np
import cv2

img = np.full((180, 300), 200, np.uint8)
quad = np.float32([[60, 20], [250, 45], [270, 160], [30, 140]])   # 写っている四隅
cv2.fillConvexPoly(img, quad.astype(np.int32), 255)              # 白い書類
rect = np.float32([[0, 0], [210, 0], [210, 297], [0, 297]])       # 出力の長方形
H = cv2.getPerspectiveTransform(quad, rect)
out = cv2.warpPerspective(img, H, (210, 297))
print(H.round(4))
print(out.shape, out.mean().round(1))       # ほぼ全面が書類（255）
v = H @ [150, 90, 1]
print((v[:2] / v[2]).round(1))
# 四隅の自動検出：cv2.findContours → cv2.approxPolyDP で4頂点を得る
'''))


def warp_fig():
    W = 300
    b = []
    for panel in range(2):
        ox = 10 + panel * 150
        fn = (lambda x, y: (x, y)) if panel == 0 else (lambda x, y: (x + 0.35 * math.sin(y * 1.2), y + 0.25 * math.sin(x * 1.5)))
        X = lambda x: ox + 14 + x * 23
        Y = lambda y: 15 + y * 25
        for v in range(6):
            b.append(P([(X(a), Y(c)) for a, c in [fn(v, t) for t in np.linspace(0, 5, 26)]], 'none', '#555' if not panel else BLUE, 1, False))
            b.append(P([(X(a), Y(c)) for a, c in [fn(t, v) for t in np.linspace(0, 5, 26)]], 'none', '#555' if not panel else BLUE, 1, False))
        b.append(T(ox + 72, 158, '入力の格子' if not panel else '波状にワープ', 10))
    return svg(W, 166, ''.join(b))


E.append(dict(id='geo-warping', steps=[
    "① 行列1つでは表せない自由な変形（場所ごとに違う移動量）を、座標の写像関数 (x, y) = g(x', y') や“変位マップ”で与える",
    "② 例：x = x' + 0.35·sin(1.2y')、y = y' + 0.25·sin(1.5x') → 直線の格子が波打つ",
    "③ 出力画素ごとに入力位置を計算（逆写像）し、補間して値を取る（cv2.remap）",
    "④ 制御点の移動から変位を補間して作ることもある（区分的アフィン、薄板スプライン TPS など）",
    "⑤ 用途：レンズ歪み補正、顔の変形・修整、モーフィングの形の変形、地図の幾何補正",
], example="出力 (2, 0) → 入力 x = 2 + 0.35·sin(0) = 2, y = 0 + 0.25·sin(3.0) = 0.035。出力 (0, 1.3) → x = 0.35·sin(1.56) = 0.35",
    figures=[{"type": "svg", "svg": warp_fig(), "caption": '正弦波の変位で格子を変形（非線形なワーピング）'}],
    code=r'''import numpy as np
import cv2

H, W = 60, 60
img = np.zeros((H, W), np.uint8); img[::10, :] = 255; img[:, ::10] = 255   # 格子画像
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
# 出力画素 (x', y') ごとに『入力のどこを読むか』の地図を作る
mapx = xx + 3.5 * np.sin(yy / 10 * 1.2)
mapy = yy + 2.5 * np.sin(xx / 10 * 1.5)
out = cv2.remap(img, mapx.astype(np.float32), mapy.astype(np.float32), cv2.INTER_LINEAR)
print(img[:12:2, :12:2] // 255)
print((out[:12:2, :12:2] > 127).astype(int))     # 格子線が曲がっている
print(mapx[0, :3], mapy[13, :3].round(2))
'''))


def morph_fig():
    W = 320
    b = []
    A = np.array([[0, 0], [2, 0], [2, 2], [0, 2]], float)    # 正方形
    B = np.array([[1, -0.2], [2.4, 1.0], [1, 2.4], [-0.4, 1.0]], float)  # ひし形
    for k, (t, col) in enumerate([(0, '#555'), (0.5, GREEN), (1, BLUE)]):
        ox = 15 + k * 105
        P_ = (1 - t) * A + t * B
        X = lambda x: ox + 22 + x * 25
        Y = lambda y: 85 - y * 25
        g = int(200 - 140 * t)
        b.append(P([(X(x), Y(y)) for x, y in P_], f"rgb({g},{g},{g})", col, 1.5))
        for i, (x, y) in enumerate(P_):
            b.append(C(X(x), Y(y), 2.5, RED))
        b.append(T(ox + 47, 118, f"t = {f(t)}", 10, fill=col))
        b.append(T(ox + 47, 132, ['A（明るい正方形）', '中間：形も色も半分', 'B（暗いひし形）'][k], 9))
    b.append(T(160, 12, '制御点（赤）を (1−t)·A + t·B で移動 ＋ 濃淡もクロスディゾルブ', 9, fill='#444'))
    return svg(W, 138, ''.join(b))


E.append(dict(id='geo-morphing', steps=[
    "① 入力：画像 A（例：明るい正方形）と画像 B（暗いひし形）、両者の対応する制御点（目・口の端・角など）",
    "② 時刻 t（0→1）での中間の制御点位置 = (1−t)·A の点 + t·B の点。例：角 (0,0) と (1,−0.2) → t=0.5 で (0.5,−0.1)",
    "③ A を中間形状へ、B も中間形状へワーピング（三角形メッシュの区分的アフィンなど）",
    "④ ワープした2枚をクロスディゾルブ：I_t = (1−t)·A' + t·B'。濃淡 200 と 60 なら t=0.5 で 130",
    "⑤ t を 0, 0.1, …, 1 と変えた画像を並べると、形と色が同時に滑らかに A から B へ変わる動画になる（単なるディゾルブでは二重像になる）",
], example="制御点 (2,2)→(1,2.4)：t=0.25 で (1.75, 2.1)、t=0.5 で (1.5, 2.2)。画素値 200→60：t=0.25 で 165",
    figures=[{"type": "svg", "svg": morph_fig(), "caption": 'モーフィング＝形のワーピング＋値のクロスディゾルブ'}],
    code=r'''import numpy as np
import cv2

A_pts = np.float32([[0, 0], [20, 0], [20, 20]])      # A の制御点（三角形）
B_pts = np.float32([[10, -2], [24, 10], [10, 24]])    # B の対応点
A = np.zeros((30, 30), np.uint8); cv2.fillConvexPoly(A, A_pts.astype(np.int32), 200)
B = np.zeros((30, 30), np.uint8); cv2.fillConvexPoly(B, np.clip(B_pts, 0, 29).astype(np.int32), 60)
for t in (0.0, 0.5, 1.0):
    M_pts = (1 - t) * A_pts + t * B_pts                   # 中間形状
    Wa = cv2.warpAffine(A, cv2.getAffineTransform(A_pts, M_pts), (30, 30))
    Wb = cv2.warpAffine(B, cv2.getAffineTransform(np.float32(B_pts), M_pts), (30, 30))
    I = ((1 - t) * Wa + t * Wb).astype(np.uint8)          # クロスディゾルブ
    print(t, M_pts[1], I.max())                           # 形が移動し、値も200→60へ
'''))

Ag = np.array([[200, 200, 200], [200, 200, 200], [200, 200, 200]])
Bg = np.array([[0, 0, 255], [0, 255, 255], [255, 255, 255]])
cd = [((1 - t) * Ag + t * Bg).round().astype(int) for t in (0, 0.25, 0.5, 1)]
E.append(dict(id='geo-cross-dissolve', steps=[
    "① 入力：同じ大きさの画像 A, B と時刻 t（0 → 1）",
    "② 各画素で I(x,y) = (1 − t)·A(x,y) + t·B(x,y) を計算（形の変形はしない）",
    "③ 例：A=200（灰色一様）、B=0 または 255 の画素：t = 0.25 なら 150 または 214、t = 0.5 なら 100 または 228",
    "④ t を少しずつ増やした画像を連続表示すると A が溶けるように B に変わる（映像のディゾルブ）",
    "⑤ 形の異なる物体どうしでは、途中で両方の輪郭が半透明に重なった二重像になる → 形も合わせたいときはモーフィング",
], example="A=200, B=0：t=0→200、0.25→150、0.5→100、1→0。A=200, B=255：t=0.25 → 0.75·200+0.25·255 = 213.75 ≈ 214",
    figures=[{"type": "svg", "svg": panels([dict(a=cd[0], title='t=0 (A)', mode='gray', values=True, size=9), dict(a=cd[1], title='t=0.25', mode='gray', values=True, size=9), dict(a=cd[2], title='t=0.5', mode='gray', values=True, size=9), dict(a=cd[3], title='t=1 (B)', mode='gray', values=True, size=9)], W=320, cs=22, gap=14), "caption": '各画素で (1−t)·A + t·B'}],
    code=r'''import numpy as np
import cv2

A = np.full((3, 3), 200, np.uint8)                       # 画像A
B = np.array([[0, 0, 255], [0, 255, 255], [255, 255, 255]], np.uint8)
for t in (0, 0.25, 0.5, 1):
    I = ((1 - t) * A.astype(float) + t * B).round().astype(np.uint8)
    print(t, I.ravel())
# OpenCV：cv2.addWeighted(A, 1-t, B, t, 0)
t = 0.25
print(cv2.addWeighted(A, 1 - t, B, t, 0).ravel())
'''))

Fg = np.array([[255, 255, 255, 255], [255, 0, 0, 255], [255, 0, 0, 255], [255, 255, 255, 255]])
Bg2 = np.array([[100, 100, 100, 100], [100, 100, 100, 100], [50, 50, 50, 50], [50, 50, 50, 50]])
al = np.array([[0, 0.5, 0.5, 0], [0.5, 1, 1, 0.5], [0.5, 1, 1, 0.5], [0, 0.5, 0.5, 0]])
Ib = (al * Fg + (1 - al) * Bg2).round().astype(int)
E.append(dict(id='geo-alpha-blending', steps=[
    "① 入力：前景画像 F、背景画像 B、各画素の不透明度 α（0＝透明〜1＝不透明）を持つαマット",
    "② 各画素で I = α·F + (1 − α)·B を計算",
    "③ 例：F=0（黒）, B=100, α=1 → 0（前景そのまま）。α=0.5 なら F=255, B=100 → 177.5 ≈ 178。α=0 なら背景 100",
    "④ αを境界で 0→1 に徐々に変えると、髪の毛や半透明物体の縁が自然になじむ",
    "⑤ 出力：前景が背景の上に重なった合成画像。α一定（例 0.3）なら半透明の重ね書き（透かし）",
], example="左上 F=255, B=100, α=0 → 100。(0,1) F=255, B=100, α=0.5 → 178。(1,1) F=0, α=1 → 0。(2,0) F=255, B=50, α=0.5 → 152.5≈152",
    figures=[{"type": "svg", "svg": panels([dict(a=Fg, title='前景F', mode='gray', values=True, size=8), dict(a=(al * 255).astype(int), title='α（白=1）', mode='gray', values=[[f(v) for v in r] for r in al], size=8), dict(a=Bg2, title='背景B', mode='gray', values=True, size=8), dict(a=Ib, title='αF+(1−α)B', mode='gray', values=True, size=8)], W=320, cs=17, gap=14), "caption": 'αが 0.5 の縁は前景と背景の中間の値になる'}],
    code=r'''import numpy as np
import cv2

F = np.array([[255, 255, 255, 255], [255, 0, 0, 255], [255, 0, 0, 255], [255, 255, 255, 255]], float)
B = np.array([[100] * 4, [100] * 4, [50] * 4, [50] * 4], float)
a = np.array([[0, .5, .5, 0], [.5, 1, 1, .5], [.5, 1, 1, .5], [0, .5, .5, 0]])
I = a * F + (1 - a) * B                    # 画素ごとのαブレンド
print(np.round(I).astype(int))
# αが一定ならOpenCVの addWeighted で同じ計算
print(cv2.addWeighted(F, 0.3, B, 0.7, 0)[0])
'''))

# クロマキー
rgb = np.array([[[30, 200, 40], [35, 210, 45], [30, 205, 50], [28, 198, 42]],
                [[32, 202, 44], [200, 150, 120], [190, 140, 110], [30, 200, 45]],
                [[31, 199, 41], [180, 130, 100], [60, 50, 40], [29, 201, 43]],
                [[30, 203, 46], [33, 200, 40], [30, 207, 44], [31, 198, 40]]])
bgc = np.array([60, 90, 200])
mask = (rgb[..., 1] > rgb[..., 0] + 60) & (rgb[..., 1] > rgb[..., 2] + 60)
comp = np.where(mask[..., None], bgc, rgb)
hexc = lambda a: [[f"rgb({p[0]},{p[1]},{p[2]})" for p in r] for r in a]
E.append(dict(id='geo-chroma-key', steps=[
    "① 入力：一様な緑（または青）の背景の前で撮った前景画像と、合成したい背景画像",
    "② 各画素で『背景色らしさ』を判定。例：G > R + 60 かつ G > B + 60 なら背景（緑）とみなす",
    "③ 例：(30,200,40) → 200 > 90 かつ 200 > 100 → 背景（マスク=1）。人物の肌 (200,150,120) → 150 < 260 → 前景（マスク=0）",
    "④ マスク=1 の画素を新しい背景の画素で置き換える（境界は α を 0〜1 の中間にして αブレンドすると自然）",
    "⑤ 出力：人物が別の背景（青空など）の前にいるような合成画像。前景に背景と同じ色（緑の服）があると抜けてしまう",
], example="判定を HSV の色相 H（緑 ≈ 120°）の範囲で行う方法も一般的。緑かぶり（前景の縁が緑っぽくなる）にはスピル除去を行う",
    figures=[{"type": "svg", "svg": panels([dict(a=np.zeros((4, 4)), title='入力（緑背景）', colors=hexc(rgb)), dict(a=mask.astype(int), title='背景マスク', mode='bin'), dict(a=np.zeros((4, 4)), title='合成結果', colors=hexc(comp))], W=320, cs=22), "caption": '緑の画素（マスク黒）を青い背景に置換'}],
    code=r'''import numpy as np
import cv2

img = np.array([[[30, 200, 40], [35, 210, 45], [30, 205, 50], [28, 198, 42]],
                [[32, 202, 44], [200, 150, 120], [190, 140, 110], [30, 200, 45]],
                [[31, 199, 41], [180, 130, 100], [60, 50, 40], [29, 201, 43]],
                [[30, 203, 46], [33, 200, 40], [30, 207, 44], [31, 198, 40]]], np.int32)  # RGB
R, G, B = img[..., 0], img[..., 1], img[..., 2]
mask = (G > R + 60) & (G > B + 60)            # 緑っぽい画素 = 背景
print(mask.astype(int))
bg = np.array([60, 90, 200])                  # 新しい背景（青）
out = np.where(mask[..., None], bg, img)
print(out[1])
# HSV で判定する場合（OpenCV は BGR 順、H は 0-179）
hsv = cv2.cvtColor(img[..., ::-1].astype(np.uint8), cv2.COLOR_BGR2HSV)
print(cv2.inRange(hsv, (40, 80, 80), (80, 255, 255)) // 255)
'''))

# ポアソン合成 1D
n = 12
tgt1 = np.linspace(40, 180, n)
src1 = np.array([0, 0, 0, 10, 30, 30, 10, 0, 0, 0, 0, 0], float) + 220
lo, hi = 2, 8   # 内部 [lo, hi]
naive = tgt1.copy(); naive[lo:hi + 1] = src1[lo:hi + 1]
# 解：内部で f'' = src'' 、境界 f(lo-1)=tgt, f(hi+1)=tgt
m = hi - lo + 1
A = np.zeros((m, m)); bvec = np.zeros(m)
for i in range(m):
    k = lo + i
    A[i, i] = 2
    lap = 2 * src1[k] - src1[k - 1] - src1[k + 1]
    bvec[i] = lap
    if i > 0: A[i, i - 1] = -1
    else: bvec[i] += tgt1[k - 1]
    if i < m - 1: A[i, i + 1] = -1
    else: bvec[i] += tgt1[k + 1]
sol = np.linalg.solve(A, bvec)
pois = tgt1.copy(); pois[lo:hi + 1] = sol
xs = np.arange(n)
E.append(dict(id='geo-poisson-blending', steps=[
    "① 入力：貼り付けたい領域 Ω の元画像 g（ソース）と、貼り付け先 f*（ターゲット）",
    "② 画素値そのものではなく『勾配（隣との差）』をソースから写す。条件：Ω内で Δf = Δg（ラプラシアンが一致）、Ωの境界で f = f*（ターゲットとつながる）",
    "③ 1次元の例：ターゲットは 40→180 の傾斜、ソースは明るさ 220 前後の山。そのまま貼ると境界で 220 vs 65 の段差ができる",
    "④ 連立一次方程式（ポアソン方程式）を解くと、山の形（勾配）は保ったまま全体の明るさがターゲットに合わせて下がり、境界で段差なくつながる",
    "⑤ 2次元では各画素で 4f(p) − Σ近傍 f(q) = 4g(p) − Σ近傍 g(q) を立てて解く。出力：継ぎ目が見えない合成（色味もなじむ）",
], example=f"境界 x=1 のターゲット {f(tgt1[1], 0)}、そのまま貼ると x=2 は {f(naive[2], 0)}（段差 {f(naive[2] - tgt1[1], 0)}）。ポアソン合成では x=2 が {f(pois[2], 1)}、山の高さ（周囲との差 30）は保存",
    figures=[{"type": "svg", "svg": chart([(xs, tgt1, '#999', '3 2'), (xs, naive, RED), (xs, pois, BLUE)], W=310, H=180, xr=(0, 11), yr=(0, 320), xticks=list(range(0, 12)), yticks=[0, 100, 200], xlabel='画素位置 x（Ω = 2〜8）', legend=[('ターゲット', '#999'), ('そのまま貼る', RED), ('ポアソン', BLUE)], vlines=[(1.5, GREEN, None), (8.5, GREEN, None)]), "caption": '勾配を保ったまま境界値に合わせる → 段差が消える'}],
    code=r'''import numpy as np
import cv2

tgt = np.linspace(40, 180, 12)                     # ターゲット（傾斜）
src = 220 + np.array([0, 0, 0, 10, 30, 30, 10, 0, 0, 0, 0, 0.])  # ソース（山）
lo, hi = 2, 8                                      # 貼り付け領域 Ω
m = hi - lo + 1
A = 2 * np.eye(m) - np.eye(m, k=1) - np.eye(m, k=-1)   # 1次元ラプラシアン
b = np.array([2 * src[k] - src[k - 1] - src[k + 1] for k in range(lo, hi + 1)])
b[0] += tgt[lo - 1]; b[-1] += tgt[hi + 1]          # 境界条件 f = ターゲット
out = tgt.copy(); out[lo:hi + 1] = np.linalg.solve(A, b)
print(out.round(1))
# 2次元：OpenCV の seamlessClone
dst = np.tile(np.linspace(40, 180, 40), (40, 1)).astype(np.uint8)
dst = cv2.merge([dst] * 3)
srcimg = np.full((40, 40, 3), 220, np.uint8); cv2.circle(srcimg, (20, 20), 6, (250, 250, 250), -1)
mask = np.zeros((40, 40), np.uint8); mask[10:30, 10:30] = 255
res = cv2.seamlessClone(srcimg, dst, mask, (20, 20), cv2.NORMAL_CLONE)
print(res[20, 8:32:3, 0])
'''))

# マルチバンド 1D
x = np.arange(64)
imgA = 80 + 30 * (np.sin(x * 1.3) > 0)   # 暗めで細かい模様
imgB = 170 + 30 * (np.sin(x * 1.3 + 1) > 0)
def gauss1d(s, sig):
    k = np.exp(-np.arange(-10, 11) ** 2 / (2 * sig * sig)); k /= k.sum()
    return np.convolve(np.pad(s, 10, mode='edge'), k, 'valid')
lowA, lowB = gauss1d(imgA, 4), gauss1d(imgB, 4)
hiA, hiB = imgA - lowA, imgB - lowB
w_wide = 1 / (1 + np.exp(-(x - 32) / 5.0))
w_nar = (x >= 32).astype(float)
mb = (1 - w_wide) * lowA + w_wide * lowB + (1 - w_nar) * hiA + w_nar * hiB
naive_al = (1 - w_wide) * imgA + w_wide * imgB
E.append(dict(id='geo-multiband-blending', steps=[
    "① 入力：重なり部分で明るさが違う2枚（例：左 80〜110、右 170〜200 で細かい縞模様がある）",
    "② 各画像をラプラシアンピラミッドで周波数帯ごとに分解（低周波＝明るさのうねり、高周波＝細かい模様）",
    "③ 低周波帯は広い遷移幅でゆっくり混ぜる（明るさの差をなめらかに吸収）",
    "④ 高周波帯は狭い遷移幅（ほぼ境界で切り替え）で混ぜる → 模様が二重にならない",
    "⑤ 各帯を合成し直して元に戻す。出力：明るさの段差もなく、細部もくっきりした継ぎ目のない画像（Burt & Adelson 1983）",
], example="単純なαブレンド（遷移幅広い）では重なり部の縞が A と B の二重になり振幅が減る。遷移幅を狭くすると明るさの段差が目立つ → 帯ごとに幅を変えるのが要点",
    figures=[{"type": "svg", "svg": chart([(x[16:49], naive_al[16:49], ORANGE), (x[16:49], mb[16:49], BLUE)], W=320, H=170, xr=(16, 48), yr=(60, 250), xticks=[16, 24, 32, 40, 48], yticks=[80, 120, 160, 200], xlabel='画素位置（境界 x=32）', legend=[('広いαブレンド', ORANGE), ('マルチバンド', BLUE)]), "caption": '低周波は広く、高周波は狭く混ぜる'}],
    code=r'''import numpy as np
import cv2

x = np.arange(64)
A = np.tile(80 + 30 * (np.sin(x * 1.3) > 0), (8, 1)).astype(np.float32)        # 暗い画像
B = np.tile(170 + 30 * (np.sin(x * 1.3 + 1) > 0), (8, 1)).astype(np.float32)   # 明るい画像
mask = np.tile((x >= 32).astype(np.float32), (8, 1))
def lap_pyr(img, n):                          # ラプラシアンピラミッド
    g = [img]
    for _ in range(n): g.append(cv2.pyrDown(g[-1]))
    return [g[i] - cv2.pyrUp(g[i + 1], dstsize=g[i].shape[::-1]) for i in range(n)] + [g[n]]
LA, LB = lap_pyr(A, 3), lap_pyr(B, 3)
GM = [mask]
for _ in range(3): GM.append(cv2.pyrDown(GM[-1]))   # マスクも段々ぼける=低周波ほど広く混ぜる
LS = [m * b + (1 - m) * a for a, b, m in zip(LA, LB, GM)]
out = LS[-1]
for l in LS[-2::-1]: out = cv2.pyrUp(out, dstsize=l.shape[::-1]) + l
print(out[4, 24:40].round(0))
'''))

# シーム探索
cost = np.array([[5, 1, 4, 6, 7], [6, 3, 1, 5, 8], [7, 2, 6, 1, 4], [3, 8, 2, 4, 6], [4, 6, 1, 7, 5]])
Hc, Wc = cost.shape
Mc = cost.astype(float).copy()
for r in range(1, Hc):
    for c_ in range(Wc):
        Mc[r, c_] += min(Mc[r - 1, max(0, c_ - 1):min(Wc, c_ + 2)])
path = [int(np.argmin(Mc[-1]))]
for r in range(Hc - 1, 0, -1):
    c_ = path[-1]
    lo_ = max(0, c_ - 1)
    path.append(lo_ + int(np.argmin(Mc[r - 1, lo_:min(Wc, c_ + 2)])))
path = path[::-1]
hlp = [(r, path[r]) for r in range(Hc)]
E.append(dict(id='geo-seam', steps=[
    "① 2枚の画像の重なり部分で、各画素のコスト＝両画像の差 |A − B|（差が小さい所ほど継ぎ目が目立たない）を計算",
    "② 上の行から下の行へ、累積コスト M(r, c) = cost(r, c) + min(M(r−1, c−1), M(r−1, c), M(r−1, c+1)) を動的計画法で求める",
    f"③ 例：5×5 のコストで最下行の累積コスト = {', '.join(f(v) for v in Mc[-1])} → 最小 {f(Mc[-1].min())} の列から上へ逆にたどる",
    f"④ たどった経路（赤枠）＝列 {path} が最適シーム。この線の左は画像A、右は画像Bを使う",
    "⑤ 出力：差の小さい所を縫うように通る継ぎ目で合成 → 動いた人物の切断や二重像を避けられる（グラフカットで求める方法もある）",
], example=f"1行目のコスト 5,1,4,6,7 → 2行目 c=2 は 1 + min(1,4,6) = 2。累積コスト行列の最下行 {list(map(int, Mc[-1]))}",
    figures=[{"type": "svg", "svg": panels([dict(a=cost, title='コスト |A−B|', mode='val', values=True, hl=hlp), dict(a=Mc.astype(int), title='累積コスト M', mode='val', values=True, hl=hlp)], W=300, cs=24), "caption": '赤枠：累積コスト最小の経路（最適シーム）'}],
    code=r'''import numpy as np

cost = np.array([[5, 1, 4, 6, 7], [6, 3, 1, 5, 8], [7, 2, 6, 1, 4],
                 [3, 8, 2, 4, 6], [4, 6, 1, 7, 5]], float)     # 重なり部の |A-B|
H, W = cost.shape
M = cost.copy()
for r in range(1, H):                       # 動的計画法で累積コスト
    for c in range(W):
        M[r, c] += M[r - 1, max(0, c - 1):c + 2].min()
path = [int(np.argmin(M[-1]))]              # 最下行の最小から逆にたどる
for r in range(H - 1, 0, -1):
    c = path[-1]; lo = max(0, c - 1)
    path.append(lo + int(np.argmin(M[r - 1, lo:c + 2])))
print(M.astype(int))
print('seam columns', path[::-1])
# 合成：各行で seam より左を A、右を B から取る
'''))


def polar_fig():
    W = 320
    b = []
    cx, cy, R0 = 75, 80, 60
    for r in (20, 40, 60):
        b.append(C(cx, cy, r, 'none', BLUE, 1.2))
    for k in range(8):
        a = k * math.pi / 4
        b.append(L(cx, cy, cx + R0 * math.cos(a), cy + R0 * math.sin(a), RED if k == 0 else '#999', 1.4 if k == 0 else 0.8))
    b.append(C(cx + 40, cy, 3.5, GREEN))
    b.append(T(cx, 158, '(x, y) 画像（同心円）', 10))
    b.append(arrow(145, 80, 172, 80, None) + T(158, 72, '極座標', 9))
    ox, oy, w, h = 182, 20, 128, 120
    b.append(R(ox, oy, w, h, '#fff', '#555'))
    for r in (20, 40, 60):
        y = oy + r / 60 * h
        b.append(L(ox, y, ox + w, y, BLUE, 1.2))
    for k in range(8):
        xk = ox + k / 8 * w
        b.append(L(xk, oy, xk, oy + h, RED if k == 0 else '#999', 1.4 if k == 0 else 0.8))
    b.append(C(ox, oy + 40 / 60 * h, 3.5, GREEN))
    b.append(T(ox + w / 2, oy - 5, 'θ →（0〜360°）', 9))
    b.append(T(ox - 4, oy + h / 2, 'r', 10, 'end'))
    b.append(T(ox + w / 2, 158, '(θ, r) 画像（横線）', 10))
    return svg(W, 166, ''.join(b))


E.append(dict(id='geo-polar', steps=[
    "① 中心 (cx, cy) を決め、各点を (r, θ) = (√((x−cx)²+(y−cy)²), atan2(y−cy, x−cx)) で表す",
    "② 出力画像の横軸を θ（0〜360°）、縦軸を r にとる。出力 (θ, r) の値 = 入力 (cx + r cosθ, cy + r sinθ) の値（逆変換＋補間）",
    "③ 同心円 → 横の直線、中心からの放射線 → 縦の直線に変わる",
    "④ 例：中心から右へ 40 画素の点（緑）→ (θ=0°, r=40)。中心まわりの回転は θ 方向の平行移動になる",
    "⑤ 用途：円形の物体（タイヤ・ボトルのふち・CD・虹彩）の文字や傷を、まっすぐな帯に展開して検査",
], example="中心(50,50)、出力 (θ=90°, r=20) → 入力 (50 + 20·cos90°, 50 + 20·sin90°) = (50, 70)。画像座標では y 下向きなので画面上は真下",
    figures=[{"type": "svg", "svg": polar_fig(), "caption": '同心円は横線に、放射線は縦線に'}],
    code=r'''import numpy as np
import cv2

H = W = 101; cx = cy = 50
img = np.zeros((H, W), np.uint8)
for r in (20, 40): cv2.circle(img, (cx, cy), r, 255, 1)       # 同心円
# NumPy：出力 (θ, r) ごとに入力位置を計算して読む（最近傍）
n_th, n_r = 36, 50
th = np.deg2rad(np.arange(n_th) * 10)[None, :]
r = np.arange(n_r)[:, None]
xs = np.round(cx + r * np.cos(th)).astype(int)
ys = np.round(cy + r * np.sin(th)).astype(int)
polar = img[ys, xs]                                           # 縦=r, 横=θ
print(np.where(polar.max(axis=1) > 0)[0])                     # 円がある r 行 → 20, 40 付近
# OpenCV：cv2.warpPolar（出力は 縦=θ, 横=r）
pol = cv2.warpPolar(img, (50, 36), (cx, cy), 50, cv2.WARP_POLAR_LINEAR)
print(pol.shape, np.where(pol.max(axis=0) > 0)[0])
'''))

E.append(dict(id='geo-log-polar', steps=[
    "① 極座標の r を log r に置き換え、出力の座標を (ρ, θ) = (log r, θ) とする",
    "② 中心まわりの回転 θ → θ + α は、出力では θ 方向の平行移動（α だけずれる）",
    "③ 中心基準の拡大 r → s·r は log(s·r) = log r + log s なので、ρ 方向の平行移動（log s だけずれる）",
    "④ 例：2倍に拡大した画像は ρ 方向に log 2 = 0.693 ずれるだけ。30°回転なら θ 方向に 30° ずれるだけ",
    "⑤ 回転・拡大の推定を『平行移動の推定（位相限定相関など）』に置き換えられる（フーリエ振幅スペクトル＋対数極座標＝フーリエ・メリン変換）",
], example="r=10 → ρ=2.303、r=20 → 2.996（差 0.693）、r=40 → 3.689（差 0.693）。拡大率に関係なく同じ量だけずれる",
    figures=[{"type": "svg", "svg": chart([([math.log(10), math.log(20), math.log(40)], [0, 0, 0], BLUE)], W=300, H=110, xr=(2, 4), yr=(-1, 1), xticks=[(math.log(10), 'r=10'), (math.log(20), 'r=20'), (math.log(40), 'r=40')], xlabel='ρ = log r', bottom=30).replace("</svg>", ''.join(C(36 + (math.log(v) - 2) / 2 * 254, 64, 5, RED) + T(36 + (math.log(v) - 2) / 2 * 254, 50, f"{f(math.log(v), 3)}", 10, fill=RED) for v in (10, 20, 40)) + T(150, 22, '×2 ごとに一定量 log2 = 0.693 ずれる', 10, fill='#333') + "</svg>"), "caption": '拡大縮小 → ρ 方向の平行移動'},
             {"type": "table", "head": ["入力の変化", "極座標 (r, θ)", "対数極座標 (log r, θ)"], "rows": [["回転 α", "θ が α ずれる", "θ が α ずれる"], ["拡大 s 倍", "r が s 倍（伸びる）", "log r が log s ずれる"], ["平行移動", "中心がずれ、崩れる", "崩れる（中心が必要）"]]}],
    code=r'''import numpy as np
import cv2

H = W = 129; c = (64, 64)
def ring_img(r):
    im = np.zeros((H, W), np.float32); cv2.circle(im, c, r, 1.0, 2); return im
a, b = ring_img(15), ring_img(30)                 # b は a の2倍拡大
M = W / np.log(64)                                 # ρ方向のスケール（画素/ln）
la = cv2.warpPolar(a, (W, 90), c, 64, cv2.WARP_POLAR_LOG)
lb = cv2.warpPolar(b, (W, 90), c, 64, cv2.WARP_POLAR_LOG)
pa, pb = la.sum(0).argmax(), lb.sum(0).argmax()   # 円がある ρ の位置
print(pa, pb, (pb - pa) / M, np.log(2))           # ずれ ≈ log 2
# 平行移動量として位相限定相関で推定
(sx, sy), _ = cv2.phaseCorrelate(la, lb)
print('scale ≈', np.exp(sx / M).round(2))
'''))

mesh_src = np.float32([[0, 0], [4, 0], [0, 4], [4, 4], [2, 2]])
mesh_dst = np.float32([[0, 0], [4, 0], [0, 4], [4, 4], [2.8, 2.6]])
tris = [(0, 1, 4), (1, 3, 4), (3, 2, 4), (2, 0, 4)]
Am = cv2.getAffineTransform(mesh_src[[0, 1, 4]], mesh_dst[[0, 1, 4]])


def mesh_fig():
    W = 300
    b = []
    for k, (pts, title) in enumerate([(mesh_src, '変形前の三角形メッシュ'), (mesh_dst, '中央の点を動かした後')]):
        ox = 15 + k * 150
        X = lambda x: ox + 10 + x * 28
        Y = lambda y: 142 - y * 28
        for i, t in enumerate(tris):
            b.append(P([(X(pts[j][0]), Y(pts[j][1])) for j in t], ['#e7efff', '#ffeee7', '#e7fff4', '#fff7e0'][i], '#555', 1))
        for j, p in enumerate(pts):
            b.append(C(X(p[0]), Y(p[1]), 3, RED if j == 4 else '#333'))
        b.append(T(ox + 66, 162, title, 10))
    b.append(T(150, 13, '中央 (2,2) → (2.8,2.6)：4つの三角形が別々のアフィン変換', 9, fill='#444'))
    return svg(W, 168, ''.join(b))


E.append(dict(id='geo-mesh-warping', steps=[
    "① 入力画像と出力画像に対応する制御点を置き、点を結んで三角形メッシュを作る（ドロネー三角形分割など）",
    "② 各三角形ごとに、3頂点の対応からアフィン変換（6未知数）を1つ求める",
    "③ 例：下の三角形 (0,0),(4,0),(2,2) → (0,0),(4,0),(2.8,2.6)。行列 " + str([[f(v, 3) for v in r] for r in Am]),
    "④ 出力画素がどの三角形に入るかを判定し、その三角形の逆アフィン変換で入力位置を求めて補間",
    "⑤ 三角形の辺は隣と共有されるので、つなぎ目で画像が切れない連続な変形になる（顔のモーフィングなどで使う）",
], example=(lambda v: f"下の三角形の重心 (2, 0.67) → ({f(v[0])}, {f(v[1])})。辺 (0,0)-(4,0) 上の点は動かない（隣の三角形と一致）")(Am @ [2, 2 / 3, 1]),
    figures=[{"type": "svg", "svg": mesh_fig(), "caption": '三角形ごとに区分的なアフィン変換'}],
    code=r'''import numpy as np
import cv2

src = np.float32([[0, 0], [40, 0], [0, 40], [40, 40], [20, 20]])
dst = np.float32([[0, 0], [40, 0], [0, 40], [40, 40], [28, 26]])   # 中央の点だけ移動
tris = [(0, 1, 4), (1, 3, 4), (3, 2, 4), (2, 0, 4)]
img = np.zeros((41, 41), np.uint8); img[::8, :] = 255; img[:, ::8] = 255
out = np.zeros_like(img)
for t in tris:
    M = cv2.getAffineTransform(src[list(t)], dst[list(t)])     # 三角形ごとのアフィン
    warped = cv2.warpAffine(img, M, (41, 41))
    mask = np.zeros_like(img)
    cv2.fillConvexPoly(mask, dst[list(t)].astype(np.int32), 1)  # 出力側の三角形内だけ
    out[mask == 1] = warped[mask == 1]
    print(t, M.round(3).tolist())
print((out[::4, ::4] > 127).astype(int))
'''))

if __name__ == '__main__':
    finalize('geo', E, run='--norun' not in sys.argv)
