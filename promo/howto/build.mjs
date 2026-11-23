/**
 * アプリの使い方動画（チャプタ）を組み立て、アプリから再生する用の動画とサムネイルを public/howto/ へ書き出す。
 *
 *   node promo/howto/build.mjs            # 全チャプタ
 *   node promo/howto/build.mjs ch3 rag    # 指定したチャプタだけ
 *
 * 基本の使い方は ch1〜ch6、応用編は web（Web検索）・rag（社内資料）・usage（AI利用状況）。どちらの動画に入るかは
 * lib/howto/chapters.ts の HOWTO_VIDEOS で決める。
 *
 * 先に shoot.mjs で撮っておく。字幕だけを直すなら、撮り直さずにこれだけを流せばよい。
 * 仕上がりの秒数は lib/howto/chapters.ts の duration に手で写す（一覧に長さを出すため）。
 *
 * 字幕の読み上げ文（say。無ければ大きい一言の text）を VOICEVOX で読み上げ、lib/howto/voices.json の声ごとに音声を
 * public/howto/<チャプタ>.<声>.m4a へ書き出す。受講者は再生画面で声を選べる（動画は映像と無音の
 * 音声トラックだけで、選んだ声の音声をアプリが動画に合わせて流す）。読み上げが字幕の表示時間に
 * 収まらないときは、その字幕の間だけ画面を止めて尺を延ばす。VOICEVOX を起動しておくこと。
 *   VOICEVOX_URL=http://localhost:50021   VOICEVOX の場所
 *   HOWTO_NARRATION=0                      読み上げの音声を書き出さない
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderCard, renderClip, renderPngs, retimer } from "../lib/render.mjs";

const out = new URL("../out/howto/", import.meta.url).pathname;
const png = `${out}png/`;
const clips = `${out}clips/`;
const pub = new URL("../../public/howto/", import.meta.url).pathname;
const voice = `${out}voice/`;
for (const d of [png, clips, pub, voice]) mkdirSync(d, { recursive: true });

const VOICEVOX_URL = (process.env.VOICEVOX_URL ?? "http://localhost:50021").replace(/\/+$/, "");
const NARRATION = process.env.HOWTO_NARRATION !== "0";
/** 受講者が選べる声。アプリの再生画面(app/components/HowtoVideo.tsx)と同じ一覧を使う。 */
const VOICES = JSON.parse(readFileSync(new URL("../../lib/howto/voices.json", import.meta.url), "utf8")).voices;
/** 読み上げの速さ（1 が標準）。 */
const VOICE_SPEED = 1.1;
/** 字幕の表示時間に収まらないときに、自動で速めてよい上限。 */
const VOICE_SPEED_MAX = 1.5;
/** 読み上げが次の字幕に切り替わるまでに終わるよう、最低これだけ余白を空ける（秒）。 */
const VOICE_MARGIN = 0.3;

const W = 1920;
const H = 1080;
const BAND = 150;
const FONT = `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif`;
/** アプリの色（ocean）に合わせる。 */
const BLUE = { deep: "#063F72", mid: "#085191", light: "#2F86D1" };

/** 字幕の帯。step は白い札（チャプタ名や、囲んでいる部品の名前）、title は小見出し、text は大きく出す一言。 */
function caption({ step, title, text }) {
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:transparent;font-family:${FONT}">
  <div style="position:absolute;left:0;right:0;bottom:0;height:${BAND}px;display:flex;align-items:center;gap:40px;padding:0 64px;
    background:linear-gradient(90deg,${BLUE.deep},${BLUE.mid} 55%,${BLUE.light});color:#fff">
    ${step ? `<div style="flex:none;background:#fff;color:${BLUE.deep};border-radius:999px;padding:14px 36px;font-size:38px;font-weight:800;white-space:nowrap">${step}</div>` : ""}
    <div style="min-width:0">
      ${title ? `<div style="font-size:30px;font-weight:600;opacity:.92;margin-bottom:6px;white-space:nowrap">${title}</div>` : ""}
      <div style="font-size:48px;font-weight:700;letter-spacing:1px;white-space:nowrap">${text}</div>
    </div>
  </div></body></html>`;
}

/**
 * 動画（基本の使い方・応用編）の最後に出す締めのカード。アプリの画面ではなく全画面の画で、
 * 受講者にこれからの AI 活用を呼びかけて終わる。lead は小見出し、text は大きく出す一言、sub は添える一文。
 */
function outroCard({ lead, text, sub }) {
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:${FONT};
    background:linear-gradient(135deg,${BLUE.deep} 0%,${BLUE.mid} 55%,${BLUE.light} 100%);color:#fff">
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:44px">
    <div style="font-size:44px;font-weight:600;opacity:.9;letter-spacing:2px">${lead}</div>
    <div style="font-size:104px;font-weight:800;letter-spacing:4px;white-space:nowrap">${text}</div>
    <div style="font-size:46px;font-weight:600;opacity:.95;white-space:nowrap">${sub}</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:64px;text-align:center;font-size:34px;font-weight:700;letter-spacing:6px;opacity:.75">AIチャット ハンズオン</div>
  </body></html>`;
}

