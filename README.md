# AIチャット ハンズオン

生成AI研修向けの、完全ローカル環境で動作するAIチャットハンズオンツールです。インターネット接続不要で、[llama.cpp](https://github.com/ggml-org/llama.cpp) でホストしたローカルLLM（Gemma）と対話しながら、AIの基本的な仕組みからセキュリティ、推論・エージェントの考え方までを体験できます。

## 特徴

- **完全オフライン動作**：外部ネットワークへは一切通信しません。すべてローカルのllama.cppサーバーとのみ通信します
- **2モデル切り替え**：軽量モデルと高性能モデルを画面から切り替えて応答速度・回答の違いを比較できます
- **ハンズオンテキスト**：「AIリテラシー」「AIの仕組み」「AIとセキュリティ」「AIの推論とエージェント」の4章を、チャット画面と並べて閲覧しながら進行できます
- **推論モード**：モデルに思考過程（`<think>`）を明示させて表示します
- **RAG（社内資料を使った回答）**：`knowledge/`フォルダに置いた資料を検索し、根拠付きで回答します。外部ベクトルDBは使わず、埋め込み専用のllama-serverとインメモリ検索だけで完結します
- **利用状況ダッシュボード**：会話ログを匿名集計し、業務カテゴリ・改善余地などをLLM自身に分類させて可視化します（`/analytics`）
- **受講者向けURL共有画面**：講師専用のQRコード表示画面です。通常のナビゲーションには表示されないため、`/presenter` に直接アクセスしてください

## 動作要件

- Node.js 20 以上
- [llama.cpp](https://github.com/ggml-org/llama.cpp) の `llama-server` を2つ起動しておくこと（モデル1・モデル2）
- RAG機能を使う場合は、埋め込み専用の `llama-server` をもう1つ起動しておくこと（後述）

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
| `RAG_EMBED_API_URL` | 埋め込み用llama.cppサーバーURL | `http://localhost:8082` |
| `RAG_EMBED_MODEL` | 埋め込みAPIに渡すモデル名 | `embedding` |
| `RAG_KNOWLEDGE_DIR` | 知識ソースのフォルダ | `./knowledge` |
| `RAG_TOP_K` | 検索で取り出す件数 | `4` |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | チャンクの最大文字数 / 重なり文字数 | `500` / `100` |
| `RAG_MIN_SCORE` | この類似度未満のチャンクは不採用 | `0.3` |
| `RAG_EMBED_BATCH_SIZE` / `RAG_EMBED_TIMEOUT_MS` | 埋め込みのバッチ件数 / タイムアウト | `16` / `20000` |
| `RAG_EMBED_QUERY_PREFIX` / `RAG_EMBED_DOC_PREFIX` | 埋め込みモデルが要求するプレフィックス | 空文字 |

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

## RAG（社内資料を使った回答）

`knowledge/` フォルダに `.md` / `.txt` ファイルを置くと、チャットが自動でその内容を
検索し、根拠付きで回答します。外部ベクトルDB・LangChain等は使わず、埋め込み専用の
`llama-server` とインメモリのコサイン類似度検索だけで完結します（詳しくは
[`knowledge/README.md`](./knowledge/README.md) を参照）。

### 埋め込みサーバーの起動

事前に埋め込み用のGGUFモデルを用意し、通常のチャット用とは別に3つ目の
`llama-server` を起動します。以下は動作確認済みの例（[bge-m3](https://huggingface.co/bbvch-ai/bge-m3-GGUF)、日本語を含む多言語対応・1024次元）です。

```bash
llama-server --hf-repo bbvch-ai/bge-m3-GGUF --hf-file bge-m3-q4_k_m.gguf \
  --embeddings --pooling cls --host 127.0.0.1 --port 8082 \
  -c 4096 -b 4096 -ub 4096 -ngl 99
```

完全オフライン環境では `--hf-repo`/`--hf-file` によるダウンロードができないため、
研修当日までにモデルファイルを入手し、ローカルパス指定（`-m /path/to/model.gguf`）
に切り替えてください。

### 使い方

1. `knowledge/` フォルダに資料(`.md` / `.txt`)を置く
2. チャット画面の「RAG」トグルをONにする（知識ソースが1件も無いと押せません）
3. 質問すると、資料を検索した上で回答し、回答の下に「参照した資料」パネルが表示されます
4. ファイルを追加・変更した直後にすぐ反映したい場合は、`/presenter` の
   「知識ソースを再読み込み」ボタンを押してください（何もしなくても次の質問から
   自動で反映されます）

### 仕組み（ベクトルDBは使っていません）

RAG＝ベクトルDBと思われがちですが、RAGの定義は「生成前に関連文書を検索してプロンプトに
注入する」ことだけで、検索方法自体は問いません。このアプリは、知識ソースが数十〜数百
チャンク程度の研修デモ規模であることを前提に、ベクトルDB・ANN(近似最近傍探索)インデックス
を一切使わず、**全チャンクをメモリに載せて毎回総当たりでコサイン類似度を計算する**方式を
採っています。

1. **インデックス構築**（`lib/rag/indexer.ts`）: `knowledge/` 配下のファイルを読み込み、
   見出し単位でチャンク分割（`lib/rag/chunk.ts`）した上で、各チャンクの本文を埋め込み専用の
   `llama-server`（bge-m3）に送ってベクトル化。ベクトルはL2正規化した上で、チャンク本文と
   ともに `globalThis` 上の配列に保持するだけ（DBもファイルも使わない。サーバー再起動で
   消えるが次のリクエストで自動的に作り直される）
2. **検索**（`lib/rag/search.ts`）: 質問文も同じ埋め込みサーバーでベクトル化し、保持している
   全チャンクのベクトルと1件ずつ内積を取る（ベクトルは正規化済みなので内積＝コサイン類似度）。
   しきい値(`RAG_MIN_SCORE`)未満を除外してスコア降順に並べ、上位`RAG_TOP_K`件だけを残す
   ——ANNインデックスを使わないO(n)の線形探索
3. **生成への注入**（`app/api/chat/route.ts`）: 検索結果のテキストを
   `[資料1] タイトル\n本文...` の形でsystemプロンプトに文字列として連結してから、通常の
   チャットと同じように `/v1/chat/completions` へ渡す

```
質問文 → 埋め込みサーバーでベクトル化 → 全チャンクと内積計算(線形探索)
       → スコア上位N件 → systemプロンプトに連結 → LLMが回答生成
```

ベクトルDBが担うのは「大量のベクトルから高速に近傍を探す」ためのインデックス構造で、
研修デモの規模ではその問題自体が発生しないため、あえて導入していません。

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
