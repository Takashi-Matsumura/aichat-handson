// RAGの方式比較で使う質問と正誤の判定。
//
// samples/knowledge/ の架空の会社の資料(株式会社ハンズオン工房)を knowledge/ に置いた前提。
// 資料を書き換えたら、ここの正解(expect)も合わせて直すこと。

export type EvalMessage = { role: 'user' | 'assistant'; content: string }

export type EvalQuestion = {
  id: string
  // 単純 / 言い換え / 組み合わせ / 続けて / 資料に無い / 文書またぎ / 複数の事実
  kind: string
  messages: EvalMessage[]
  // 答えに含まれているべき表現(すべて満たせば正解)。'none' は「資料には記載がありません」が正解。
  expect: RegExp[] | 'none'
  // 答えに含まれていたら不正解にする表現(取り違えの検出)
  not?: RegExp
}

const u = (content: string): EvalMessage => ({ role: 'user', content })
const a = (content: string): EvalMessage => ({ role: 'assistant', content })

export const QUESTIONS: EvalQuestion[] = [
  { id: 'Q1 手当', kind: '単純', messages: [u('リモートワーク手当はいくらですか？')], expect: [/3,?000円/] },
  { id: 'Q2 締切', kind: '単純', messages: [u('経費精算の締切は毎月何日ですか？')], expect: [/7日/] },
  { id: 'Q3 在宅補助', kind: '言い換え', messages: [u('在宅勤務をするとお金の補助はありますか？')], expect: [/3,?000円/] },
  { id: 'Q4 家で仕事', kind: '言い換え', messages: [u('家で仕事をしていい日は、週に何日までですか？')], expect: [/3日/] },
  { id: 'Q5 PC紛失', kind: '言い換え', messages: [u('ノートパソコンをなくしてしまいました。いつまでに連絡すればいいですか？')], expect: [/1時間/] },
  { id: 'Q6 会食', kind: '言い換え', messages: [u('お客さんとの食事代は、1人いくらまで会社に出してもらえますか？')], expect: [/8,?000円/] },
  { id: 'Q7 誕生日', kind: '組み合わせ', messages: [u('誕生日休暇はいつまでに申請すればいいですか？')], expect: [/2週間/] },
  {
    id: 'Q8 続き:誕生日',
    kind: '続けて',
    messages: [
      u('誕生日休暇という制度はありますか？'),
      a('はい、誕生日休暇が1日あります。誕生月とその前後1か月の間に取得できます。'),
      u('それはいつまでに申請すればいい？'),
    ],
    expect: [/2週間/],
  },
  {
    id: 'Q9 続き:日当',
    kind: '続けて',
    messages: [
      u('出張のときの宿泊費の上限を教えてください。'),
      a('1泊あたり12,000円です。東京23区・大阪市内は14,000円です。'),
      u('じゃあ、泊まりのときの日当は？'),
    ],
    expect: [/3,?000円/],
  },
  {
    id: 'Q10 続き:グリーン車',
    kind: '続けて',
    messages: [u('出張で新幹線は使えますか？'), a('はい。片道100km以上の移動なら、指定席を利用できます。'), u('グリーン車はどうですか？')],
    expect: [/自己負担/],
  },
  { id: 'Q11 食堂', kind: '資料に無い', messages: [u('社員食堂の営業時間を教えてください。')], expect: 'none' },
  { id: 'Q12 駐車場', kind: '資料に無い', messages: [u('マイカー通勤で会社の駐車場を使うには、いくらかかりますか？')], expect: 'none' },
  {
    id: 'Q13 新入社員',
    kind: '文書またぎ',
    messages: [u('入社したばかりです。有給休暇は何日もらえますか？リモートワークはすぐにできますか？')],
    expect: [/10日/, /3(か|ヶ|カ)月/],
  },
  {
    id: 'Q14 深夜タクシー',
    kind: '文書またぎ',
    messages: [u('仕事が長引いて夜11時まで働き、タクシーで帰りました。必要な承認や手続きを教えてください。')],
    expect: [/部長/, /理由/],
  },
  {
    id: 'Q15 技術書',
    kind: '複数の事実',
    messages: [u('技術書を買いたいです。いくらまで買えて、読み終わったらどうすればいいですか？')],
    expect: [/5,?000円/, /寄贈|ライブラリ/],
  },
  { id: 'Q16 休日の紛失', kind: '複数の事実', messages: [u('休日の夜に会社のPCをなくしました。どこに電話すればいいですか？')], expect: [/045-000-0000/] },
  {
    id: 'Q17 5万円の承認',
    kind: '複数の事実',
    messages: [u('5万円の経費は、誰の承認が必要ですか？')],
    expect: [/上長/, /部長/],
    not: /管理本部長(の|まで|が|も|へ)?(承認|決裁)が必要/,
  },
  {
    id: 'Q18 リフレッシュ',
    kind: '組み合わせ',
    messages: [u('勤続5年でもらえるリフレッシュ休暇は何日で、いつまでに申請すればいいですか？')],
    expect: [/5日/, /2週間/],
  },
]

const NOT_FOUND = /記載(が|は)(ありません|ない|されていません)|見当たりません|記述(が|は)(ありません|ない)/

export function judge(q: EvalQuestion, answer: string): boolean {
  if (q.expect === 'none') {
    // 「記載がありません」と言いつつ、その前に金額や時刻をでっち上げていたら不正解
    const beforeNotFound = answer.replace(/記載[\s\S]*$/, '')
    return NOT_FOUND.test(answer) && !/\d+円|\d+時/.test(beforeNotFound)
  }
  return q.expect.every(r => r.test(answer)) && !(q.not && q.not.test(answer))
}
