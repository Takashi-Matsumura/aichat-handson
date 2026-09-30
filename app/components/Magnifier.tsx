'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// 講義投影用の拡大表示。ページ全体(children を包む要素)を CSS transform で拡大し、
// 矢印キーで表示範囲を動かす。拡大したままクリック・入力などの操作ができる。
// 操作ボタンは包む要素の外に置き、拡大の影響を受けないようにする。
//
// アプリ全体（どのページでも）で使えるよう、app/layout.tsx で children を包んで1つだけマウントする。
//
// 制約: transform を掛けた要素は、その中の position: fixed の要素の基準(containing block)になる。
// ページ自体がスクロールしない画面(チャット画面は h-screen)では問題ないが、ページがスクロールする
// 画面(/presenter 等)で下までスクロールした状態で拡大中にモーダルを開くと、モーダルは
// ページ全体の中央に出るため、矢印キーで移動して探す必要がある。

const ZOOM_STEPS = [1.5, 2, 2.5, 3, 4]
const DEFAULT_ZOOM = 2
// 矢印キー1回で動かす量(画面上のピクセル)。Shift+矢印キーはその方向の端まで一気に移動する。
const PAN_STEP_PX = 80
const TRANSITION = 'transform 120ms ease-out'

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

function stepZoom(current: number, dir: 1 | -1) {
  const idx = ZOOM_STEPS.findIndex((v) => Math.abs(v - current) < 0.001)
  const baseIdx = idx === -1 ? ZOOM_STEPS.findIndex((v) => v >= current) : idx
  const nextIdx = clamp(baseIdx + dir, 0, ZOOM_STEPS.length - 1)
  return ZOOM_STEPS[nextIdx]
}

