// AIエージェントが使う tool calling のツール定義（OpenAI 互換 function 形式）。
//
// 人間が「① Googleでキーワード検索 → ② 結果一覧から選ぶ → ③ ページを開いて読む」
// という流れで調べ物をするのを、2つのツールにそのままマッピングしている。
//   - web_search : ①② キーワード検索して結果一覧（タイトル・URL・説明）を得る
//   - open_url   : ③   選んだURL（または直接指定されたURL）を開いて本文を読む
// 実行ロジックは lib/execute-tool.ts を参照。

export type ToolName = 'web_search' | 'open_url'

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'インターネットをキーワード検索し、上位のWebページのタイトル・URL・短い説明文の一覧を返します。最新の出来事・時事・価格・天気・統計・製品仕様など、あなたの知識にない、または古い可能性がある情報が必要なときに使ってください。返ってきたURLの中身を読むには open_url を使います。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              '検索キーワード。人間がGoogle検索に打ち込むような短い語句にする。例: 「東京 明日 天気」',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description:
        '指定したURLのWebページを開き、本文テキストを抽出して返します。web_searchの結果から有望なURLを選んでその中身を読むときや、ユーザーが直接URLを指定したときに使います。',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '開きたいページの完全なURL（http:// または https:// で始まる）',
          },
        },
        required: ['url'],
      },
    },
  },
] as const
