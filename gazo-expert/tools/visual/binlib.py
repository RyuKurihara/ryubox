# 2値画像処理の素朴な実装（図の数値を実計算するため）
import numpy as np
import math

SQ = np.ones((3, 3), int)
CROSS = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])


def A(s):
    """'0110\n...' 形式の文字列から配列"""
    return np.array([[int(ch) for ch in ln.strip()] for ln in s.strip().splitlines()])


def dil(a, se=SQ):
    a = np.asarray(a); H, W = a.shape; k = se.shape[0] // 2
    p = np.pad(a, k)
    out = np.zeros_like(a)
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            if se[dy + k, dx + k]:
                out |= p[k + dy:k + dy + H, k + dx:k + dx + W]
    return out


def ero(a, se=SQ):
    a = np.asarray(a); H, W = a.shape; k = se.shape[0] // 2
    p = np.pad(a, k)
    out = np.ones_like(a)
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            if se[dy + k, dx + k]:
                out &= p[k + dy:k + dy + H, k + dx:k + dx + W]
    return out


def opn(a, se=SQ):
    return dil(ero(a, se), se)


def cls(a, se=SQ):
    return ero(dil(a, se), se)


def label(a, conn=8, return_first=False):
    a = np.asarray(a); H, W = a.shape
    L = np.zeros((H, W), int); parent = [0]
    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1)] if conn == 8 else [(-1, 0), (0, -1)]
    for y in range(H):
        for x in range(W):
            if not a[y, x]:
                continue
            ls = [L[y + dy, x + dx] for dy, dx in nb if 0 <= y + dy < H and 0 <= x + dx < W and L[y + dy, x + dx]]
            if not ls:
                parent.append(len(parent)); L[y, x] = len(parent) - 1
            else:
                m = min(find(l) for l in ls)
                L[y, x] = min(ls)
                for l in ls:
                    r = find(l)
                    if r != m:
                        parent[max(r, m)] = min(r, m)
    first = L.copy()
    roots = {}
    lut = {}
    for l in range(1, len(parent)):
        r = find(l)
        if r not in roots:
            roots[r] = len(roots) + 1
        lut[l] = roots[r]
    out = np.vectorize(lambda v: lut.get(v, 0))(L) if len(parent) > 1 else L
    if return_first:
        return out, first, lut
    return out


def n_comp(a, conn=8):
    return int(label(a, conn).max())


def holes(a, fg_conn=8):
    """穴 = 画像の外周につながらない背景の連結成分（背景は fg と逆の連結性）"""
    bg = 1 - np.asarray(a)
    bgp = np.pad(bg, 1, constant_values=1)
    Lb = label(bgp, 4 if fg_conn == 8 else 8)
    outer = Lb[0, 0]
    return int(len(set(Lb[Lb > 0].ravel()) - {outer})), Lb[1:-1, 1:-1], outer


def dist(a, metric='city'):
    a = np.asarray(a); H, W = a.shape
    INF = 10 ** 6
    if metric == 'euclid':
        bg = np.argwhere(np.pad(a, 1) == 0) - 1
        D = np.zeros((H, W))
        for y in range(H):
            for x in range(W):
                if a[y, x]:
                    D[y, x] = np.sqrt(((bg - [y, x]) ** 2).sum(1)).min()
        return D
    wa, wb = {'city': (1, 2), 'chess': (1, 1), 'chamfer': (3, 4)}[metric]
    D = np.where(np.pad(a, 1) > 0, INF, 0).astype(int)
    fw = [(-1, -1, wb), (-1, 0, wa), (-1, 1, wb), (0, -1, wa)]
    for y in range(1, H + 1):
        for x in range(1, W + 1):
            if D[y, x]:
                D[y, x] = min([D[y, x]] + [D[y + dy, x + dx] + w for dy, dx, w in fw])
    for y in range(H, 0, -1):
        for x in range(W, 0, -1):
            if D[y, x]:
                D[y, x] = min([D[y, x]] + [D[y - dy, x - dx] + w for dy, dx, w in fw])
    return D[1:-1, 1:-1]


def zhang_suen(a, record=False):
    img = np.pad(np.asarray(a).copy(), 1)
    hist = []
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            dele = []
            for y in range(1, img.shape[0] - 1):
                for x in range(1, img.shape[1] - 1):
                    if img[y, x] != 1:
                        continue
                    P = [img[y - 1, x], img[y - 1, x + 1], img[y, x + 1], img[y + 1, x + 1], img[y + 1, x], img[y + 1, x - 1], img[y, x - 1], img[y - 1, x - 1]]  # P2..P9
                    B = sum(P)
                    Aa = sum((P[i] == 0 and P[(i + 1) % 8] == 1) for i in range(8))
                    p2, p3, p4, p5, p6, p7, p8, p9 = P
                    if step == 0:
                        c = p2 * p4 * p6 == 0 and p4 * p6 * p8 == 0
                    else:
                        c = p2 * p4 * p8 == 0 and p2 * p6 * p8 == 0
                    if 2 <= B <= 6 and Aa == 1 and c:
                        dele.append((y, x))
            for y, x in dele:
                img[y, x] = 0
            if dele:
                changed = True
            hist.append([(y - 1, x - 1) for y, x in dele])
    out = img[1:-1, 1:-1]
    return (out, hist) if record else out


