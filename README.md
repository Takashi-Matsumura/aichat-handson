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

## 複数人ハンズオンでのサーバー容量設計（参考値）

Mac Studioなどユニファイドメモリ搭載機を研修用サーバーにする場合、参加人数分の同時アクセスを
llama.cppでさばくために `--parallel`（同時処理スロット数）と `-c`（1スロットあたりのコンテキ
ストサイズ）を調整する必要があります。以下は実測値（Apple M5 / 32GB機でのKVキャッシュ実測値）
をもとにした概算です。**実機・実際のllama.cppバージョンで負荷テストの上、調整してください。**

### 前提・計算式

- コンテキストサイズは `-c 4096`（ハンズオンの往復会話には十分な量）で統一
- 実測KVキャッシュコスト: gemma-3-4b ≒ **0.113 MiB/トークン/スロット**、gemma-4-12b ≒ **0.3125 MiB/トークン/スロット**
- 必要メモリ ≒ OS・Node.jsアプリ分(5GiB) + モデル重み + 計算バッファ(1.5GiB + 0.03GiB×並列数) + (並列数 × コンテキスト × KVキャッシュコスト)
- モデル重み: gemma-3-4b ≒ 2.93 GiB（`--mmproj`なし、テキストのみ利用時）、gemma-4-12b ≒ 6.62 GiB

### 参考値

| 参加人数 | モデル | `--parallel` | `-c` | 推定必要メモリ |
|---|---|---|---|---|
| 10名 | gemma-3-4b | 10 | 4096 | 約14.3 GiB |
| 10名 | gemma-4-12b | 10 | 4096 | 約25.9 GiB |
| 30名 | gemma-3-4b | 30 | 4096 | 約23.9 GiB |
| 30名 | gemma-4-12b | 30 | 4096 | 約51.5 GiB |
| 50名 | gemma-3-4b | 50 | 4096 | 約33.5 GiB |
| 50名 | gemma-4-12b | 50 | 4096 | 約77.1 GiB |

例えば **Mac Studio（36GB）で50名にgemma-3-4bを提供する場合は収まりますが、gemma-4-12bで50名
（約77GiB）はメモリが全く足りません。** モデルサイズが3倍近く違うと、同じ人数を支えるための
メモリも同程度の比率で増えるため、参加人数が多いハンズオンでは**軽量モデル（gemma-3-4b）に
統一し、もう一方（gemma-4-12b）は研修中は停止しておく**のが現実的な選択です（両方を同時に
フル並列で立てたままにすると、上記の合計が必要になります）。

またApple SiliconはGPU（Metal）が使えるメモリに既定の上限があるため、`--parallel`を増やす
場合は事前に上限を引き上げてください。

```bash
sudo sysctl iogpu.wired_limit_mb=<引き上げたい上限(MB)>
```

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
