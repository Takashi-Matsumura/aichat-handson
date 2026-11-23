// RAG関連の環境変数をここに集約する。
//
// LLAMA_API_URL 等は chat/route.ts, model-info/route.ts, tokenize/route.ts の3箇所に
// 同じ定義がコピペされてしまっているが、RAGは新規機能なので同じ轍を踏まず、
// 設定の読み出しをこのファイル1箇所にまとめる。

export const RAG_CONFIG = {
  // 埋め込み専用に立てる3つ目のllama-server(--embeddings付き)のURL。
  embedUrl: process.env.RAG_EMBED_API_URL ?? 'http://localhost:8082',
  embedModel: process.env.RAG_EMBED_MODEL ?? 'embedding',
  // 講師が研修当日に資料(.md/.txt)を置くフォルダ。中身はリポジトリにコミットしない。
  knowledgeDir: process.env.RAG_KNOWLEDGE_DIR ?? './knowledge',
  // 文書単位のRAG(lib/rag/documents.ts): 順位の高い文書から全文を渡すときの、合計文字数の上限と文書数の上限。
  // 0(既定)なら使わず、従来どおり上位 topK 件のチャンクだけを渡す。サンプル資料(1文書700〜800文字)での
  // 比較では、gemma-3-4b は文書を丸ごと渡すと正答率が下がった(チャンク93% → 文書78〜85%)ため既定では使わない。
  // 1文書が長い実際の社内資料や、長い文章を読める大きなモデルで、4000 などを指定して測り直す。
  docContextChars: Number(process.env.RAG_DOC_CONTEXT_CHARS ?? 0),
  docMaxCount: Number(process.env.RAG_DOC_MAX_COUNT ?? 3),
  // AIに作らせる検索文の数(元の質問文に加えて検索する)と、その生成の待ち時間。0 なら作らない。
  // サンプル資料(28チャンク)での比較では、作らなくても検索の当たり率は同じで、待ち時間だけが2〜3.5倍に
  // なったため既定では作らない。資料が増えて検索を外すようになったら 3 などを指定する。
  queryCount: Number(process.env.RAG_QUERY_COUNT ?? 0),
  queryTimeoutMs: Number(process.env.RAG_QUERY_TIMEOUT_MS ?? 15000),
  topK: Number(process.env.RAG_TOP_K ?? 4),
  chunkSize: Number(process.env.RAG_CHUNK_SIZE ?? 500),
  chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP ?? 100),
  // これ未満の類似度のチャンクは「関係ない」とみなして採用しない。
  minScore: Number(process.env.RAG_MIN_SCORE ?? 0.3),
  // 埋め込みリクエスト1回あたりの件数。並列化はせず、llama-serverのスロットを
  // チャット用と食い合わないよう直列にバッチ送信する。
  embedBatchSize: Number(process.env.RAG_EMBED_BATCH_SIZE ?? 16),
  embedTimeoutMs: Number(process.env.RAG_EMBED_TIMEOUT_MS ?? 20000),
  // 埋め込みモデルによってはクエリ/文書で異なるプレフィックスを要求する
  // (例: multilingual-e5系は "query: " / "passage: ")。モデルを差し替えても
  // 環境変数だけで対応できるよう外出しする。デフォルトは空(bge-m3等はプレフィックス不要)。
  queryPrefix: process.env.RAG_EMBED_QUERY_PREFIX ?? '',
  docPrefix: process.env.RAG_EMBED_DOC_PREFIX ?? '',
} as const
