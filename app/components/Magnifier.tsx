'use client'

import { useEffect, useRef, useState } from 'react'
import { buildClone, syncLive, resetLiveState, type LivePair } from '@/lib/magnifier/clone-dom'

// 講義投影用の拡大鏡。画面のDOMを複製し、マウスカーソルに追従するレンズの中で
// CSS transformで拡大表示する。実際のクリック・ホバー・スクロールは常に本物のDOMに届く
// （レンズは pointer-events:none の視覚専用オーバーレイ）。
//
// アプリ全体（どのページでも）で使えるよう、app/layout.tsx から1つだけマウントする。

const ZOOM_STEPS = [1.5, 2, 2.5, 3, 4]
const DEFAULT_ZOOM = 2
const RECLONE_INTERVAL_MS = 150
// CSSトランジション（例: HandsonPanelの duration-300）はDOM変更を伴わないため、
// MutationObserver検知後もしばらくは「動いている可能性がある期間」として再クローンを続ける
const DIRTY_HOLD_MS = 700

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

function stepZoom(current: number, dir: 1 | -1) {
  const idx = ZOOM_STEPS.findIndex((v) => Math.abs(v - current) < 0.001)
  const baseIdx = idx === -1 ? ZOOM_STEPS.findIndex((v) => v >= current) : idx
  const nextIdx = clamp(baseIdx + dir, 0, ZOOM_STEPS.length - 1)
  return ZOOM_STEPS[nextIdx]
}

const TOGGLE_BUTTON_CLASS = (on: boolean) =>
  `w-9 h-14 flex items-center justify-center rounded-r-xl border border-l-0 transition-colors ${
    on
      ? 'border-ocean-400 bg-ocean-50 text-ocean-700 dark:border-ocean-500 dark:bg-ocean-900/30 dark:text-ocean-400'
      : 'border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 opacity-60 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-zinc-700'
  }`

