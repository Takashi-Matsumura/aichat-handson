'use client'

import { useState } from 'react'
import { AdminStatsPanel } from '@/app/components/dashboard/AdminStatsPanel'
import { PromptBroadcastPanel } from '@/app/components/presenter/PromptBroadcastPanel'
import { PresenterTabs, type PresenterTab } from '@/app/components/presenter/PresenterTabs'
import { AccessPanel } from '@/app/components/presenter/AccessPanel'
import { RagSourcesPanel } from '@/app/components/presenter/RagSourcesPanel'
import { useAccessInfo } from '@/app/components/presenter/useAccessInfo'
import { useRagSources } from '@/app/components/presenter/useRagSources'

// 講師用の管理画面。ログインの確認は app/presenter/layout.tsx で行う。
export default function PresenterPage() {
  const [tab, setTab] = useState<PresenterTab>('access')
  // 「アクセスURL」「RAGソース」タブの状態はここで保持する。タブを切り替えても
  // 取得し直さず、RAGソースの未保存の編集内容も失われないようにするため。
  const access = useAccessInfo()
  const rag = useRagSources()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex flex-col items-center px-6 py-10 relative">
      <div className={`w-full flex flex-col items-center gap-8 mx-auto transition-[max-width] ${tab === 'stats' || tab === 'prompts' ? 'max-w-4xl' : tab === 'rag' ? 'max-w-2xl' : 'max-w-md'}`}>
        <PresenterTabs tab={tab} onChange={setTab} />

        {tab === 'access' && <AccessPanel access={access} />}

        {tab === 'rag' && <RagSourcesPanel rag={rag} />}

        {tab === 'prompts' && <PromptBroadcastPanel />}

        {tab === 'stats' && <AdminStatsPanel />}
      </div>
    </div>
  )
}
