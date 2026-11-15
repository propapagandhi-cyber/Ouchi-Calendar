# Decisions（ADR）

「**なぜそう決めたか**」を記録する。アーキテクチャに限らず HW/SW 双方の重要判断を残す。

## 運用ルール

- 1 判断 = 1 ファイル。`ADR-NNNN-slug.md`（連番 + 短い slug）。
- **追記イミュータブル**：判断が変わったら古い ADR を書き換えず、新しい ADR で **supersede**（置換）する。
  - 旧 ADR の frontmatter に `superseded_by:`、新 ADR に `supersedes:` を記入。
- 「何がいつ変わったか」は git、「なぜ変えたか」は ADR。役割分担を守る。
- 人間が読んで承認する関与点（詳細仕様は精読しなくても ADR は読む）。
- 雛形は [`_template.md`](_template.md)。

## 索引

| ADR | タイトル | status |
|---|---|---|
| [0001](ADR-0001-record-architecture-decisions.md) | ADR を用いて判断を記録する | accepted |
| [0002](ADR-0002-pwa-on-github-pages.md) | GitHub Pages で配信するビルド不要の PWA にする | accepted |
| [0003](ADR-0003-data-in-private-github-repo.md) | 予定データは GitHub 非公開リポジトリの data.json に置き、レコード単位でマージする | accepted |
