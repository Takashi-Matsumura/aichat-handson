// 管理者(/presenter)からモデル1(gemma-4-12b)の利用可否を切り替えるためのAPI。
// 変更(POST)は講師のみ(lib/presenter/auth.ts の requirePresenter)。
// 取得(GET)は受講者のチャット画面もモデル選択の可否表示に使うため公開のままにする。

import { isModel1Enabled, setModel1Enabled } from '@/lib/settings/store'
import { requirePresenter } from '@/lib/presenter/auth'

export async function GET() {
  return Response.json({ model1Enabled: isModel1Enabled() })
}

export async function POST(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const { enabled } = await request.json()
  setModel1Enabled(enabled === true)
  return Response.json({ model1Enabled: isModel1Enabled() })
}
