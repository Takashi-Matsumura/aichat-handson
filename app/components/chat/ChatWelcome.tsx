'use client'

// 会話がまだ始まっていないときの表示。入力欄の上に出す案内(ChatWelcome)と、
// 入力欄の下に出す例文ボタン(SuggestedPrompts)。

// 入力の呼び水になる例文
const SUGGESTED_PROMPTS: { label: string; prompt: string; icon: 'chat' | 'idea' | 'write' | 'help' }[] = [
  { label: '自己紹介してもらう', prompt: 'こんにちは！あなたはどんなことができますか？', icon: 'chat' },
  { label: 'アイデアを出してもらう', prompt: '新商品のキャッチコピーを3つ考えてください', icon: 'idea' },
  { label: '文章を書いてもらう', prompt: '取引先への日程調整メールを書いてください', icon: 'write' },
  { label: 'やさしく説明してもらう', prompt: '生成AIの仕組みを中学生にも分かるように説明してください', icon: 'help' },
]

const SUGGESTION_ICON_PATHS: Record<string, React.ReactNode> = {
  chat: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  idea: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  write: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
}

export function ChatWelcome({ panelOpen }: { panelOpen: boolean }) {
  return (
    <div className="flex flex-col items-center gap-5 pb-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ocean-500 to-ocean-800 flex items-center justify-center shadow-lg shadow-ocean-900/15">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          <circle cx="8.5" cy="10" r="1" fill="white" stroke="none" />
          <circle cx="15.5" cy="10" r="1" fill="white" stroke="none" />
          <circle cx="12" cy="11" r="1" fill="white" stroke="none" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">
          今日は何を聞いてみますか？
        </h2>
        <p className="mt-1.5 text-sm text-gray-400 dark:text-zinc-500">
          {panelOpen
            ? 'ハンズオンテキストの指示に沿って話しかけてみましょう'
            : 'メッセージを入力するか、下の例から選んでみましょう'}
        </p>
      </div>
    </div>
  )
}

export function SuggestedPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="mt-4 w-full max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-2 px-4">
      {SUGGESTED_PROMPTS.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSelect(s.prompt)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-600 dark:text-zinc-300 hover:border-ocean-300 hover:text-ocean-700 dark:hover:border-ocean-600 dark:hover:text-ocean-400 transition-colors shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
            {SUGGESTION_ICON_PATHS[s.icon]}
          </svg>
          {s.label}
        </button>
      ))}
    </div>
  )
}
