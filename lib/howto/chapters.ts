import voicesConfig from './voices.json'

// アプリの使い方動画。基本の使い方と、応用編(Web検索・社内資料のRAG)の2本に分け、それぞれチャプタを持つ。
// 動画とサムネイルは public/howto/<チャプタid>.* に置く（promo/howto/build.mjs が書き出す）。
// duration は build.mjs が出力する秒数を写したもの（一覧に長さを出すため）。

export type HowtoChapter = { id: string; title: string; summary: string; duration: number }
export type HowtoVideoSet = { id: string; title: string; card: string; cardSub: string; chapters: HowtoChapter[] }

export const HOWTO_VIDEOS: HowtoVideoSet[] = [
  {
    id: 'basic',
    title: '使い方の動画',
    card: 'はじめての方へ：使い方の動画',
    cardSub: '見たいところから再生できます',
    chapters: [
      { id: 'ch1', title: '画面の見かた', summary: 'どこに何があるか', duration: 63.7 },
      { id: 'ch2', title: '質問してみよう', summary: '例文・改行・送信・停止', duration: 67.0 },
      { id: 'ch3', title: '答えを確かめる', summary: '再生成・見比べ・トークン', duration: 57.3 },
      { id: 'ch4', title: 'テキストを見ながら進める', summary: 'テキストの開き方と［入力］ボタン', duration: 72.8 },
      { id: 'ch5', title: '推論モード', summary: 'AIに考えてから答えてもらう', duration: 48.4 },
      { id: 'ch6', title: '新しく始める・確認テスト', summary: '新規チャットと4択テスト', duration: 52.4 },
    ],
  },
  {
    id: 'advanced',
    title: '応用編の動画',
    card: '応用編：Web検索と社内資料',
    cardSub: '調べてから答えてもらう使い方',
    chapters: [
      { id: 'web', title: 'Web検索', summary: 'インターネットで調べてから答えてもらう', duration: 100.7 },
      { id: 'rag', title: '社内資料を検索（RAG）', summary: '登録された資料をもとに答えてもらう', duration: 88.7 },
    ],
  },
]

// ナレーション(字幕の読み上げ)で受講者が選べる声。一覧は lib/howto/voices.json で、
// promo/howto/build.mjs も同じ一覧から声ごとの音声を書き出す。credit は各話者の利用規約で必要な表記。
export type HowtoVoice = { id: string; name: string; speaker: number; credit: string; default?: boolean }

export const HOWTO_VOICES: HowtoVoice[] = voicesConfig.voices
export const DEFAULT_HOWTO_VOICE: HowtoVoice = HOWTO_VOICES.find((v) => v.default) ?? HOWTO_VOICES[0]

export const howtoNarration = (chapterId: string, voiceId: string) => `/howto/${chapterId}.${voiceId}.m4a`

export const howtoVideo = (id: string) => `/howto/${id}.mp4`
export const howtoThumb = (id: string) => `/howto/${id}.jpg`

export function formatDuration(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
