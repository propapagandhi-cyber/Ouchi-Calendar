# おうちカレンダー（Ouchi-Calendar）

家族（ママ・長男・次男）の予定とやることを、スマホで大きく見やすく共有するシンプルな家族カレンダー（PWA）。
アプリ本体は GitHub Pages、予定データは GitHub の非公開リポジトリに保存する。`spec/`（仕様＝SSOT）と `impl/`（実装）を統合した mono-repo。

## 読む順序

1. `CLAUDE.md` — ルール・技術スタック・Git運用（Claude Code は最初にこれを読む）
2. `spec/requirements.md` — なぜ作るか・目標値・NFR
3. `spec/glossary.md` — 用語
4. `spec/software.md` — 画面・振る舞い・設定値
5. `STATUS.md` — 今どこ・次に何を

## 知りたいこと → 読むファイル

| 知りたいこと | ファイル |
|---|---|
| なぜ作るか・目標値・NFR・与件 | `spec/requirements.md`（`R-n`） |
| 用語の定義 | `spec/glossary.md` |
| 画面・振る舞い・受入・設定値 | `spec/software.md` |
| data.json の形・同期の約束 | `spec/interface/data-schema.md` |
| なぜそう決めたか | `spec/decisions/ADR-NNNN-slug.md` |
| GitHub への公開・スマホの初期設定 | `docs/setup.md` |
| ママ向けの使い方（印刷用） | `docs/guide.md` |
| 今どこ・次に何を・未確定 | `STATUS.md` |

## ディレクトリ構成

| パス | 役割 |
|---|---|
| `spec/` | 仕様（SSOT）。人間とAIの合意対象 |
| `spec/interface/` | データ形式と GitHub 同期の約束 |
| `spec/decisions/` | ADR — 判断の履歴 |
| `impl/web/` | アプリ本体（GitHub Pages で配信される静的ファイル） |
| `impl/tests/` | ロジックのテスト（`node --test impl/tests/`） |
| `impl/tools/` | アイコン生成などの補助スクリプト |
| `docs/` | セットアップ手順・使い方 |
| `.github/workflows/` | GitHub Pages 配信 |

## 状態

v0.2：最初の動く版（月・週・日・やること、くりかえし＋例外、GitHub 同期、PWA）。未確定項目は `STATUS.md` に棚卸し。
