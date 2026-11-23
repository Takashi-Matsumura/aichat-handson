'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  DEFAULT_HOWTO_VOICE,
  HOWTO_VIDEOS,
  HOWTO_VOICES,
  formatDuration,
  howtoNarration,
  howtoThumb,
  howtoVideo,
  type HowtoVideoSet,
} from '@/lib/howto/chapters'

const VOICE_STORAGE_KEY = 'howto-voice'
// 動画と音声のずれがこれを超えたら、音声を動画の位置に合わせ直す(秒)。
const MAX_DRIFT_SEC = 0.25

function loadVoiceId(): string {
  try {
    const saved = localStorage.getItem(VOICE_STORAGE_KEY)
    if (saved && HOWTO_VOICES.some((v) => v.id === saved)) return saved
  } catch {
    /* 保存領域が使えない環境では既定の声 */
  }
  return DEFAULT_HOWTO_VOICE.id
}

// ナレーションの音声(<audio>)を、動画(<video>)の再生・一時停止・シーク・速度・音量に追従させる。
// 動画には無音の音声トラックしか入っておらず、声は受講者が選んだ声の音声ファイルで流す。
function useNarrationSync(videoRef: RefObject<HTMLVideoElement | null>, audioRef: RefObject<HTMLAudioElement | null>) {
  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return
    const syncTime = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > MAX_DRIFT_SEC) audio.currentTime = video.currentTime
    }
    const play = () => {
      syncTime()
      audio.play().catch(() => {})
    }
    const pause = () => audio.pause()
    const seek = () => {
      audio.currentTime = video.currentTime
    }
    const rate = () => {
      audio.playbackRate = video.playbackRate
    }
    const volume = () => {
      audio.volume = video.volume
      audio.muted = video.muted
    }
    const tick = () => {
      if (!video.paused) syncTime()
    }
    // 声やチャプタを切り替えて音声を読み込み直したら、動画の位置・状態に合わせる
    const loaded = () => {
      audio.currentTime = video.currentTime
      rate()
      volume()
      if (!video.paused && !video.ended) audio.play().catch(() => {})
    }
    const events: [EventTarget, string, () => void][] = [
      [video, 'playing', play],
      [video, 'play', play],
      [video, 'pause', pause],
      [video, 'waiting', pause],
      [video, 'ended', pause],
      [video, 'seeking', seek],
      [video, 'seeked', seek],
      [video, 'ratechange', rate],
      [video, 'volumechange', volume],
      [video, 'timeupdate', tick],
      [audio, 'loadedmetadata', loaded],
    ]
    for (const [target, name, fn] of events) target.addEventListener(name, fn)
    return () => {
      for (const [target, name, fn] of events) target.removeEventListener(name, fn)
    }
  }, [videoRef, audioRef])
}

// トップページ（会話が始まる前）に出す、アプリの使い方動画の入口。基本の使い方と応用編の2本を並べ、
// 押すとその動画のチャプタ付きプレーヤーが開く。研修の外でも、操作を独学で確認できるようにするためのもの。
export function HowtoVideoCard() {
  const [openId, setOpenId] = useState<string | null>(null)
  const opened = HOWTO_VIDEOS.find((v) => v.id === openId)
  return (
    <>
      <div className="mt-4 mx-auto flex flex-wrap justify-center gap-3">
        {HOWTO_VIDEOS.map((set) => (
          <button
            key={set.id}
            type="button"
            onClick={() => setOpenId(set.id)}
            className="group w-fit flex flex-col gap-2 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 pb-3 text-center shadow-sm hover:border-ocean-300 dark:hover:border-ocean-600 transition-colors"
          >
            <span className="relative block w-40 mx-auto aspect-video overflow-hidden rounded-xl bg-gray-100 dark:bg-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element -- 静的な小さいサムネイル。最適化は不要 */}
              <img src={howtoThumb(set.chapters[0].id)} alt="" className="w-full h-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/5 transition-colors">
                <span className="w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center text-ocean-700">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
                  </svg>
                </span>
              </span>
            </span>
            <span className="block px-2">
              <span className="block text-sm font-semibold text-gray-800 dark:text-zinc-100">{set.card}</span>
              <span className="block mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{set.cardSub}</span>
            </span>
          </button>
        ))}
      </div>
      {opened && <HowtoVideoModal set={opened} onClose={() => setOpenId(null)} />}
    </>
  )
}

