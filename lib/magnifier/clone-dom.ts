// 拡大鏡（Magnifier）機能のDOM複製ユーティリティ。React管理外の命令的DOM操作のため、
// ロジックをコンポーネントから切り出している。
//
// 方針:
// - document.body をまるごと複製し、レンズ（拡大鏡本体）内にCSS transformで拡大表示する。
// - 複製は「重い」ので低頻度（呼び出し側で150ms程度に間引く）。
// - スクロール位置・input/textarea/selectの値・フォーカスリングなど、DOM属性に現れず
//   複製時点でスナップショットされてしまう値だけを、毎フレーム安価に書き戻す（syncLive）。

export type LivePair = {
  src: Element
  dst: HTMLElement
  kind: 'scroll' | 'value'
}

export type CloneResult = {
  /** 複製されたノード群を包む要素。stage要素の子として差し込む */
  host: HTMLElement
  /** 毎フレーム同期が必要な要素ペア */
  pairs: LivePair[]
  /** フォーカスリング合成のための 実要素→複製要素 対応表 */
  srcToDst: Map<Element, HTMLElement>
}

// 複製に含めると害があるタグ（レンズ自身の除外は data-magnifier-exclude 属性で別途行う）
const EXCLUDE_TAGS = new Set(['SCRIPT', 'NEXTJS-PORTAL', 'NEXT-ROUTE-ANNOUNCER'])

const FOCUS_OUTLINE = '2px solid #3d9ff5'

/**
 * srcRoot（通常は document.body）を複製し、拡大鏡レンズに表示できる形に整える。
 *
 * querySelectorAll('*') は文書順の走査なので、複製前後で srcNodes[i] と dstNodes[i] が
 * 1:1対応する。この対応を壊さないよう、除外要素の削除は走査が終わってからまとめて行う。
 */
export function buildClone(srcRoot: HTMLElement): CloneResult {
  const clone = srcRoot.cloneNode(true) as HTMLElement

  const srcNodes = srcRoot.querySelectorAll<HTMLElement>('*')
  const dstNodes = clone.querySelectorAll<HTMLElement>('*')

  const pairs: LivePair[] = []
  const srcToDst = new Map<Element, HTMLElement>()
  const toRemove: HTMLElement[] = []

  for (let i = 0; i < srcNodes.length; i++) {
    const s = srcNodes[i]
    const d = dstNodes[i]

    if (EXCLUDE_TAGS.has(d.tagName) || d.hasAttribute('data-magnifier-exclude')) {
      toRemove.push(d)
      continue
    }

    // id重複（label[for]・aria-controls等の衝突）を避ける
    if (d.id) d.removeAttribute('id')

    srcToDst.set(s, d)

    const tag = s.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      pairs.push({ src: s, dst: d, kind: 'value' })
      // ラジオボタンの複製が本物と同じグループを形成し、本物の選択を解除する事故を防ぐ
      if (tag === 'INPUT' && (s as HTMLInputElement).type === 'radio') {
        d.removeAttribute('name')
      }
    } else if (s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1) {
      pairs.push({ src: s, dst: d, kind: 'scroll' })
    }
  }

  // 除外サブツリーの子孫は上のループでも pairs/srcToDst に混入し得るが、
  // 親ごと DOM から外れれば detached ノードへの書き込みになるだけで無害。
  toRemove.forEach((n) => n.remove())

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('inert', '') // 複製内の要素にフォーカス・クリックが渡らないようにする
  host.className = srcRoot.className
  const computed = getComputedStyle(srcRoot)
  host.style.background = computed.backgroundColor
  host.style.color = computed.color
  host.style.display = 'block'
  host.style.minHeight = '100%'
  host.append(...Array.from(clone.childNodes))

  return { host, pairs, srcToDst }
}

// 直前にフォーカスリングを当てた複製要素。差分だけ更新するために保持する
// （srcToDst 全体を毎フレーム走査しないための最適化）。
let lastFocusedDst: HTMLElement | null = null

/**
 * 毎フレーム呼ぶ想定の軽量な同期処理。
 * - scrollTop/scrollLeft と input/textarea/select の value/checked を実DOMから複製へ反映
 * - フォーカス中の要素があれば、複製側の対応要素に合成のフォーカスリングを当てる
 *   （focus:ring はCSS疑似クラスなので複製には乗らないため）
 */
export function syncLive(pairs: LivePair[], srcToDst: Map<Element, HTMLElement>) {
  for (const { src, dst, kind } of pairs) {
    if (!dst.isConnected) continue
    if (kind === 'scroll') {
      const s = src as HTMLElement
      if (dst.scrollTop !== s.scrollTop) dst.scrollTop = s.scrollTop
      if (dst.scrollLeft !== s.scrollLeft) dst.scrollLeft = s.scrollLeft
    } else {
      const s = src as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      const d = dst as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if (d.value !== s.value) d.value = s.value
      if ('checked' in s && (s as HTMLInputElement).checked !== (d as HTMLInputElement).checked) {
        ;(d as HTMLInputElement).checked = (s as HTMLInputElement).checked
      }
    }
  }

  const active = document.activeElement
  const dst = active ? srcToDst.get(active) ?? null : null
  if (dst === lastFocusedDst) return
  if (lastFocusedDst) {
    lastFocusedDst.style.outline = ''
    lastFocusedDst.style.outlineOffset = ''
  }
  if (dst) {
    dst.style.outline = FOCUS_OUTLINE
    dst.style.outlineOffset = '1px'
  }
  lastFocusedDst = dst
}

/** レンズを閉じるときに、モジュール内で保持している状態をリセットする */
export function resetLiveState() {
  lastFocusedDst = null
}
