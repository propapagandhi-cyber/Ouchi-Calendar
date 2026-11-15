# Ouchi-Calendar — impl

実装。仕様は `../spec/`（SSOT）を参照。値は spec から転記し、食い違えば **spec を正**とする。
ビルド工程・外部ライブラリなし。`web/` がそのまま GitHub Pages で配信される。

## 起動・テスト

```bash
python -m http.server 8080 -d impl/web     # → http://localhost:8080/
node --test impl/tests/*.test.mjs          # ロジックのテスト（依存なし）
python impl/tools/make_icons.py            # アイコン再生成（Pillow）
```

ブラウザのコンソールで `window.__ouchi` からアプリの状態を確認できる（デバッグ用）。

## ディレクトリ構成

```
web/                         ← GitHub Pages の配信物
  index.html  manifest.webmanifest  sw.js（オフライン用キャッシュ）
  css/app.css
  icons/                     ← make_icons.py で生成
  js/
    config.js                設定値（spec/software.md §設定値）
    dateutil.js              'YYYY-MM-DD' 文字列の日付計算
    holidays.js              日本の祝日
    recurrence.js            くりかえし展開・例外・表示文言       ← spec B-2
    eventops.js              お休み／この日だけ／この日から先 の変換 ← spec B-2
    model.js                 スキーマ正規化・マージ・レコード操作  ← spec/interface/data-schema.md
    store/local.js           localStorage
    store/github.js          GitHub Contents API・接続コード
    store/sync.js            同期エンジン＋タイミング管理         ← spec B-4
    ui/dom.js                h()・シート（戻るボタン連動）・トースト ← spec B-5
    ui/icons.js              SVG アイコン
    ui/views.js              月・週・日・やること                ← spec B-1, B-3
    ui/editor.js             詳細・予定入力・やること入力シート
    ui/settings.js           設定シート
    main.js                  画面状態・操作・同期の配線
tests/                       node --test（Mock で GitHub API を置換）
tools/make_icons.py
```

## 変更時の注意

- `web/` にファイルを足したら `web/sw.js` の `ASSETS` に追加し、`CACHE` の版を上げる。
- `config.js` の `APP.version` も上げる（設定画面に表示）。
- data.json の形を変えるときは `SCHEMA_VERSION` を上げ、`model.js` の `normalize()` に移行処理を書く。