function isEditable(target: EventTarget | null) {
  const t = target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

function viewportSize() {
  return { vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight }
}

const TOGGLE_BUTTON_CLASS = (on: boolean) =>
  `w-9 h-14 flex items-center justify-center rounded-r-xl border border-l-0 transition-colors ${
    on
      ? 'border-ocean-400 bg-ocean-50 text-ocean-700 dark:border-ocean-500 dark:bg-ocean-900/30 dark:text-ocean-400'
      : 'border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 opacity-60 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-zinc-700'
  }`

export default function Magnifier({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showHint, setShowHint] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const onRef = useRef(on)
  const zoomRef = useRef(zoom)
  // 表示範囲の左上(拡大前のページ座標)。描画のたびにReactを通さず、直接 transform に反映する。
  const viewRef = useRef({ x: 0, y: 0 })
  // 拡大の基準点(画面座標)。null なら画面中央。
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  const mouseRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => { onRef.current = on }, [on])

  // ON直後の数秒だけ操作方法をヒント表示する。
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

  // 表示範囲をページ内に収めたうえで transform に反映する。
  // ページがスクロールしている場合も、現在の画面左上を基準に計算する。
  const applyTransform = useCallback(() => {
    const el = contentRef.current
    if (!el || !onRef.current) return
    const Z = zoomRef.current
    const { vw, vh } = viewportSize()
    const v = viewRef.current
    v.x = clamp(v.x, 0, el.offsetWidth - vw / Z)
    v.y = clamp(v.y, 0, el.offsetHeight - vh / Z)
    const tx = window.scrollX - el.offsetLeft - Z * v.x
    const ty = window.scrollY - el.offsetTop - Z * v.y
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${Z})`
  }, [])

  // 画面上の点(画面座標)を動かさないまま倍率を変える。
  const changeZoom = useCallback((next: number, at?: { x: number; y: number }) => {
    const prev = zoomRef.current
    if (next === prev) return
    const { vw, vh } = viewportSize()
    const p = at ?? { x: vw / 2, y: vh / 2 }
    const v = viewRef.current
    viewRef.current = {
      x: v.x + p.x / prev - p.x / next,
      y: v.y + p.y / prev - p.y / next,
    }
    zoomRef.current = next
    setZoom(next)
    applyTransform()
  }, [applyTransform])

  const toggle = useCallback((anchor: { x: number; y: number } | null) => {
    anchorRef.current = anchor
    setOn((v) => !v)
  }, [])

  // ON/OFF の切り替え。ON中はページ自体のスクロールを止め、表示範囲の移動は矢印キーで行う。
  useEffect(() => {
    const el = contentRef.current
    if (!el || !on) return
    const html = document.documentElement
    const Z = zoomRef.current
    const { vw, vh } = viewportSize()
    // 基準点の下にあるページ上の位置が、拡大後も同じ画面位置に来るようにする。
    const a = anchorRef.current ?? { x: vw / 2, y: vh / 2 }
    const pageX = a.x + window.scrollX - el.offsetLeft
    const pageY = a.y + window.scrollY - el.offsetTop
    viewRef.current = { x: pageX - a.x / Z, y: pageY - a.y / Z }

    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    el.style.transformOrigin = '0 0'
    el.style.willChange = 'transform'
    el.style.transition = TRANSITION
    applyTransform()

    window.addEventListener('resize', applyTransform)
    window.addEventListener('scroll', applyTransform, { passive: true })
    return () => {
      window.removeEventListener('resize', applyTransform)
      window.removeEventListener('scroll', applyTransform)
      html.style.overflow = prevOverflow
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.willChange = ''
      el.style.transition = ''
    }
  }, [on, applyTransform])

  // 拡大開始の基準にするため、マウス位置は常に記録しておく。
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  // Cmd/Ctrl+Shift+Z でのトグルは常時有効（入力欄フォーカス中でも安全な修飾キー2つの組み合わせ）。
  // 矢印キー・ズームキー(+/-)はON中のみ、かつ入力欄にフォーカスがあるときは本来の動作を優先する。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === 229) return

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyZ') {
        if (e.repeat) return
        e.preventDefault()
        toggle(mouseRef.current)
        return
      }

      if (!onRef.current || e.metaKey || e.ctrlKey || e.altKey) return
      const editable = isEditable(e.target)

      const delta = ARROW_DELTAS[e.key]
      if (delta) {
        if (editable) return
        e.preventDefault()
        const v = viewRef.current
        if (e.shiftKey) {
          // その方向の端まで一気に移動する。範囲外の値は applyTransform がページ端に収める。
          viewRef.current = {
            x: delta[0] === 0 ? v.x : delta[0] < 0 ? 0 : Infinity,
            y: delta[1] === 0 ? v.y : delta[1] < 0 ? 0 : Infinity,
          }
        } else {
          // 押しっぱなし(repeat)でも連続して動かす。
          const step = PAN_STEP_PX / zoomRef.current
          viewRef.current = { x: v.x + delta[0] * step, y: v.y + delta[1] * step }
        }
        applyTransform()
        return
      }

      if (e.repeat) return
      if (!editable && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        changeZoom(stepZoom(zoomRef.current, 1))
      } else if (!editable && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        changeZoom(stepZoom(zoomRef.current, -1))
      } else if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setOn(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggle, changeZoom, applyTransform])

  // Alt+ホイールで、マウス位置を動かさないまま倍率を変える(ON中のみ)。
  useEffect(() => {
    if (!on) return
    function onWheel(e: WheelEvent) {
      if (!e.altKey) return
      e.preventDefault()
      changeZoom(stepZoom(zoomRef.current, e.deltaY < 0 ? 1 : -1), { x: e.clientX, y: e.clientY })
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [on, changeZoom])

  return (
    <>
      <div ref={contentRef} className="flex flex-1 flex-col">
        {children}
      </div>

      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-[101] hidden md:flex items-center">
        <button
          type="button"
          onClick={() => toggle(null)}
          aria-pressed={on}
          title={
            on
              ? '拡大表示を終了（Esc、または Cmd/Ctrl+Shift+Z）'
              : '拡大表示（Cmd/Ctrl+Shift+Z）— 画面全体を拡大し、矢印キーで移動します'
          }
          aria-label="拡大表示"
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
              onClick={() => changeZoom(stepZoom(zoom, -1))}
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
              onClick={() => changeZoom(stepZoom(zoom, 1))}
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[101] max-w-sm px-3 py-2 rounded-lg bg-gray-900/90 text-white text-xs text-center shadow-lg">
          矢印キーで表示範囲を移動（Shift+矢印キーで端まで移動）、＋/− で倍率変更、Esc で終了します。
          入力欄にカーソルがあるときは、矢印キーは文字の移動に使われます。
        </div>
      )}
    </>
  )
}