def nc8(nb):
    """連結数（8連結）。nb = [x1..x8]：x1=右から反時計回り"""
    xb = [1 - v for v in nb] + [1 - nb[0]]
    s = 0
    for k in (0, 2, 4, 6):
        s += xb[k] - xb[k] * xb[k + 1] * xb[(k + 2) % 8 if k + 2 < 8 else 8]
    return s


def nc4(nb):
    x = list(nb) + [nb[0]]
    s = 0
    for k in (0, 2, 4, 6):
        s += x[k] - x[k] * x[k + 1] * x[(k + 2) if k + 2 < 8 else 8]
    return s


def nbs(img, y, x):
    """x1=右, x2=右上, x3=上, x4=左上, x5=左, x6=左下, x7=下, x8=右下"""
    return [img[y, x + 1], img[y - 1, x + 1], img[y - 1, x], img[y - 1, x - 1], img[y, x - 1], img[y + 1, x - 1], img[y + 1, x], img[y + 1, x + 1]]


def hilditch(a):
    img = np.pad(np.asarray(a).copy(), 1).astype(int)
    while True:
        cnt = 0
        for y in range(1, img.shape[0] - 1):
            for x in range(1, img.shape[1] - 1):
                if img[y, x] != 1:
                    continue
                nb = nbs(img, y, x)
                # 1: 境界点（4近傍に0がある）
                if not any(nb[k] == 0 for k in (0, 2, 4, 6)):
                    continue
                # 2: 端点でない（近傍の1（削除予定含む）が2つ以上）
                if sum(abs(v) for v in nb) < 2:
                    continue
                # 3: 孤立点でない（削除予定でない1が1つ以上）
                if sum(v == 1 for v in nb) < 1:
                    continue
                # 4: 連結性を保存（削除予定を1とみなして連結数1）
                if nc8([1 if v != 0 else 0 for v in nb]) != 1:
                    continue
                # 5: 線幅2の線が消えないように：削除予定の各近傍を0とみなしても連結数1
                ok = True
                for k in range(8):
                    if nb[k] == -1:
                        t = [1 if v != 0 else 0 for v in nb]; t[k] = 0
                        if nc8(t) != 1:
                            ok = False; break
                if not ok:
                    continue
                img[y, x] = -1; cnt += 1
        img[img == -1] = 0
        if cnt == 0:
            break
    return img[1:-1, 1:-1]


DIRS8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]  # (dy,dx) コード0..7（0=右、反時計回り）


def trace(a):
    """Moore 近傍追跡（8連結）。始点はラスタ走査で最初の1画素。反時計回り（画面上）に巡る列を返す"""
    a = np.pad(np.asarray(a), 1)
    ys, xs = np.nonzero(a)
    start = (ys[0], xs[0])
    pts = [start]; codes = []
    cur = start
    d = 5  # 直前の探索開始方向（始点の左下方向から）
    # 画面上で反時計回り = 外輪郭を左手に… 慣例として最初は左下方向から反時計回りに調べる
    while True:
        found = False
        for i in range(8):
            k = (d + i) % 8
            ny, nx = cur[0] + DIRS8[k][0], cur[1] + DIRS8[k][1]
            if a[ny, nx]:
                codes.append(k)
                cur = (ny, nx)
                d = (k + 6) % 8 if k % 2 == 0 else (k + 5) % 8  # 次の探索開始方向
                found = True
                break
        if not found:
            break
        if cur == start and len(pts) > 1:
            break
        pts.append(cur)
        if len(pts) > 4 * a.size:
            break
    return [(y - 1, x - 1) for y, x in pts], codes


def moments(a):
    a = np.asarray(a)
    ys, xs = np.nonzero(a)
    m = lambda p, q: float((xs ** p * ys ** q).sum())
    m00 = m(0, 0); xg, yg = m(1, 0) / m00, m(0, 1) / m00
    mu = lambda p, q: float((((xs - xg) ** p) * ((ys - yg) ** q)).sum())
    return dict(m00=m00, m10=m(1, 0), m01=m(0, 1), xg=xg, yg=yg, mu20=mu(2, 0), mu02=mu(0, 2), mu11=mu(1, 1), m20=m(2, 0), m02=m(0, 2), m11=m(1, 1))


def perim_chain(codes):
    ev = sum(1 for c in codes if c % 2 == 0); od = len(codes) - ev
    return ev, od, ev + od * math.sqrt(2)


def crack_len(a):
    p = np.pad(np.asarray(a), 1)
    return int((np.abs(np.diff(p, axis=0))).sum() + (np.abs(np.diff(p, axis=1))).sum())


def border_pixels(a, conn=8):
    """境界画素：8連結図形なら 4近傍に背景がある画素"""
    a = np.asarray(a)
    e = ero(a, CROSS if conn == 8 else SQ)
    return a - e
