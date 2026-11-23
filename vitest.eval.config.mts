import { defineConfig } from 'vitest/config'

// RAGの方式比較(scripts/rag-eval/)用。モデルのサーバーが必要で時間もかかるため、
// ふだんの単体テスト(vitest.config.mts / npm test)とは分けて、npm run eval:rag で明示的に流す。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['scripts/rag-eval/**/*.eval.ts'],
    // 進み具合を出すため、テスト中の console 出力を隠さない
    silent: false,
  },
})
