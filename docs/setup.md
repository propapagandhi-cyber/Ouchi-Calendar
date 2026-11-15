# セットアップ手順（設定する人＝パパ向け）

おうちカレンダーを公開し、ママのスマホ（Pixel 10）とパパの PC で同じ予定を見られるようにする手順。
所要時間：30 分ほど。**ママの操作は「貼り付けて、ボタンを押す」だけ**になるよう、パパが準備する。

全体像：

```
公開リポジトリ  Ouchi-Calendar        … アプリ本体（GitHub Pages で配信）
非公開リポジトリ Ouchi-Calendar-data   … 予定データ data.json（家族以外は見えない）
トークン（データ用リポジトリだけ読み書きできる鍵） → 「接続コード」にまとめて各端末に1回貼る
```

---

## 1. アプリを公開する（GitHub Pages） — ✅ 実施済み（2026-11-15）

- 公開リポジトリ：https://github.com/propapagandhi-cyber/Ouchi-Calendar
- **アプリの URL：https://propapagandhi-cyber.github.io/Ouchi-Calendar/**

やり直す場合の手順：

1-1. GitHub に**公開**リポジトリ `Ouchi-Calendar` を作り、このリポジトリを push する。
1-2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
1-3. `main` に push すると Actions（`.github/workflows/pages.yml`）がテスト → `impl/web/` を配信する。

公開されるのはアプリのプログラム（`impl/web/`）だけで、予定データは含まれない。

## 2. 予定データ用の非公開リポジトリを作る — ✅ 実施済み（2026-11-15）

- 非公開リポジトリ：https://github.com/propapagandhi-cyber/Ouchi-Calendar-data（README 付き・`main`）

やり直す場合の手順：

2-1. GitHub で **New repository** → 名前 `Ouchi-Calendar-data`、**Private** を選ぶ。
2-2. **「Add a README file」にチェック**して作成する（空のリポジトリだと保存できないため）。
     `data.json` はアプリが初回接続時に自動で作る。

## 3. トークン（データ用の鍵）を作る

3-1. GitHub 右上のアイコン → **Settings** → 左下 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**。
3-2. 次のとおり設定する：

| 項目 | 値 |
|---|---|
| Token name | `ouchi-calendar` |
| Expiration | 選べる範囲でいちばん長く（期限が来たら手順 6 で作り直す） |
| Repository access | **Only select repositories** → `Ouchi-Calendar-data` だけ |
| Permissions → Repository permissions → **Contents** | **Read and write** |

（Metadata: Read-only は自動で付く。それ以外の権限は付けない）

3-3. **Generate token** → 表示された `github_pat_…` をコピー（この画面を閉じると二度と表示されない）。

## 4. 接続コードを作る（パパの PC）

4-1. PC のブラウザで公開 URL を開く → 右上 **⚙ 設定**。
4-2. 「同期」欄の **「接続コードを作る（設定する人向け）」** を開き、ユーザー名・リポジトリ名（`Ouchi-Calendar-data`）・トークンを入れて **「接続コードを作る」**。
4-3. 出てきた `OUCHI1:…` を **「コードをコピー」**。
4-4. 同じ設定画面の上の欄に貼り付けて **「接続する」** → PC も同期される。

> 接続コードはパスワードと同じ。家族以外に送らない。

## 5. ママのスマホ（Pixel 10）を設定する

5-1. 接続コードをママのスマホに送る（LINE・Gmail など。**貼り付けたらそのメッセージは消す**）。
5-2. スマホの **Chrome** で公開 URL を開く。
5-3. 右上 **⚙ 設定** → 「同期」欄に接続コードを貼り付け → **「接続する」** → 「接続しました」と出れば OK。
5-4. **ホーム画面に追加**：設定画面の「ホーム画面に追加する」ボタン（出ていない場合は Chrome 右上の **⋮ → ホーム画面に追加 → インストール**）。
     以後はホーム画面の「おうちカレンダー」アイコンから開く。
5-5. 必要なら設定で **文字の大きさ**、**メンバーの名前**（例：長男 → お子さんの名前）を変える。
5-6. 最後に [使い方ガイド](guide.md) を印刷して渡し、5 分ほど一緒に触る。

## 6. 困ったとき（パパ向け）

| 症状 | 対処 |
|---|---|
| 上に「接続できません（期限切れかも）」と出る | トークンの期限切れ。手順 3 で作り直し → 手順 4 で新しい接続コード → 各端末で **設定 → 接続を解除する → 新しいコードで接続**（端末の予定は消えない） |
| 「インターネットにつながっていません」 | 電波が戻れば自動で送る。何もしなくてよい |
| 予定を消してしまった | 8 秒以内なら画面下の「元に戻す」。過ぎたら `Ouchi-Calendar-data` の **History** から以前の `data.json` を探して内容を戻す（Claude Code に頼める） |
| スマホをなくした | GitHub の Fine-grained tokens で該当トークンを **Delete**。新しいトークン・接続コードで他の端末を接続し直す |
| アプリを更新したのに古い画面のまま | アプリを一度閉じて開き直す（オンラインなら最新を読み込む） |
| 機種変更 | 新しいスマホで手順 5 をやり直す（データは GitHub にあるのでそのまま出てくる） |
