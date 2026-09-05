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
