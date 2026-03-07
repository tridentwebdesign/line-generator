# SVG Line Generator

Illustratorの「ブレンド」に着想を得た、流線型の抽象ラインアートをブラウザ上でリアルタイム生成・調整・書き出しできるWebジェネレーターです。

**🔗 Live Demo → [tridentwebdesign.github.io/line-generator](https://tridentwebdesign.github.io/line-generator/)**

![SVG Line Generator screenshot](https://tridentwebdesign.github.io/line-generator/og-image.png)

---

## 特徴

- **Illustratorブレンド風アルゴリズム** — 2本の境界曲線を補間して、束のようなライン群を生成
- **マルチレイヤー** — 複数のラインセットを重ねて複雑なビジュアルを構成
- **角度調整** — レイヤーごとに回転角を設定、自動スケーリングで画面端まで埋め尽くす
- **15項目のリアルタイムパラメーター** — スライダー操作で即時反映
- **5つのプリセット** — 一発で雰囲気を切り替え
- **SVG / PNG 書き出し** — 1920×1080px の高品質エクスポート
- **背景ライブラリ書き出し** — 現在の設定をそのまま埋め込み可能なHTMLファイルとしてダウンロード
- **アニメーション** — ゆっくり呼吸するような変形をON/OFF
- **ビルド不要** — `index.html` をブラウザで開くだけで動作

---

## 使い方

### ローカルで開く

```bash
git clone https://github.com/tridentwebdesign/line-generator.git
cd line-generator
open index.html   # macOS
```

サーバーなしで動作します。

### GitHub Pages

`https://tridentwebdesign.github.io/line-generator/` にアクセスするだけです。

---

## パラメーター

### STRUCTURE（構造）

| パラメーター | 説明 |
|---|---|
| Line Count | ラインの本数（増やすほど密に） |
| Smoothness | 1本の曲線を構成する制御点の数（増やすほど滑らか） |
| Stroke Width | 線の太さ |

### SHAPE（形状）

| パラメーター | 説明 |
|---|---|
| Amplitude | 波の振れ幅（高さ） |
| Tension | 波の周波数（高いほど細かく波打つ） |
| Spread | ライン束の縦方向の広がり |
| Noise | 各制御点に加えるランダムな揺らぎ量 |
| Angle ° | レイヤーの回転角度（−180 〜 180°） |

### COLOUR（カラー）

| パラメーター | 説明 |
|---|---|
| Hue Start / End | グラデーションの開始・終了色相（0〜360°） |
| Saturation | 彩度 |
| Lightness | 明度 |
| Opacity | 透明度 |

### ANIMATION（アニメーション）

| パラメーター | 説明 |
|---|---|
| Speed | アニメーションの速さ |
| Strength | アニメーションによる形状変化の強さ |

---

## プリセット

| プリセット | 特徴 |
|---|---|
| Calm Wave | 青〜紫の穏やかな波。ダーク背景 |
| Ribbon Flow | 暖色系レインボーの大きな曲線束 |
| Dense Blend | 高密度・細線の繊細な水色グラデーション |
| Aurora Lines | 緑〜紫のオーロラ風。広がりのある波 |
| Minimal Contour | 少ない本数で力強い輪郭線 |

---

## レイヤー機能

サイドバー上部の **LAYERS** パネルでレイヤーを管理できます。

- **＋** ボタンで新規レイヤーを追加（色相を自動シフト）
- レイヤー行をクリックしてアクティブ切り替え
- 👁 アイコンで表示・非表示トグル
- レイヤー名をダブルクリックしてインライン編集
- 各レイヤーが独自のパラメーター・角度・プリセットを保持

異なるプリセットを持つレイヤーを重ねたり、角度を変えたレイヤーを組み合わせると複雑なビジュアルを作れます。

---

## 背景ライブラリとして使う

サイドバー下部の **↓ 背景ライブラリ** ボタンを押すと、現在表示中のレイヤー設定をすべて含んだ自己完結型の `line-bg.html` がダウンロードされます。このファイルを使えば、任意のWebサイトにアニメーション付きのライン背景を埋め込めます。

### 埋め込み方法

#### 方法1: iframe で埋め込む

ダウンロードした `line-bg.html` をサイトのルートに配置し、次のコードをHTMLに追加します。

```html
<iframe
  src="line-bg.html"
  style="position:fixed; inset:0; width:100%; height:100%;
         border:none; z-index:-1; pointer-events:none">
</iframe>
```

ページ全体の背景としてアニメーションが表示されます。`z-index` を調整すれば重なり順を変更できます。

#### 方法2: コードをコピーして埋め込む

`line-bg.html` を開き、`<div id="slg-bg"></div>` と `<script>...</script>` 部分を既存のHTMLにコピーします。CSSで `#slg-bg` の位置やサイズを制御できます。

```html
<!-- 背景コンテナ -->
<div id="slg-bg" style="position:fixed; inset:0; z-index:-1;"></div>

<!-- line-bg.html の <script> 内容をここにコピー -->
<script>
  // SLG runtime (line-bg.html からコピー)
</script>

<!-- 通常のページコンテンツ -->
<main style="position:relative; z-index:1;">
  <h1>サイトコンテンツ</h1>
</main>
```

### JavaScript API

エクスポートされたファイルはグローバル変数 `SLG` を公開します。

```javascript
SLG.stop();   // アニメーションを停止
SLG.start();  // アニメーションを再開
SLG.layers;   // レイヤー設定の配列（読み取り専用参照）
```

### パラメーターのカスタマイズ

`line-bg.html` 内の `LAYERS` 変数（JSON配列）を直接編集すれば、ジェネレーターを使わなくても設定を調整できます。各レイヤーの `params` オブジェクトには上記パラメーターと同じキーが含まれています。

```javascript
var LAYERS = [
  {
    "params": {
      "lineCount": 62,      // ライン数
      "steps": 22,           // なめらかさ
      "strokeWidth": 1.9,    // 線の太さ
      "amplitude": 0.15,     // 振幅
      "tension": 3.0,        // テンション
      "spread": 0.15,        // 広がり
      "noiseAmount": 0.024,  // ノイズ量
      "angle": -18,          // 角度
      "hueStart": 9,         // 色相（開始）
      "hueEnd": 273,         // 色相（終了）
      "saturation": 59,      // 彩度
      "lightness": 62,       // 明度
      "opacity": 0.68,       // 不透明度
      "backgroundColor": "#ffffff",
      "animationSpeed": 1.0,
      "animationStrength": 0.40
    }
  }
];
```

---

## アルゴリズム

```
Boundary A (上端): yA(x) = centerA + wave_A(x, time) × amplitude
Boundary B (下端): yB(x) = centerB + wave_B(x, time) × amplitude
Line i           : y(x)  = lerp(yA, yB, i / (lineCount − 1))
```

各境界曲線は2ハーモニック波（基本波 + 倍音）で構成し、A と B の位相を約0.45rad ずらすことで収束・発散するライン束を生成します。各制御点にスムーズノイズを加え、完全な規則性を崩した有機的な印象を与えます。

角度変換には `vector-effect="non-scaling-stroke"` を使用し、回転・スケール変換後もストローク幅が一定に保たれます。

---

## ファイル構成

```
line-generator/
├── index.html          # エントリーポイント
├── css/
│   └── style.css       # レイアウト・UIスタイル
└── js/
    ├── generator.js    # コア数学・SVGパス生成（純粋関数）
    ├── app.js          # 状態管理・レンダーループ・レイヤー操作
    ├── ui.js           # コントロールパネル・プリセット・レイヤーUI
    └── export.js       # SVG / PNG / 背景ライブラリ ダウンロード
```

---

## 技術スタック

- **HTML / CSS / JavaScript** のみ（フレームワーク・ライブラリなし）
- **SVG** をメイン出力フォーマットとして使用
- ビルドツール不要、サーバー不要

---

## ライセンス

MIT License — 商用利用・改変・再配布自由です。
