// LLMの応答テキストからJSONを取り出す緩いパース。
// response_format(json_schema) が効かないサーバーでは "```json ... ```" のように
// コードフェンスや前置きが付くことがあるため、最初の { から最後の } までを拾って再挑戦する。
// 分類(lib/analytics/classify.ts)と確認テスト(lib/quiz/generate.ts)で共用する。
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

// ストリーミング中のLLM出力から、配列の要素として閉じ終わったオブジェクトを順に取り出す。
// 例: '{"questions":[{...},{..' まで届いた時点で、1つ目の {...} の文字列を返す。
// {"questions":[...]} でも [...] でも、最初に開いた配列の直下のオブジェクトを要素とみなす。
// 文字列リテラル内の括弧やエスケープは無視する。コードフェンスなど括弧の外の文字は読み飛ばす。
export function createArrayItemExtractor(): (chunk: string) => string[] {
  const stack: string[] = [] // 開いている括弧('{' / '[')
  let arrayDepth = -1 // 要素を取り出す配列の、stack上の深さ(未確定なら-1)
  let inString = false
  let escaped = false
  let itemStart = -1 // 取り出し中の要素の開始位置(buffer内)
  let buffer = ''

  return (chunk) => {
    const items: string[] = []
    const offset = buffer.length
    buffer += chunk
    for (let i = offset; i < buffer.length; i++) {
      const ch = buffer[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        if (stack.length > 0) inString = true
      } else if (ch === '{' || ch === '[') {
        if (ch === '[' && arrayDepth < 0) arrayDepth = stack.length + 1
        stack.push(ch)
        if (ch === '{' && stack.length === arrayDepth + 1) itemStart = i
      } else if (ch === '}' || ch === ']') {
        if (ch === '}' && stack.length === arrayDepth + 1 && itemStart >= 0) {
          items.push(buffer.slice(itemStart, i + 1))
          itemStart = -1
        }
        stack.pop()
      }
    }
    // 取り出し中の要素が無ければ、読み終えた部分は捨ててよい(長い出力でもメモリを食わない)。
    if (itemStart < 0) {
      buffer = ''
    } else {
      buffer = buffer.slice(itemStart)
      itemStart = 0
    }
    return items
  }
}
