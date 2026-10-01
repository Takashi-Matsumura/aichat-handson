// ハンズオンテキストの一覧。画面のテキストパネル(app/components/HandsonPanel.tsx)と、
// 確認テストの出題範囲(lib/quiz/generate.ts)の両方がここを参照する。

export type HandsonPage = { id: number; title: string; file: string }

export const HANDSON_PAGES: HandsonPage[] = [
  { id: 1, title: 'AIリテラシー', file: '/handson/handson1.md' },
  { id: 2, title: 'AIの仕組み', file: '/handson/handson2.md' },
  { id: 3, title: 'AIとセキュリティ', file: '/handson/handson3.md' },
  // 「AIの推論とエージェント」は今回の研修ではレベルが合わないため一時的に非表示。
  // コンテンツ（handson4.md）は削除しておらず、再度必要になれば以下のコメントを外すだけで良い。
  // （確認テストの出題範囲にも自動的に含まれるようになる）
  // { id: 4, title: 'AIの推論とエージェント', file: '/handson/handson4.md' },
]
