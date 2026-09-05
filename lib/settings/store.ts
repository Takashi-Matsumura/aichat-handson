// 管理者設定のインメモリストア。
//
// lib/analytics/store.ts と同じ方針: DBを持たないため Next.js サーバープロセスの
// メモリ内に保持するだけにする（サーバー再起動でデフォルトに戻ってよい）。
// dev の HMR でモジュールが再評価されてもデータが消えないよう、globalThis に固定して保持する。

type AdminSettings = {
  // false の間、モデル1(gemma-4-12b)はチャットで選択・利用できない。
  // 大人数のハンズオンで、負荷をモデル2(gemma-3-4b)に集中させるための一時的な仕組み。
  // 恒久的な対策としては、llama-server(ポート8080側)自体を停止すること。
  model1Enabled: boolean
}

const globalForSettings = globalThis as unknown as { __adminSettings?: AdminSettings }

export const settings: AdminSettings =
  globalForSettings.__adminSettings ?? (globalForSettings.__adminSettings = { model1Enabled: true })

export function isModel1Enabled(): boolean {
  return settings.model1Enabled
}

export function setModel1Enabled(enabled: boolean): void {
  settings.model1Enabled = enabled
}