export default function Magnifier() {
  const [on, setOn] = useState(false)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showHint, setShowHint] = useState(false)

  const onRef = useRef(on)
  const zoomRef = useRef(zoom)
  const lensRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: 0, y: 0, seen: false })
  const lensSizeRef = useRef({ w: 0, h: 0 })
  const pairsRef = useRef<LivePair[]>([])
  const srcToDstRef = useRef<Map<Element, HTMLElement>>(new Map())

  useEffect(() => { onRef.current = on }, [on])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // ON直後の数秒だけ既知の制約をヒント表示する。
  // OFFへの切り替えはレンダー中に直接反映し（setState-in-effectを避ける）、
  // ON中の自動非表示(4秒後)だけをタイマーで行う。
  const [prevOn, setPrevOn] = useState(on)
  if (on !== prevOn) {
    setPrevOn(on)
    if (on) setShowHint(true)
  }
  useEffect(() => {
    if (!on || !showHint) return
    const t = setTimeout(() => setShowHint(false), 4000)
    return () => clearTimeout(t)
  }, [on, showHint])

  // Cmd/Ctrl+Shift+Z でのトグルは常時有効（入力欄フォーカス中でも安全な修飾キー2つの組み合わせ）。
  // ズームキー(+/-)とEscapeはON中のみ、かつ入力中は無視する。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === 229 || e.repeat) return

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault()
        setOn((v) => !v)
        return
      }

      if (!onRef.current) return

      const t = e.target as HTMLElement | null
      const editable = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

      if (!editable && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        setZoom((z) => stepZoom(z, 1))
      } else if (!editable && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        setZoom((z) => stepZoom(z, -1))
      } else if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setOn(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // レンズ本体: ONの間だけクローン・観測・追従ループを配線する
  useEffect(() => {
    if (!on) return
    const lens = lensRef.current
    const stage = stageRef.current
    if (!lens || !stage) return

    function updateStageSize() {
      const vw = document.documentElement.clientWidth
      const vh = document.documentElement.clientHeight
      stage!.style.width = `${vw}px`
      stage!.style.height = `${vh}px`
      const lw = vw * 0.5
      const lh = vh * 0.5
      lensSizeRef.current = { w: lw, h: lh }
      lens!.style.width = `${lw}px`
      lens!.style.height = `${lh}px`
    }
    updateStageSize()

    let dirtyUntil = performance.now() + DIRTY_HOLD_MS

    const observer = new MutationObserver((records) => {
      if (records.every((r) => lens!.contains(r.target as Node))) return
      dirtyUntil = performance.now() + DIRTY_HOLD_MS
    })

    function rebuild() {
      observer.disconnect()
      const { host, pairs, srcToDst } = buildClone(document.body)
      stage!.replaceChildren(host)
      pairsRef.current = pairs
      srcToDstRef.current = srcToDst
      syncLive(pairs, srcToDst)
      observer.takeRecords()
      observer.observe(document.body, {
        subtree: true, childList: true, characterData: true, attributes: true,
      })
    }
    rebuild()

    const recloneTimer = setInterval(() => {
      if (document.hidden) return
      if (performance.now() > dirtyUntil) return
      rebuild()
    }, RECLONE_INTERVAL_MS)

    function onMouseMove(e: MouseEvent) {
      posRef.current = { x: e.clientX, y: e.clientY, seen: true }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })

    function onResize() {
      updateStageSize()
      rebuild()
    }
    window.addEventListener('resize', onResize)

    function onMouseLeaveDoc() {
      posRef.current.seen = false
    }
    document.addEventListener('mouseleave', onMouseLeaveDoc)

    function onWheel(e: WheelEvent) {
      if (!e.altKey) return
      e.preventDefault()
      setZoom((z) => stepZoom(z, e.deltaY < 0 ? 1 : -1))
    }
    window.addEventListener('wheel', onWheel, { passive: false })

    let rafId = requestAnimationFrame(frame)
    function frame() {
      rafId = requestAnimationFrame(frame)
      if (document.hidden) return
      const pos = posRef.current
      if (!pos.seen) {
        lens!.style.visibility = 'hidden'
        return
      }
      lens!.style.visibility = 'visible'

      const Z = zoomRef.current
      const vw = document.documentElement.clientWidth
      const vh = document.documentElement.clientHeight
      const { w: LW, h: LH } = lensSizeRef.current
      const M = 8

      const L = clamp(pos.x - LW / 2, M, Math.max(M, vw - LW - M))
      const T = clamp(pos.y - LH / 2, M, Math.max(M, vh - LH - M))
      const cx = pos.x - L
      const cy = pos.y - T
      const tx = cx - Z * pos.x
      const ty = cy - Z * pos.y

      lens!.style.left = `${L}px`
      lens!.style.top = `${T}px`
      stage!.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${Z})`

      // ページ全体がスクロールするページ(min-h-screen)向けのずらし。
      // h-screenのメインチャット画面ではwindow.scrollYが常に0なので実質何もしない。
      const host = stage!.firstElementChild as HTMLElement | null
      if (host) {
        host.style.marginTop = `${-window.scrollY}px`
        host.style.marginLeft = `${-window.scrollX}px`
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${cx - 12}px, ${cy - 12}px, 0)`
      }

      syncLive(pairsRef.current, srcToDstRef.current)
    }

    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(recloneTimer)
      observer.disconnect()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mouseleave', onMouseLeaveDoc)
      window.removeEventListener('wheel', onWheel)
      stage.replaceChildren()
      resetLiveState()
    }
  }, [on])

  return (
    <>
      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-[101] flex items-center" data-magnifier-exclude>
        <button
          type="button"
          onClick={() => setOn((v) => !v)}
          aria-pressed={on}
          title={
            on
              ? '拡大鏡を終了（Cmd/Ctrl+Shift+Z）'
              : '拡大鏡（Cmd/Ctrl+Shift+Z）— 画面を複製して拡大表示します'
          }
          aria-label="拡大鏡"
          className={TOGGLE_BUTTON_CLASS(on)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {on && (
          <div className="ml-2 flex items-center gap-0.5 rounded-xl border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 shadow-sm px-1 py-1">
            <button
              type="button"
              onClick={() => setZoom((z) => stepZoom(z, -1))}
              disabled={zoom <= ZOOM_STEPS[0]}
              aria-label="縮小"
              title="縮小（-）"
              className="px-2 py-0.5 text-xs font-bold rounded text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors select-none"
            >
              −
            </button>
            <span className="px-1 text-xs tabular-nums text-gray-600 dark:text-zinc-300 select-none">
              {zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => stepZoom(z, 1))}
              disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              aria-label="拡大"
              title="拡大（+）"
              className="px-2 py-0.5 text-sm font-bold rounded text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors select-none"
            >
              ＋
            </button>
          </div>
        )}
      </div>

      {on && showHint && (
        <div
          data-magnifier-exclude
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[101] max-w-sm px-3 py-2 rounded-lg bg-gray-900/90 text-white text-xs text-center shadow-lg transition-opacity"
        >
          画面の複製を拡大表示しています。ホバーの色変化や文字カーソルの点滅はレンズに映りません。
        </div>
      )}

      {on && (
        <div
          ref={lensRef}
          data-magnifier-exclude
          aria-hidden="true"
          className="fixed z-[100] overflow-hidden rounded-2xl border-2 border-ocean-400 shadow-2xl bg-white dark:bg-zinc-900"
          style={{ pointerEvents: 'none', visibility: 'hidden' }}
        >
          <div
            ref={stageRef}
            style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', willChange: 'transform' }}
          />
          <div
            ref={ringRef}
            className="absolute w-6 h-6 rounded-full border-2 border-ocean-400/70"
            style={{ left: 0, top: 0, willChange: 'transform' }}
          />
        </div>
      )}
    </>
  )
}
