// 管理者(/presenter)からモデル1(gemma-4-12b)の利用可否を切り替えるためのAPI。
// 認証は行わない（このアプリ全体がログイン無しの方針のため）。/presenter 同様、
// 通常のナビゲーションには表示されないURLであることのみを拠り所にしている。

import { isModel1Enabled, setModel1Enabled } from '@/lib/settings/store'

export async function GET() {
  return Response.json({ model1Enabled: isModel1Enabled() })
}

export async function POST(request: Request) {
  const { enabled } = await request.json()
  setModel1Enabled(enabled === true)
  return Response.json({ model1Enabled: isModel1Enabled() })
}
