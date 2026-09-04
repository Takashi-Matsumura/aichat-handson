# AIチャット ハンズオン

生成AI研修向けの、完全ローカル環境で動作するAIチャットハンズオンツールです。インターネット接続不要で、[llama.cpp](https://github.com/ggml-org/llama.cpp) でホストしたローカルLLM（Gemma）と対話しながら、AIの基本的な仕組みからセキュリティ、推論・エージェントの考え方までを体験できます。

## 特徴

- **完全オフライン動作**：外部ネットワークへは一切通信しません。すべてローカルのllama.cppサーバーとのみ通信します
- **2モデル切り替え**：軽量モデルと高性能モデルを画面から切り替えて応答速度・回答の違いを比較できます
- **ハンズオンテキスト**：「AIリテラシー」「AIの仕組み」「AIとセキュリティ」「AIの推論とエージェント」の4章を、チャット画面と並べて閲覧しながら進行できます
- **推論モード**：モデルに思考過程（`<think>`）を明示させて表示します
- **利用状況ダッシュボード**：会話ログを匿名集計し、業務カテゴリ・改善余地などをLLM自身に分類させて可視化します（`/analytics`）
- **受講者向けURL共有画面**：講師専用のQRコード表示画面です。通常のナビゲーションには表示されないため、`/presenter` に直接アクセスしてください

## 動作要件

- Node.js 20 以上
- [llama.cpp](https://github.com/ggml-org/llama.cpp) の `llama-server` を2つ起動しておくこと（モデル1・モデル2）

```bash
# 例
llama-server -m gemma-3-4b-it.gguf --port 8081
llama-server -m gemma-4-12b-it.gguf --port 8080
```

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 必要に応じて編集
npm run dev
```

http://localhost:3000 を開きます。

## 環境変数

`.env.local`（ローカル開発）または `.env`（Docker、`.env.example` を参照）に設定します。

| 変数 | 説明 | デフォルト |
|---|---|---|
| `LLAMA_API_URL` | モデル1のllama.cppサーバーURL | `http://localhost:8080` |
| `LLAMA_API_URL_2` | モデル2のllama.cppサーバーURL | `http://localhost:8081` |
| `LLAMA_MODEL` | llama.cppに渡すモデル名 | `gemma4` |
| `LLAMA_MODEL_LABEL_1` / `LLAMA_MODEL_LABEL_2` | 画面に表示するモデルの表示名 | モデル名から自動生成 |
| `LLAMA_MAX_TOKENS` | チャット1回あたりの生成トークン上限 | `2048` |
| `LLAMA_CLASSIFY_MAX_TOKENS` | 利用ログ分類リクエストのトークン上限 | `512` |

## Dockerで動かす

```bash
cp .env.example .env   # 必要に応じて編集
docker compose up -d
```

http://localhost:8061 を開きます（ホスト側でllama.cppを動かしている場合は `host.docker.internal` を利用します）。

## 開発

```bash
npm run lint        # ESLint
npx tsc --noEmit     # 型チェック
npm run build        # 本番ビルド
```

## ライセンス

MIT License. 詳細は [LICENSE](./LICENSE) を参照してください。
