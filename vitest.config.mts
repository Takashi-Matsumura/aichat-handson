import { defineConfig } from 'vitest/config'

// サーバー側の純粋な処理(lib/ 配下)の単体テスト用。画面コンポーネントのテストは含まない。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
