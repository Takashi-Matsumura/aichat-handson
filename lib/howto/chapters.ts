// アプリの使い方動画のチャプタ一覧。動画とサムネイルは public/howto/ に置く（promo/howto/build.mjs が書き出す）。
// duration は build.mjs が出力する秒数を写したもの（一覧に長さを出すため）。

export type HowtoChapter = { id: string; title: string; summary: string; duration: number }

export const HOWTO_CHAPTERS: HowtoChapter[] = [
  { id: 'ch1', title: '画面の見かた', summary: 'どこに何があるか', duration: 46.4 },
  { id: 'ch2', title: '質問してみよう', summary: '例文・改行・送信・停止', duration: 45.1 },
  { id: 'ch3', title: '答えを確かめる', summary: '再生成・見比べ・トークン', duration: 51.1 },
  { id: 'ch4', title: 'テキストを見ながら進める', summary: 'テキストの開き方と［入力］ボタン', duration: 64.1 },
  { id: 'ch5', title: '推論モード', summary: 'AIに考えてから答えてもらう', duration: 38.8 },
  { id: 'ch6', title: '新しく始める・確認テスト', summary: '新規チャットと4択テスト', duration: 45.2 },
]

export const howtoVideo = (id: string) => `/howto/${id}.mp4`
export const howtoThumb = (id: string) => `/howto/${id}.jpg`

export function formatDuration(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
