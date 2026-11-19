# 画像処理エキスパート特訓（Android アプリ）

CG-ARTS 画像処理エンジニア検定エキスパート対策の、スマホで片手で使う問題集＋用語辞書です。

- 用語辞書 856語（定義・試験のポイント・式・歴史・紛らわしい概念との違い・関連用語リンク）
- 問題 957問（知財100・撮影55・色/視覚81・濃淡46・フィルタ59・周波数52・復元50・幾何55・2値57・領域48・検出65・認識79・3次元72・動画43・符号化63・システム32）
- 自動生成問題 29種（画素を実際に計算して図・数値を毎回作る）
- 用語カード（用語→説明／説明→用語）は全用語から自動で作る

## インストール
1. スマホのブラウザで https://github.com/RyuKurihara/ryubox/releases/tag/gazo-expert-latest を開く
2. `gazo-expert-latest.apk` をタップしてダウンロード
3. 「提供元不明のアプリ」のインストールを許可してインストール
4. 更新：同じ手順で上書きインストール（署名が固定なので学習記録は消えない）

## 開発
- `content/terms/*.json`, `content/questions/*.json` が教材（仕様は `docs/CONTENT_SPEC.md`）
- `node tools/build.mjs` で検証して `www/js/data.js` を作る。`www/index.html` をブラウザで開けばそのまま動く
- `npx cap sync android` → `android/` を Gradle でビルド（CI: `.github/workflows/gazo-expert-apk.yml`）
- 設計メモ：`docs/DESIGN.md`
