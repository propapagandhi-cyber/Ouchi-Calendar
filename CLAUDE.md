# Claude Code 向け指示書（Ouchi-Calendar / おうちカレンダー）

本リポジトリは `spec/`（仕様＝SSOT）と `impl/`（実装）を統合した mono-repo。**最初にこのファイルを読むこと。**
**プランモードは使わない。** 計画・仕様・作業台帳は本リポのドキュメントで管理する（→ 末尾「運用ループ」）。

## プロジェクトの前提

- ドメイン: 家族（ママ・長男・次男）の予定とやることを共有する、スマホ向けのシンプルな家族カレンダー（Web アプリ / PWA）。
- 対象: **主ユーザーはママ（スマホ操作に詳しくない）**。端末は Pixel 10（Android Chrome）。パパは PC ブラウザから閲覧・編集。
- スコープ: Claude Code が書くのは静的 Web アプリ（`impl/web/`）と GitHub Pages 配信設定。サーバー・ネイティブアプリは含めない。
- データ: アプリ本体は公開リポジトリ（GitHub Pages）、予定データは**別の非公開リポジトリ**の `data.json`（GitHub Contents API 経由）。

## ハードルール（不変条件・必ず守る）

1. **仕様（`spec/`）の値はハードコードしない。** メンバー初期値・色・既定時刻・同期間隔などは `impl/web/js/config.js` に集約し、各モジュールはそこから読む。
2. **公開リポジトリに個人データ・トークンを置かない。** 予定データは非公開データリポジトリのみ。テスト・サンプルにも実名を書かない。
3. **データスキーマは後方互換を保つ。** 形を変えるときは `schema` 番号を上げ、`model.js` の `normalize()` に移行処理を書く。古い `data.json` を壊さない。
4. **削除は論理削除（`deleted: true` ＋ `updatedAt`）。** 同期マージは「レコード単位・`updatedAt` が新しい方が勝つ」。この前提を崩さない。
5. **画面の文字は日本語・やさしい言葉**（例：「保存する」「この日はお休み」）。コード・コメント・ログは英語。
6. **操作しやすさ（R-10/R-11）を下げる変更をしない。** タップ領域 48px 以上、基本文字 17px 以上、アイコンだけのボタンを作らない、Android の「戻る」で開いているシートだけ閉じる。
7. **ビルド工程・外部ライブラリを入れない。** ES Modules の素の JS / CSS をそのまま GitHub Pages で配信する。
8. **単位**: 日付 `YYYY-MM-DD`（端末ローカル＝日本時間）、時刻 `HH:MM`（24h）、タイムスタンプは epoch ms。曜日は 0=日〜6=土。
9. ロジック（日付・祝日・くりかえし・マージ・同期）は DOM に依存しない純粋モジュールにし、Node のテストで検証できるようにする。

## SSOT（単一の真実）

- 値の正は **`spec/` の Markdown**。`impl/` はそこから転記する。食い違えば **`spec/` を正**とする。
- 発見は実装・実機から始まってもよいが、**`spec/` に書き戻すまで「完了」ではない**（逆流は STATUS.md 経由で正規化）。

## Git 運用

- git は必須（旧版復元のため）。**worktree は使わない**（単一作業ツリーで直列）。
- 作業ブランチは **`vX.Y` 形式**（次の版番号）。`claude/...` の自動命名は使わない。
- 完了時：`git switch main` → `git merge --no-ff vX.Y -m "Merge vX.Y (要約)"` → `git tag vX.Y` → `git branch -d vX.Y`。
- `main` への push で GitHub Actions が `impl/web/` を GitHub Pages に配信する。
- コミットの作者メールは GitHub の noreply アドレス（リポジトリ local 設定済み）。個人メールを公開リポジトリに出さない。
- 文書の成熟度は frontmatter `status:`、リリースは tag（役割を混ぜない）。

## 仕様 ↔ 実装の対応（doc ↔ impl）

| spec（正） | impl | テスト |
|---|---|---|
| `spec/software.md` §設定値 | `impl/web/js/config.js` | — |
| `spec/interface/data-schema.md` | `impl/web/js/model.js`（normalize / merge） | `impl/tests/model.test.mjs` |
| `spec/interface/data-schema.md` §同期 | `impl/web/js/store/github.js`, `store/sync.js` | `impl/tests/sync.test.mjs`（Mock クライアント） |
| `spec/software.md` §くりかえし | `impl/web/js/recurrence.js` | `impl/tests/recurrence.test.mjs` |
| `spec/software.md` §祝日 | `impl/web/js/holidays.js` | `impl/tests/holidays.test.mjs` |
| `spec/software.md` §画面 | `impl/web/js/ui/*.js`, `impl/web/css/app.css` | ブラウザ（スマホ幅）で目視確認 |

**Mock-first**：GitHub API は `SyncEngine` にクライアントを注入する形にし、テストは Mock クライアントで実行する（ネットワーク不要）。

## 何を読めば何が分かるか

| 知りたいこと | 読むファイル |
|---|---|
| なぜ作るか・目標値・NFR | `spec/requirements.md` |
| 用語 | `spec/glossary.md` |
| 画面・振る舞い・受入・設定値 | `spec/software.md` |
| data.json の形・同期の約束 | `spec/interface/data-schema.md` |
| なぜそう決めたか | `spec/decisions/ADR-*.md` |
| 公開・初期設定の手順 | `docs/setup.md` |
| ママ向けの使い方 | `docs/guide.md` |
| 今どこ・次に何を | `STATUS.md` |

## 技術スタック（確定）

- 言語: JavaScript（ES2022 / ES Modules、ビルドなし）、HTML、CSS
- 形態: PWA（manifest ＋ Service Worker、ホーム画面に追加して全画面で起動）
- 同期: GitHub REST API（Contents API）＋ fine-grained personal access token（データ用リポジトリ限定）
- 端末内保存: `localStorage`
- 配信: GitHub Pages（GitHub Actions で `impl/web/` をデプロイ）
- テスト: Node.js 内蔵テストランナー（`node --test`、依存なし）
- アイコン生成: Python + Pillow（`impl/tools/make_icons.py`、生成物はコミット済み）

選定根拠は `spec/decisions/` の ADR を参照。

## ビルド・実行・テスト

- ローカル起動：`python -m http.server 8080 -d impl/web` → `http://localhost:8080/`（`.claude/launch.json` に `web` として登録済み）
- テスト：`node --test impl/tests/`
- アイコン再生成：`python impl/tools/make_icons.py`
- `impl/web/` にファイルを足したら `impl/web/sw.js` の `ASSETS` と `CACHE` 版を更新する。

## スタイル

- モジュールはグローバル状態を持たない（UI の `state` は `main.js` に集約）。ロジック関数は引数で受け取り値を返す。
- DOM 生成は `ui/dom.js` の `h()` を使う。`innerHTML` にユーザー入力を入れない（XSS 防止）。

## 運用ループ（プランモードの代替）

1. 開始：本ファイル（自動）＋ `STATUS.md`（次タスク）＋ README 索引から該当 spec を読む。
2. 振る舞いの追加・変更は、**先に `spec/software.md` の該当 behavior（Acceptance付き）を書く**＝これが計画。
3. `impl/` で実装。Acceptance をテスト（ロジック）またはブラウザ確認手順（画面）に翻訳。
4. 終了：`STATUS.md` 更新（done／次／再開点）、必要なら ADR、確定値を `spec/` に**書き戻す**。
