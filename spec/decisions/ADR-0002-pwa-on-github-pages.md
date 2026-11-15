---
adr: 0002
title: GitHub Pages で配信するビルド不要の PWA にする
status: accepted        # proposed | accepted | superseded | deprecated
scope: architecture
supersedes:
superseded_by:
date: 2026-11-15
---

## Context（背景・前提）

主ユーザー（ママ）は Pixel 10 を使い、スマホ操作に詳しくない。アプリストアへの公開や端末へのインストール作業は避けたい。
パパの PC からも同じものを見たい。費用はかけない。保守はパパと Claude Code が行う。

## Decision（決めたこと）

- **PWA（Web アプリ＋manifest＋Service Worker）** として作り、**GitHub Pages**（公開リポジトリ `Ouchi-Calendar`）で配信する。
  ママのスマホでは Chrome の「ホーム画面に追加」でアイコン化し、全画面で起動する。
- **ビルド工程・外部ライブラリなし**（素の ES Modules / CSS）。`impl/web/` をそのまま配信する。
- 配信は GitHub Actions（`actions/deploy-pages`）で `impl/web/` だけをアップロードする（spec 等は配信物に含めない）。

## Consequences（結果・トレードオフ）

- 無料・インストール不要・PC でもスマホでも同じ URL で使える。更新は push するだけで全端末に反映。
- 依存がないので、数年放置しても壊れにくい（npm パッケージの劣化がない）。
- フレームワークの便利機能は使えないため、画面の部品は自前（`ui/dom.js`）。規模が小さいので許容。
- 通知（リマインダー）は Push サーバーが必要なため、この方式では当面提供しない。

## Alternatives（検討した他案）

- ネイティブ Android アプリ：配布・更新の手間が大きく、PC で見られないため却下。
- React 等＋ビルド：機能規模に対して過剰。依存の保守負担が増えるため却下。
- Google カレンダーの共有：無料で通知もあるが、「メンバー別の色分け・例外のお休み操作・やること一体」をママ向けに単純化できないため今回は見送り（将来の連携候補として STATUS に記載）。
