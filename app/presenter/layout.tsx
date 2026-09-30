// 講師画面の入口。未ログインなら page.tsx の代わりにログインフォームを表示する。
// 実際のデータ保護は各管理系API(requirePresenter)側で行っており、ここは画面の出し分けのみ。

import { PresenterLogin } from '@/app/components/presenter/PresenterLogin'
import { isPresenterAuthConfigured, isPresenterAuthenticated } from '@/lib/presenter/auth'

export default async function PresenterLayout({ children }: { children: React.ReactNode }) {
  if (await isPresenterAuthenticated()) return children
  return <PresenterLogin configured={isPresenterAuthConfigured()} />
}
