// 講師画面の入口。未ログインなら page.tsx の代わりにログインフォームを表示する。
// 実際のデータ保護は各管理系API(requirePresenter)側で行っており、ここは画面の出し分けのみ。

import { connection } from 'next/server'
import { PresenterLogin } from '@/app/components/presenter/PresenterLogin'
import { isPresenterAuthConfigured, isPresenterAuthenticated } from '@/lib/presenter/auth'

export default async function PresenterLayout({ children }: { children: React.ReactNode }) {
  // PRESENTER_PASSWORD が無いと isPresenterAuthenticated() は cookies() を読まずに返るため、
  // パスワードを渡さないビルド(Docker)では静的ページとして「未設定」の画面が焼き込まれてしまう。
  // 環境変数はリクエスト時に見る必要があるので、常にリクエストごとに描画させる。
  await connection()
  if (await isPresenterAuthenticated()) return children
  return <PresenterLogin configured={isPresenterAuthConfigured()} />
}
