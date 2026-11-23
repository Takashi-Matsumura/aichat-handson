<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Review guidelines

PR レビュー（Codex code review など）を行う AI 向けの指示。

### 言語と形式

- レビューコメントは**日本語**で書く。コード識別子・ファイル名は原文のまま。
- 指摘には、問題の箇所（`ファイル:行`）、何が起きるか（具体的な入力や操作 → 誤った結果）、修正の方向性を含める。
- 好みの問題（命名やフォーマットのみ）は指摘しない。lint・型チェックで検出できるものも指摘しない。

### 前提

- ハンズオン会場の LAN 内で、受講者（未認証）と講師が同じアプリを使う。**受講者は悪意を持ちうる利用者**として扱う。
- 講師用の機能（`/presenter`、`app/api/admin/*`）は `PRESENTER_PASSWORD` によるセッションで保護されている。
- LLM は llama.cpp サーバー（環境変数 `LLAMA_API_URL` / `LLAMA_API_URL_2`）。会場全体で共有する計算資源である。

### 重点的に確認すること

- **認可ゲートの欠落**：`app/api/admin/*` などの講師専用 API の各ハンドラで `requirePresenter()`（`lib/presenter/auth.ts`、Origin 照合を含む）が呼ばれているか。新しい管理系ルートやメソッドの追加時は特に確認する。
- **クライアント供給の値の信用**：リクエストボディ・クエリ・Cookie（`handson_sid` など）の値を、型・範囲・長さの検証なしにサーバー側で使っていないか。`modelIndex` などは許可値に丸めているか。
- **LLM への入力**：チャットの `messages` の role・件数・長さが検証されているか。受講者が `system` ロールを注入したり、巨大な入力で推論サーバーを占有したりできないか。
- **SSRF**：`fetch` の宛先 URL がクライアント入力から組み立てられていないか（上流 URL は環境変数で固定するのが方針）。Web 検索・RAG 周辺で特に確認する。
- **パストラバーサル**：RAG 資料などファイルを扱う処理で、パスの正規化と管理ディレクトリ内への制限が行われているか。
- **XSS**：`dangerouslySetInnerHTML`、`rehype-raw` の導入、LLM 出力や受講者入力の生 HTML 描画がないか。
- **情報露出**：上流（llama.cpp など）のエラー本文やスタックトレースをそのままクライアントに返していないか。
- **リソースの無制限な増加**：Map・配列・SSE 購読者などが、受講者の操作に応じて上限なく増えないか。
- **秘密情報**：`.env*`、`data/` 配下のデータ、パスワードやトークンがコミット・ログ出力・Docker イメージに含まれていないか。GitHub Actions のワークフローを追加する場合は、`permissions` が最小か、秘密情報がハードコードされていないか。

### その他

- 機能追加でテスト（Vitest）が必要なのに追加されていない場合は指摘してよい。
- Next.js は学習データと異なる版の可能性がある。API の使い方を指摘する前に `node_modules/next/dist/docs/` の記述と矛盾しないか確認する。