function HowtoVideoModal({ set, onClose }: { set: HowtoVideoSet; onClose: () => void }) {
  const [current, setCurrent] = useState(0)
  const [voiceId, setVoiceId] = useState(loadVoiceId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const chapters = set.chapters
  const chapter = chapters[current]
  const voice = HOWTO_VOICES.find((v) => v.id === voiceId) ?? DEFAULT_HOWTO_VOICE
  useNarrationSync(videoRef, audioRef)

  function changeVoice(id: string) {
    setVoiceId(id)
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, id)
    } catch {
      /* 保存できなくても、この再生中は切り替わる */
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // チャプタを選んだら、頭から再生する（自動再生が止められている環境では、再生ボタンを押してもらう）。
  useEffect(() => {
    videoRef.current?.play().catch(() => {})
  }, [current])

  // 再生中のチャプタ(自動で次へ進んだときも)が、チャプタ一覧の見える範囲に入るよう一覧をスクロールする。
  // scrollIntoView は外側(縦並びのときのダイアログ全体)まで動かしてしまうので、一覧だけを動かす。
  useEffect(() => {
    const list = listRef.current
    const item = list?.children[current] as HTMLElement | undefined
    if (!list || !item || list.scrollHeight <= list.clientHeight) return
    const top = item.offsetTop - list.offsetTop
    const bottom = top + item.offsetHeight
    if (top < list.scrollTop) list.scrollTo({ top: top - 8, behavior: 'smooth' })
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTo({ top: bottom - list.clientHeight + 8, behavior: 'smooth' })
  }, [current])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={set.title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-full bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 flex flex-col overflow-hidden"
      >
        <div className="flex-none flex items-center justify-between gap-3 px-5 py-3 bg-ocean-700 dark:bg-ocean-900">
          <h2 className="text-sm font-semibold text-white truncate">
            {set.title}　<span className="font-normal text-ocean-100">チャプタ{current + 1}：{chapter.title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="aqua-close flex-none w-7 h-7"
          >
            <span className="aqua-close-dot">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          <div className="flex-none lg:flex-1 bg-black flex items-center">
            {/* key を付けて作り直すと全画面が解除されるため、同じ要素のまま src だけを差し替える */}
            <video
              ref={videoRef}
              src={howtoVideo(chapter.id)}
              poster={howtoThumb(chapter.id)}
              controls
              playsInline
              preload="metadata"
              onEnded={() => {
                if (current < chapters.length - 1) setCurrent(current + 1)
              }}
              className="w-full aspect-video"
            />
            {/* 選んだ声のナレーション。動画の操作に追従させる(useNarrationSync) */}
            <audio ref={audioRef} src={howtoNarration(chapter.id, voice.id)} preload="auto" />
          </div>
          {/* 横並び(lg)のときは、ウィンドウの高さを動画に合わせる。チャプタ一覧は高さを決めないよう
              絶対配置で動画の高さに収め、はみ出す分は一覧の中でスクロールする */}
          <div className="flex-none lg:w-72 lg:relative">
          <div className="flex flex-col lg:absolute lg:inset-0">
          <ol ref={listRef} className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto p-2 space-y-1">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-current={i === current ? 'true' : undefined}
                  className={`w-full flex items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                    i === current
                      ? 'bg-ocean-50 dark:bg-ocean-900/30 ring-1 ring-ocean-300 dark:ring-ocean-600'
                      : 'hover:bg-gray-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 静的な小さいサムネイル。最適化は不要 */}
                  <img src={howtoThumb(c.id)} alt="" className="flex-none w-24 aspect-video rounded-lg object-cover bg-gray-100 dark:bg-zinc-700" />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium text-ocean-700 dark:text-ocean-400">
                      チャプタ{i + 1}{c.duration > 0 ? `・${formatDuration(c.duration)}` : ''}
                    </span>
                    <span className="block text-sm font-semibold text-gray-800 dark:text-zinc-100 leading-snug">{c.title}</span>
                    <span className="block text-xs text-gray-400 dark:text-zinc-500 truncate">{c.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="flex-none flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-gray-100 dark:border-zinc-700 px-4 py-2">
            <label className="flex items-center gap-2 whitespace-nowrap text-xs text-gray-600 dark:text-zinc-300">
              ナレーションの声
              <select
                value={voice.id}
                onChange={(e) => changeVoice(e.target.value)}
                // iPhone の Safari は 16px 未満の選択欄をタップすると画面を拡大するため、スマホ幅では 16px にする
                className="rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-base md:text-xs text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400"
              >
                {HOWTO_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            {/* ナレーションに使った音声合成ソフトのクレジット(各話者の利用規約で表記が必要) */}
            <span className="whitespace-nowrap text-[11px] text-gray-400 dark:text-zinc-500">{voice.credit}</span>
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
