---
title: Data Schema & GitHub Sync Contract
status: draft           # draft | confirmed | baselined
updated: 2026-11-15
owner: Ken
---

# データ形式と同期の約束

予定データは非公開リポジトリ（`Ouchi-Calendar-data`）の `main` ブランチ `data.json` に置く（UTF-8 JSON、2スペース整形）。
端末内では同じ形を localStorage に保存する。実装：`impl/web/js/model.js`（normalize / merge）、`store/github.js`、`store/sync.js`。

## data.json（schema 1）

```jsonc
{
  "schema": 1,
  "members": [
    { "id": "m1", "name": "ママ", "color": "#E64980", "order": 0, "updatedAt": 0, "deleted": false }
  ],
  "events": [
    {
      "id": "e_lx2k9a_ab12",          // 一意。e_ + 時刻36進 + 乱数
      "title": "サッカー",
      "members": ["m2"],               // 1人以上。全員なら「みんな」表示
      "date": "2026-11-07",            // 開始日（くりかえしは初回）
      "endDate": null,                 // 複数日の最終日（くりかえし無しの時のみ。含む）
      "allDay": false,
      "start": "10:00", "end": "12:00", // allDay=true のときは無視
      "memo": "水筒・すねあて",
      "repeat": null | {
        "freq": "daily" | "weekly" | "monthly" | "yearly",
        "interval": 1 | 2,             // 2 は weekly のみ（2週ごと）
        "weekdays": [6],               // weekly：0=日〜6=土
        "monthlyMode": "day" | "nth",  // monthly：日付 or 第n曜日
        "nth": 2,                      // monthlyMode=nth：1〜4、-1=最終
        "until": "2027-03-31" | null,  // 終わり（含む）
        "skipHolidays": true           // 祝日はお休み
      },
      "skipDates": ["2026-11-21"],     // この日はお休み
      "skipRanges": [{ "from": "2026-12-24", "to": "2027-01-07", "label": "冬休み" }],
      "overrides": {                   // この日だけ変更（キー＝その回の日付）
        "2026-11-14": { "title": "練習試合", "allDay": false, "start": "13:00", "end": "15:00", "memo": "", "members": ["m2"] }
      },
      "updatedAt": 1763190000000,      // epoch ms。マージの勝敗に使う
      "deleted": false
    }
  ],
  "tasks": [
    { "id": "t_lx2k9a_cd34", "title": "上履きを持っていく", "members": ["m2"], "due": "2026-11-20" | null,
      "done": false, "doneAt": null, "updatedAt": 1763190000000, "deleted": false }
  ]
}
```

### ルール

- 全レコード（members / events / tasks）は `id`・`updatedAt`・`deleted` を持つ。**削除は `deleted: true` にして `updatedAt` を更新**（論理削除）。
- 論理削除から 60 日経ったレコードは同期時に物理削除してよい。
- 端末ごとの表示設定（文字サイズ・週のはじまり・絞り込み・最後の表示）は data.json に**含めない**（端末の localStorage のみ）。
- 未知のフィールドは保持する（新しい版の端末が書いた値を古い版が消さないため）。
- `schema` を上げるときは `normalize()` に移行処理を書き、古い形を読めるようにする。

## マージ（`merge(a, b)`）

- コレクションごとに `id` で突き合わせ、片方にしかないものは残す。両方にあるものは **`updatedAt` が大きい方**（同値なら a）を採用。
- 結果の配列は `id` 順に並べる（差分比較と git の差分を安定させるため）。
- メンバーの初期値は全端末で同じ `id`（m1〜m3）と `updatedAt: 0` を持つので、どちらかで編集すれば編集した方が勝つ。

## 同期（GitHub Contents API）

認証：fine-grained personal access token（対象リポジトリ＝データ用リポジトリのみ、権限 Contents: Read and write）。ヘッダ `Authorization: Bearer <token>`。

| 手順 | API | 備考 |
|---|---|---|
| 1. 取得 | `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` | 200：`content`(base64) と `sha`。404：ファイル未作成（新規扱い） |
| 2. マージ | 端末データ ⊕ リモートデータ | `merge()`。結果を端末に保存し再描画 |
| 3. 書き込み | `PUT /repos/{owner}/{repo}/contents/{path}` body: `message`, `content`(base64), `sha`(既存時), `branch` | 結果がリモートと同じなら書かない |
| 4. 競合 | 409 / 422（sha 不一致） | 1 からやり直し。最大 3 回 |

- エラー分類：ネットワーク失敗＝`offline`、401＝`auth`、403＝`forbidden`（権限不足・回数制限）、404（リポジトリ）＝`notfound`、409/422＝`conflict`。
- 取得は `cache: "no-store"`（ブラウザキャッシュで古い sha を掴まないため）。
- data.json が 1MB を超えると Contents API の `content` が空になる。現状の想定量（数年で数百KB）では問題ない（超えそうなら STATUS に起票）。
- コミットメッセージ：`update data (<端末名>)`。

## 接続コード

`OUCHI1:` ＋ base64url(JSON) 。JSON は `{ "o": owner, "r": repo, "b": branch, "p": path, "t": token }`（`b`・`p` は省略時 `main`・`data.json`）。
設定画面の「接続コードを作る」で生成し、ママのスマホの設定画面に貼り付ける。端末内では localStorage に保存する（その端末の中だけ）。