/** 締めのカードの最短の長さ（秒）と、読み上げの前後に空ける間（秒）。 */
const OUTRO_MIN = 5;
const OUTRO_LEAD_IN = 0.6;
const OUTRO_TAIL = 1.4;

const HOLD = 2.5;
/** AI の応答待ち（1 文字目が出るまで）は縮める。 */
const wait = (from = "sent", to = "streaming") => ({ from, to, as: 0.4 });

// 字幕の say は読み上げる文。画面の帯（step・title・text）を見なくても分かるように、帯の内容を
// 話し言葉でつないで書く（省くと text をそのまま読む）。記号やアルファベットは読み間違えやすいので、
// say ではカタカナや言葉に開く（例: Shift + Enter → シフトキーを押しながらエンター）。
const CHAPTERS = [
  {
    id: "ch1",
    thumb: "model",
    // 撮影時に dev サーバのコンパイル待ちで止まった区間があれば、ほかの部品と同じ間（約 4.6 秒）に縮める。
    retime: [{ from: "quiz", to: "stats", as: 4.6 }],
    captions: [
      { at: 0, step: "チャプタ1", title: "AIチャットの使い方", text: "まずは、画面のどこに何があるかを確認しよう",
        say: "チャプタ1、画面の見かたです。まずは、どこに何があるかを確認しましょう。" },
      { at: "input", step: "入力欄", title: "AIへの質問やお願いを書く場所", text: "ここに書いて、AIに送ります",
        say: "これが入力欄です。AIへの質問やお願いを、ここに書いて送ります。" },
      { at: "examples", step: "例文", title: "何を聞けばいいか迷ったら", text: "押すと、入力欄に例文が入ります",
        say: "何を聞けばいいか迷ったら、例文のボタンを押してみましょう。入力欄に例文が入ります。" },
      { at: "model", step: "モデル", title: "使うAI（モデル）の切り替え", text: "研修では、講師の指示に合わせて選びます",
        say: "ここで、使うAIのモデルを切り替えます。研修では、講師の指示に合わせて選んでください。" },
      { at: "text", step: "テキスト", title: "ハンズオンの教材", text: "テキストを開いて、読みながら試せます",
        say: "このボタンで、ハンズオンのテキストを開きます。テキストを読みながら、チャットで試せます。" },
      { at: "quiz", step: "確認テスト", title: "学んだ内容のふりかえり", text: "AIが作る4択テストに挑戦できます",
        say: "確認テストでは、学んだ内容を、AIが作る4択の問題でふりかえれます。" },
      { at: "stats", step: "利用状況", title: "AI利用状況ダッシュボード", text: "みなさんがどんなふうにAIを使ったかを見られます",
        say: "AI利用状況ダッシュボードでは、みなさんがどんなふうにAIを使ったかを見られます。" },
      { at: "note", step: "大切なこと", title: "AIの回答は参考情報", text: "最後は、自分の目で確かめよう",
        say: "AIの回答は、あくまで参考情報です。最後は、自分の目で確かめましょう。" },
      { at: "howto", step: "使い方の動画", title: "この動画と応用編は、ここからいつでも見られます", text: "見たいチャプタを選んで再生できます",
        say: "この使い方の動画は、ここからいつでも見られます。となりの応用編では、ウェブ検索と、社内資料を使う方法、それにAIの利用状況の見かたを紹介しています。" },
    ],
  },
  {
    id: "ch2",
    thumb: "review",
    retime: [wait(), { from: "streaming", to: "answered", as: 6 }],
    captions: [
      { at: 0, step: "チャプタ2", title: "質問してみよう", text: "例文を使う方法と、自分で書く方法があります",
        say: "チャプタ2、質問してみよう。質問のしかたには、例文を使う方法と、自分で書く方法があります。" },
      { at: "example", step: "例文", title: "例文のボタンを押すと", text: "入力欄に文章が入ります（まだ送られません）",
        say: "例文のボタンを押すと、入力欄に文章が入ります。この時点では、まだ送られません。" },
      { at: "own", step: "自分で書く", title: "例文を消して、聞きたいことをそのまま書く", text: "ふだんの言葉で大丈夫",
        say: "例文を消して、聞きたいことを自分で書いてみます。ふだんの言葉で大丈夫です。" },
      { at: "newline", step: "改行", title: "Enter だけだと送信されてしまうので", text: "改行は Shift + Enter",
        say: "エンターキーだけだと送信されてしまいます。改行したいときは、シフトキーを押しながらエンターです。" },
      { at: "send", step: "送信", title: "書き終わったら", text: "Enter キーか、送信ボタンで送ります",
        say: "書き終わったら、エンターキーか、送信ボタンで送ります。" },
      { at: "streaming", step: "停止", title: "答えは少しずつ表示されます", text: "途中で止めたいときは ■ ボタン",
        say: "答えは少しずつ表示されます。途中で止めたいときは、赤い停止ボタンを押します。" },
      { at: "review", title: "答えが返ってきたら", text: "内容が正しいか、自分で確かめよう",
        say: "答えが返ってきたら、内容が正しいか、自分で確かめましょう。" },
    ],
  },
  {
    id: "ch3",
    thumb: "tokens",
    retime: [
      { from: "start", to: "typed", as: 3 },
      wait(),
      { from: "streaming", to: "answered", as: 5 },
      wait("regen-sent", "regen-streaming"),
      { from: "regen-streaming", to: "regen-answered", as: 5 },
    ],
    captions: [
      { at: 0, step: "チャプタ3", title: "答えを確かめる", text: "答えの下にあるボタンを使ってみよう",
        say: "チャプタ3、答えを確かめる。答えの下にあるボタンを使ってみましょう。" },
      { at: "regen-point", step: "再生成", title: "同じ質問で、答えを作り直す", text: "別の答え方を見たいときに",
        say: "再生成のボタンを押すと、同じ質問で答えを作り直します。別の答え方を見たいときに使います。" },
      { at: "versions", step: "見比べる", title: "作り直した答えは、どれも残っています", text: "‹ 1/2 › で前後の答えを切り替え",
        say: "作り直す前の答えも残っています。矢印のボタンで前後の答えを切り替えて、見比べられます。" },
      { at: "tokens-point", step: "トークン", title: "AIは文章を細かく区切って読み書きしています", text: "区切り（トークン）ごとに色分けして表示",
        say: "AIは、文章をトークンという細かい区切りで読み書きしています。このボタンで、トークンごとに色分けして表示できます。" },
      { at: "context", step: "コンテキスト", title: "AIが一度に覚えておける会話の量の目安", text: "いっぱいに近づいたら、新しいチャットへ",
        say: "コンテキストは、AIが一度に覚えておける会話の量の目安です。いっぱいに近づいたら、新しいチャットを始めましょう。" },
    ],
  },
  {
    id: "ch4",
    thumb: "shown",
    retime: [wait(), { from: "streaming", to: "answered", as: 5 }],
    captions: [
      { at: 0, step: "チャプタ4", title: "テキストを見ながら進める", text: "ハンズオンは、テキストと並べて進めます",
        say: "チャプタ4、テキストを見ながら進める。ハンズオンは、テキストと並べて進めます。" },
      { at: "open-point", step: "テキストを開く", title: "このボタンを押すと", text: "テキストが開きます",
        say: "このボタンを押して、テキストを開きます。" },
      { at: "opened", step: "テキスト", title: "右側にテキストが開きます", text: "左で試して、右で読む",
        say: "画面の右側にテキストが開きました。左のチャットで試して、右のテキストで読みながら進めます。" },
      { at: "tabs", step: "タブ", title: "上のタブで", text: "テキストを切り替えます",
        say: "上のタブで、読みたいテキストを切り替えます。" },
      { at: "font", step: "文字の大きさ", title: "読みにくいときは", text: "A のボタンで文字を大きく・小さく",
        say: "文字が読みにくいときは、エーのボタンで、文字を大きくしたり、小さくしたりできます。" },
      { at: "use-point", step: "入力", title: "テキストの例文の［入力］ボタンを押すと", text: "チャット欄に例文が入ります",
        say: "テキストの例文にある、入力ボタンを押すと、チャットの入力欄に例文が入ります。" },
      { at: "sent", step: "送信", title: "そのまま送って", text: "AIの答えを、テキストと見比べよう",
        say: "そのまま送って、AIの答えを、テキストと見比べてみましょう。" },
      { at: "full-point", step: "全画面", title: "テキストをじっくり読みたいときは", text: "全画面で表示できます",
        say: "テキストをじっくり読みたいときは、全画面で表示できます。" },
      { at: "closed", title: "もう一度ボタンを押すと", text: "テキストを閉じて、チャットを広く使えます",
        say: "使い終わったら、テキストを閉じると、チャットを広く使えます。" },
    ],
  },
  {
    id: "ch5",
    thumb: "proc-point",
    retime: [wait("sent", "thinking"), { from: "thinking", to: "answered", as: 6 }],
    captions: [
      { at: 0, step: "チャプタ5", title: "推論モード", text: "AIに、よく考えてから答えてもらう",
        say: "チャプタ5、推論モード。AIに、よく考えてから答えてもらう機能です。" },
      { at: "toggle-point", step: "推論モード", title: "電球のボタン（Gemma4 を選んでいるときだけ表示）", text: "押すと、推論モードがオンになります",
        say: "電球のボタンを押すと、推論モードがオンになります。このボタンは、ジェマフォーを選んでいるときだけ表示されます。" },
      { at: "typed", title: "順を追って考える問題を", text: "聞いてみます",
        say: "順を追って考える必要がある問題を、聞いてみます。" },
      { at: "thinking", step: "思考中", title: "答える前に", text: "AIが考えている途中です",
        say: "思考中と表示されている間は、AIが答える前に考えている途中です。" },
      { at: "proc-point", step: "思考プロセス", title: "AIが考えた道すじ（押すと開け閉めできます）", text: "答えの前に、どう考えたかを確かめられる",
        say: "思考プロセスを押すと、AIが考えた道すじが開いて、どう考えて答えたかを確かめられます。" },
      { at: "off", title: "答えが出るまで時間がかかるので", text: "ふだんはオフ、じっくり考えさせたいときにオン",
        say: "推論モードは、答えが出るまで時間がかかります。ふだんはオフにして、じっくり考えさせたいときだけオンにしましょう。" },
    ],
  },
  {
    id: "web",
    thumb: "sources",
    retime: [
      { from: "sent", to: "searching", as: 0.6 },
      { from: "searching", to: "searched", as: 3 },
      wait("searched", "streaming"),
      { from: "streaming", to: "answered", as: 6 },
    ],
    captions: [
      { at: 0, step: "応用編 1", title: "Web検索", text: "インターネットで調べてから答えてもらう",
        say: "応用編、チャプタ1、ウェブ検索。AIの知識は、学習した時点までのものです。ウェブ検索を使うと、インターネットで新しい情報を調べてから答えてもらえます。" },
      { at: "toggle-point", step: "Web検索", title: "地球のマークのボタン", text: "押すと、Web検索がオンになります",
        say: "入力欄の横にある、地球のマークのボタンを押すと、ウェブ検索がオンになります。" },
      { at: "notice", step: "注意", title: "検索キーワードはインターネットへ送られます", text: "個人情報や社外秘は入力しない",
        say: "オンの間は、質問から作った検索キーワードが、インターネットの検索エンジンへ送られます。個人情報や社外秘は、入力しないでください。" },
      { at: "typed", title: "AIが知らない最近の出来事を", text: "聞いてみます",
        say: "AIが知らない、最近の出来事を聞いてみます。" },
      { at: "searching", step: "検索中", title: "質問から検索キーワードを作って", text: "インターネットを検索しています",
        say: "AIが質問から検索キーワードを作って、インターネットを検索しています。" },
      { at: "streaming", title: "見つかったページの内容をもとに", text: "AIが答えをまとめます",
        say: "見つかったページの内容をもとに、AIが答えをまとめます。" },
      { at: "sources-point", step: "参照したWebページ", title: "答えの下のここを押すと", text: "AIが参考にしたページの一覧が開きます",
        say: "答えの下にある、参照したウェブページを押すと、AIが参考にしたページの一覧が開きます。" },
      { at: "sources", step: "出典", title: "検索キーワードと、参考にしたページ", text: "大事な情報は、元のページで確かめよう",
        say: "AIが実際に使った検索キーワードと、出典のリンクが表示されます。AIは検索結果の抜粋だけを読んで答えているので、大事な情報は、元のページで確かめましょう。" },
      { at: "searxng", step: "SearXNG", title: "この研修で使っている検索の仕組み", text: "いくつもの検索エンジンの結果をまとめるメタ検索エンジン",
        say: "この研修では、サークス・エヌジーという仕組みで検索しています。いくつもの検索エンジンにまとめて問い合わせて、結果を一つにまとめる、メタ検索エンジンです。研修用のサーバーから問い合わせるので、だれが検索したかは、検索エンジンには伝わりません。" },
      { at: "off-point", title: "答えが出るまで少し時間がかかるので", text: "ふだんはオフ、新しい情報が必要なときにオン",
        say: "ウェブ検索を使うと、答えが出るまで少し時間がかかります。ふだんはオフにして、新しい情報が必要なときだけオンにしましょう。" },
    ],
  },
  {
    id: "rag",
    thumb: "sources",
    retime: [
      { from: "start", to: "typed", as: 5 },
      wait(),
      { from: "streaming", to: "answered", as: 5 },
      wait("sent2", "streaming2"),
      { from: "streaming2", to: "answered2", as: 5 },
    ],
    captions: [
      { at: 0, step: "応用編 2", title: "社内資料を検索（RAG）", text: "登録された資料をもとに答えてもらう",
        say: "応用編、チャプタ2、社内資料の検索。ラグという仕組みを使うと、会社の規程などの資料を調べてから、AIに答えてもらえます。" },
      { at: "typed", title: "まずはRAGをオフのまま", text: "社内の決まりを聞いてみます",
        say: "まずは、ラグをオフのまま、社内の決まりを聞いてみます。" },
      { at: "review", step: "オフのとき", title: "AIは、この会社の決まりを知りません", text: "一般的な答えしか返せない",
        say: "AIは、この会社の決まりを知らないので、一般的な答えしか返せません。" },
      { at: "toggle-point", step: "RAG", title: "本のマークのボタン", text: "押すと、社内資料の検索がオンになります",
        say: "新しいチャットにして、入力欄の横にある、本のマークのボタンを押すと、社内資料の検索がオンになります。" },
      { at: "typed2", title: "同じ質問を", text: "もう一度聞いてみます",
        say: "同じ質問を、もう一度聞いてみます。" },
      { at: "streaming2", title: "質問に近い部分を資料から探して", text: "その内容をもとにAIが答えます",
        say: "AIは、質問に近い部分を登録された資料から探して、その内容をもとに答えます。" },
      { at: "2-review", step: "オンのとき", title: "資料に書かれた、この会社の決まりで", text: "具体的に答えられる",
        say: "今度は、資料に書かれた、この会社の決まりをもとに、具体的に答えられました。" },
      { at: "sources-point", step: "参照した資料", title: "答えの下のここを押すと", text: "AIが参考にした資料の一覧が開きます",
        say: "答えの下にある、参照した資料を押すと、AIが参考にした資料の一覧が開きます。" },
      { at: "sources", step: "出典", title: "資料の名前と、使った部分", text: "大事な内容は、元の資料で確かめよう",
        say: "どの資料の、どの部分を使ったかが表示されます。AIが読み違えることもあるので、大事な内容は、元の資料で確かめましょう。" },
      { at: "admin", step: "資料の登録", title: "検索する資料は、講師が管理者画面で登録します", text: "資料は研修用のサーバーの中だけで使われます",
        say: "検索する資料は、講師が管理者画面で登録します。資料は研修用のサーバーの中で検索されるので、インターネットには送られません。" },
      { at: "off-point", title: "資料に無いことは答えられないので", text: "社内の決まりを調べたいときにオン",
        say: "ラグは、登録された資料に無いことは答えられません。社内の決まりや資料について聞きたいときに、オンにしましょう。" },
    ],
  },
  {
    id: "usage",
    thumb: "flipped",
    retime: [],
    captions: [
      { at: 0, step: "応用編 3", title: "AI利用状況", text: "AIをどれだけ使ったかを、数字で確かめよう",
        say: "応用編、チャプタ3、AI利用状況。自分がAIをどれだけ使ったかを、数字で確かめられます。" },
      { at: "open-point", step: "利用状況", title: "右上のグラフのボタン", text: "押すと、利用状況のページが開きます",
        say: "右上にある、グラフのボタンを押すと、AI利用状況のページが開きます。" },
      { at: "note", step: "あなたの利用分", title: "このブラウザで使った分だけを集計", text: "会場全体ではなく、自分の分だけが出ます",
        say: "ここに出るのは、このブラウザで使った分だけです。サーバーには保存されず、ほかの受講者の分は含まれません。" },
      { at: "count", step: "質問した回数", title: "AIに質問を送った回数", text: "再生成も1回に数えます",
        say: "質問した回数は、AIに質問を送った回数です。答えを再生成したときも、1回に数えます。" },
      { at: "input", step: "入力トークン", title: "AIに渡した文章の量", text: "それまでの会話も一緒に渡すので、話が長いほど増える",
        say: "入力トークンは、AIに渡した文章の量です。質問だけでなく、それまでの会話も一緒に渡すので、同じチャットで話が長くなるほど増えます。" },
      { at: "output", step: "出力トークン", title: "AIが書いた答えの量", text: "長く答えてもらうほど増えます",
        say: "出力トークンは、AIが書いた答えの量です。長く答えてもらうほど増えます。" },
      { at: "cost", step: "推定コスト", title: "実際の料金はかかりません", text: "クラウドのAIで使った場合の目安",
        say: "推定コストは、同じくらいの大きさのAIを、クラウドのサービスで使った場合の目安です。この研修のAIは研修用のサーバーで動いているので、実際の料金はかかりません。" },
      { at: "flipped", step: "単価", title: "押すと裏返って、計算に使った単価が出ます", text: "入力より出力のほうが高い",
        say: "押すと裏返って、計算に使った単価が出ます。百万トークンあたりの値段で、大きいモデルほど高く、どちらのモデルも、入力より出力のほうが高く設定されています。" },
      { at: "latency", step: "平均レスポンス時間", title: "送ってから答え終わるまで", text: "1回あたりにかかった時間の平均",
        say: "平均レスポンス時間は、質問を送ってから、答えが書き終わるまでにかかった時間の平均です。" },
      { at: "models", step: "モデル別", title: "使ったモデルごとに", text: "コストと速さを見比べられます",
        say: "モデル別の比較では、使ったモデルごとに、1件あたりのコストと、答えの速さを見比べられます。" },
      { at: "speed", step: "生成速度", title: "1秒あたりに書けたトークンの数（tok/s）", text: "数字が大きいほど、速く書ける",
        say: "生成速度は、1秒あたりに書けたトークンの数です。数字が大きいほど、答えを速く書けています。" },
      { at: "services", step: "関連サービス", title: "Web検索と社内資料の検索の仕組み", text: "停止中のときは、講師に知らせよう",
        say: "下には、ウェブ検索と、社内資料の検索に使う仕組みが、動いているかどうかが出ます。停止中のときは、講師に知らせましょう。" },
      { at: "end", title: "聞き方しだいで、トークンもコストも変わる", text: "短く的確に聞くのが、賢い使い方",
        say: "聞き方しだいで、トークンもコストも変わります。短く、的確に聞くのが、賢いAIの使い方です。" },
    ],
    // 応用編の最後のチャプタなので、締めのカードを付ける。
    outro: {
      lead: "応用編は、ここまでです",
      text: "AIの活用を、ここから広げよう",
      sub: "調べる・確かめる・振り返るで、AIを賢く使いこなそう",
      say: "応用編は、ここまでです。このアプリから、みなさんのAI活用が広がっていくことを願っています。",
    },
  },
  {
    id: "ch6",
    thumb: "picked",
    retime: [
      { from: "start", to: "sent", as: 3 },
      wait(),
      { from: "streaming", to: "answered", as: 3 },
      { from: "generating", to: "question", as: 2.5 },
    ],
    captions: [
      { at: 0, step: "チャプタ6", title: "新しく始める・確認テスト", text: "話題を変えるときと、最後のふりかえり",
        say: "チャプタ6、新しく始める、確認テスト。話題を変えるときの方法と、最後のふりかえりです。" },
      { at: "clear-point", step: "新規チャット", title: "ゴミ箱のボタンで会話を消して", text: "新しい話題は、新しいチャットで",
        say: "話題を変えるときは、ゴミ箱のボタンで会話を消して、新しいチャットを始めます。前の話に引きずられずに答えてもらえます。" },
      { at: "quiz-point", step: "確認テスト", title: "ハンズオンのあとに", text: "学んだ内容を4択テストで確認",
        say: "ハンズオンのあとは、確認テストで、学んだ内容を4択の問題で確かめます。" },
      { at: "quiz", step: "確認テスト", title: "問題はAIがその場で作るので", text: "受けるたびに内容が変わります",
        say: "問題はAIがその場で作るので、受けるたびに内容が変わります。" },
      { at: "question", title: "1問ずつ答えると", text: "すぐに正解と解説が表示されます",
        say: "1問ずつ答えると、すぐに正解と解説が表示されます。" },
      { at: "done", title: "結果はこのブラウザにだけ記録されます", text: "何度でも挑戦しよう",
        say: "結果は、このブラウザにだけ記録されます。何度でも挑戦してみましょう。" },
    ],
    // 基本の使い方の最後のチャプタなので、締めのカードを付ける。
    outro: {
      lead: "使い方の動画は、ここまでです",
      text: "AIの活用を、ここから広げよう",
      sub: "試して、確かめて、毎日の仕事に活かしていこう",
      say: "使い方の動画は、ここまでです。このアプリから、みなさんのAI活用が広がっていくことを願っています。",
    },
  },
];

/** VOICEVOX へ POST する。動画の書き出しで間が空くと使い回しの接続が切れていることがあるので、数回まで送り直す。 */
async function voicevox(path, init) {
  for (let tries = 1; ; tries++) {
    try {
      return await fetch(`${VOICEVOX_URL}${path}`, { method: "POST", ...init });
    } catch (e) {
      if (tries >= 3) throw e;
    }
  }
}

/** 文を VOICEVOX で読み上げた wav を作り、ファイル名と長さ（秒）を返す。同じ文・話者なら作り直さない。 */
async function synthesize(text, speaker, speed = VOICE_SPEED) {
  const key = createHash("sha1").update(`${speaker}:${speed}:${text}`).digest("hex").slice(0, 16);
  const file = `${voice}${key}.wav`;
  if (!existsSync(file)) {
    const q = new URLSearchParams({ text, speaker: String(speaker) });
    const queryRes = await voicevox(`/audio_query?${q}`);
    if (!queryRes.ok) throw new Error(`VOICEVOX の audio_query に失敗しました (${queryRes.status})`);
    const query = await queryRes.json();
    query.speedScale = speed;
    query.prePhonemeLength = 0.05;
    query.postPhonemeLength = 0.1;
    const synthRes = await voicevox(`/synthesis?speaker=${speaker}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!synthRes.ok) throw new Error(`VOICEVOX の synthesis に失敗しました (${synthRes.status})`);
    writeFileSync(file, Buffer.from(await synthRes.arrayBuffer()));
  }
  const seconds = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim(),
  );
  return { file, seconds };
}

/** 字幕ごとの読み上げを、字幕が出る時刻に合わせて 1 本の音声(m4a)にする。 */
function writeNarration(lines, total, outFile) {
  const inputs = lines.flatMap((v) => ["-i", v.file]);
  const delayed = lines.map((v, i) => {
    const ms = Math.round(v.from * 1000);
    return `[${i}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`;
  });
  const mix = `${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad,atrim=0:${total.toFixed(3)}[aout]`;
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs, "-filter_complex", [...delayed, mix].join(";"), "-map", "[aout]",
    "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", outFile,
  ]);
}

/** 字幕で読み上げる文。say が無ければ帯の大きい一言をそのまま読む。 */
const spoken = (cap) => cap.say ?? cap.text;

/** 読み上げのために画面を止める位置は、字幕が出てからこの秒数後（素材の秒。囲みの枠が出きったころ）。 */
const PAUSE_AFTER = 0.6;

/**
 * 読み上げが字幕の表示時間に収まらない字幕について、その字幕が出た少し後で画面を止める区間
 * （retime の一時停止）を作る。どの声でも収まるよう、いちばん長い声に合わせる。
 */
async function narrationPauses(c, marks, duration, retime) {
  const map = retimer(marks, duration, retime);
  const total = map(duration) + HOLD;
  const raw = (at) => (typeof at === "number" ? at : marks.find((m) => m.name === at)?.t);
  const pauses = [];
  for (const [i, cap] of c.captions.entries()) {
    const from = raw(cap.at);
    if (from === undefined) throw new Error(`目印がありません: ${cap.at}`);
    const next = c.captions[i + 1];
    const nextRaw = next ? raw(next.at) : duration;
    const span = (next ? map(nextRaw) : total) - map(from);
    let longest = 0;
    for (const v of VOICES) longest = Math.max(longest, (await synthesize(spoken(cap), v.speaker)).seconds);
    // 0.1 秒は計算の誤差で収まらなくならないための余裕。
    const short = longest + VOICE_MARGIN + 0.1 - span;
    if (short > 0) {
      const at = Math.min(from + PAUSE_AFTER, (from + nextRaw) / 2);
      pauses.push({ from: at, to: at, as: Number(short.toFixed(3)) });
      console.log(`  ${c.id} 字幕${i + 1}: 読み上げに合わせて ${short.toFixed(1)} 秒止める`);
    }
  }
  return pauses;
}

const only = process.argv.slice(2);
for (const id of only) if (!CHAPTERS.some((c) => c.id === id)) throw new Error(`そんなチャプタはありません: ${id}`);
const targets = only.length ? CHAPTERS.filter((c) => only.includes(c.id)) : CHAPTERS;

function clamp(marks, duration, retime) {
  const at = (n) => (n === "start" ? 0 : n === "end" ? duration : marks.find((m) => m.name === n)?.t);
  return retime.map((r) => {
    const a = at(r.from);
    const b = at(r.to);
    if (a === undefined || b === undefined) throw new Error(`目印がありません: ${r.from} / ${r.to}`);
    return { ...r, as: Math.min(r.as, b - a) };
  });
}

for (const c of targets) {
  await renderPngs(
    c.captions.map((cap, i) => {
      cap.png = `${png}${c.id}-${i}.png`;
      return { html: caption(cap), file: cap.png, transparent: true };
    }),
  );
  const dir = `${out}${c.id}`;
  const { marks, duration } = JSON.parse(readFileSync(`${dir}/frames.json`, "utf8"));
  const retime = clamp(marks, duration, c.retime);
  if (NARRATION) retime.push(...(await narrationPauses(c, marks, duration, retime)));
  const fitTo = retimer(marks, duration, retime)(duration) + HOLD;
  const clip = `${clips}${c.id}.mp4`;
  const rendered = renderClip(dir, c.outro ? `${clips}${c.id}-body.mp4` : clip, { retime, captions: c.captions, fitTo });
  const spans = rendered.captions;
  let total = rendered.total;

  // 締めのカード。読み上げがいちばん長い声でも収まる長さにして、本編のうしろにつなぐ。
  let outroAt = null;
  if (c.outro) {
    let longest = 0;
    if (NARRATION) for (const v of VOICES) longest = Math.max(longest, (await synthesize(c.outro.say, v.speaker)).seconds);
    const length = Math.max(OUTRO_MIN, OUTRO_LEAD_IN + longest + OUTRO_TAIL);
    const cardPng = `${png}${c.id}-outro.png`;
    await renderPngs([{ html: outroCard(c.outro), file: cardPng }]);
    renderCard([{ png: cardPng, at: 0 }], `${clips}${c.id}-outro.mp4`, length.toFixed(3));
    const list = `${clips}${c.id}.txt`;
    writeFileSync(list, [`${clips}${c.id}-body.mp4`, `${clips}${c.id}-outro.mp4`].map((f) => `file '${f}'`).join("\n"));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", clip]);
    outroAt = total + OUTRO_LEAD_IN;
    total += length;
  }

  // 字幕ごとの読み上げ文（say）を、声ごとに読み上げる。表示時間は narrationPauses で読み上げに
  // 合わせて延ばしてあるので、ふつうは標準の速さで収まる。万一収まらない文は、その文だけ速めて
  // 読み直す（VOICE_SPEED_MAX まで）。それでも収まらなければ知らせる（収まらないと次の字幕の読み上げと声が重なる）。
  if (NARRATION) {
    for (const v of VOICES) {
      const lines = [];
      for (const [i, cap] of c.captions.entries()) {
        const span = spans[i].to - spans[i].from;
        let speed = VOICE_SPEED;
        let { file, seconds } = await synthesize(spoken(cap), v.speaker, speed);
        // 文の前後の無音は速さで縮まないため、一度では収まりきらないことがある。数回まで詰め直す。
        for (let tries = 0; tries < 3 && seconds + VOICE_MARGIN > span && speed < VOICE_SPEED_MAX; tries++) {
          speed = Math.min(Math.round((Math.ceil(speed * (seconds / (span - VOICE_MARGIN)) * 100) + 2)) / 100, VOICE_SPEED_MAX);
          ({ file, seconds } = await synthesize(spoken(cap), v.speaker, speed));
        }
        if (speed !== VOICE_SPEED) console.log(`  ${c.id} ${v.name} 字幕${i + 1}: 表示 ${span.toFixed(1)} 秒に合わせて ${speed} 倍で読む`);
        if (seconds + VOICE_MARGIN > span)
          console.warn(
            `  ⚠ ${c.id} ${v.name} 字幕${i + 1}「${spoken(cap)}」: 読み上げ ${seconds.toFixed(1)} 秒・表示 ${span.toFixed(1)} 秒（次の字幕まで余白 ${VOICE_MARGIN} 秒を取れない）`,
          );
        lines.push({ file, from: spans[i].from });
      }
      if (outroAt !== null) lines.push({ file: (await synthesize(c.outro.say, v.speaker)).file, from: outroAt });
      writeNarration(lines, total, `${pub}${c.id}.${v.id}.m4a`);
    }
  }

  // アプリから配信する版。画面の録画は動きが少ないので、画質を保ったまま軽くできる。
  // 声はアプリが別の音声ファイルで流すため、動画には無音の音声トラックだけを入れる
  // （音声トラックが無いと、ブラウザのプレーヤーで音量ボタンが使えなくなるため）。
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", clip, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
    "-map", "0:v", "-map", "1:a", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-tune", "stillimage", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "16k", "-movflags", "+faststart", `${pub}${c.id}.mp4`,
  ]);
  // 一覧に出すサムネイル。チャプタの中身が分かる場面（thumb の目印の少し後）から切り出す。
  const mark = marks.find((m) => m.name === c.thumb);
  if (!mark) throw new Error(`サムネイルの目印がありません: ${c.thumb}`);
  const thumbAt = Math.min(retimer(marks, duration, retime)(mark.t) + 1.2, total - 0.5);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", thumbAt.toFixed(2), "-i", clip, "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "4",
    `${pub}${c.id}.jpg`,
  ]);
  console.log(`${c.id}: ${total.toFixed(1)} 秒`);
}
