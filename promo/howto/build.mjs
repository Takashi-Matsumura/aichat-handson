/**
 * アプリの使い方動画（チャプタ）を組み立て、アプリから再生する用の動画とサムネイルを public/howto/ へ書き出す。
 *
 *   node promo/howto/build.mjs        # 全チャプタ
 *   node promo/howto/build.mjs ch3    # 1 本だけ
 *
 * 先に shoot.mjs で撮っておく。字幕だけを直すなら、撮り直さずにこれだけを流せばよい。
 * 仕上がりの秒数は lib/howto/chapters.ts の duration に手で写す（一覧に長さを出すため）。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { renderClip, renderPngs, retimer } from "../lib/render.mjs";

const out = new URL("../out/howto/", import.meta.url).pathname;
const png = `${out}png/`;
const clips = `${out}clips/`;
const pub = new URL("../../public/howto/", import.meta.url).pathname;
for (const d of [png, clips, pub]) mkdirSync(d, { recursive: true });

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

const HOLD = 2.5;
/** AI の応答待ち（1 文字目が出るまで）は縮める。 */
const wait = (from = "sent", to = "streaming") => ({ from, to, as: 0.4 });

const CHAPTERS = [
  {
    id: "ch1",
    thumb: "model",
    // 撮影時に dev サーバのコンパイル待ちで止まった区間があれば、ほかの部品と同じ間（約 4.6 秒）に縮める。
    retime: [{ from: "quiz", to: "stats", as: 4.6 }],
    captions: [
      { at: 0, step: "チャプタ1", title: "AIチャットの使い方", text: "まずは、画面のどこに何があるかを確認しよう" },
      { at: "input", step: "入力欄", title: "AIへの質問やお願いを書く場所", text: "ここに書いて、AIに送ります" },
      { at: "examples", step: "例文", title: "何を聞けばいいか迷ったら", text: "押すと、入力欄に例文が入ります" },
      { at: "model", step: "モデル", title: "使うAI（モデル）の切り替え", text: "研修では、講師の指示に合わせて選びます" },
      { at: "text", step: "テキスト", title: "ハンズオンの教材", text: "テキストを開いて、読みながら試せます" },
      { at: "quiz", step: "確認テスト", title: "学んだ内容のふりかえり", text: "AIが作る4択テストに挑戦できます" },
      { at: "stats", step: "利用状況", title: "AI利用状況ダッシュボード", text: "みんながどんなふうにAIを使ったかを見られます" },
      { at: "note", step: "大切なこと", title: "AIの回答は参考情報", text: "最後は、自分の目で確かめよう" },
      { at: "howto", step: "使い方の動画", title: "この動画は、ここからいつでも見られます", text: "見たいチャプタを選んで再生できます" },
    ],
  },
  {
    id: "ch2",
    thumb: "review",
    retime: [wait(), { from: "streaming", to: "answered", as: 6 }],
    captions: [
      { at: 0, step: "チャプタ2", title: "質問してみよう", text: "例文を使う方法と、自分で書く方法があります" },
      { at: "example", step: "例文", title: "例文のボタンを押すと", text: "入力欄に文章が入ります（まだ送られません）" },
      { at: "own", step: "自分で書く", title: "例文を消して、聞きたいことをそのまま書く", text: "ふだんの言葉で大丈夫" },
      { at: "newline", step: "改行", title: "Enter だけだと送信されてしまうので", text: "改行は Shift + Enter" },
      { at: "send", step: "送信", title: "書き終わったら", text: "Enter キーか、送信ボタンで送ります" },
      { at: "streaming", step: "停止", title: "答えは少しずつ表示されます", text: "途中で止めたいときは ■ ボタン" },
      { at: "review", title: "答えが返ってきたら", text: "内容が正しいか、自分で確かめよう" },
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
      { at: 0, step: "チャプタ3", title: "答えを確かめる", text: "答えの下にあるボタンを使ってみよう" },
      { at: "regen-point", step: "再生成", title: "同じ質問で、答えを作り直す", text: "別の答え方を見たいときに" },
      { at: "versions", step: "見比べる", title: "作り直した答えは、どれも残っています", text: "‹ 1/2 › で前後の答えを切り替え" },
      { at: "tokens-point", step: "トークン", title: "AIは文章を細かく区切って読み書きしています", text: "区切り（トークン）ごとに色分けして表示" },
      { at: "context", step: "コンテキスト", title: "AIが一度に覚えておける会話の量の目安", text: "いっぱいに近づいたら、新しいチャットへ" },
    ],
  },
  {
    id: "ch4",
    thumb: "shown",
    retime: [wait(), { from: "streaming", to: "answered", as: 5 }],
    captions: [
      { at: 0, step: "チャプタ4", title: "テキストを見ながら進める", text: "ハンズオンは、テキストと並べて進めます" },
      { at: "opened", step: "テキスト", title: "右側にテキストが開きます", text: "左で試して、右で読む" },
      { at: "tabs", step: "タブ", title: "上のタブで", text: "テキストを切り替えます" },
      { at: "font", step: "文字の大きさ", title: "読みにくいときは", text: "A のボタンで文字を大きく・小さく" },
      { at: "use-point", step: "入力", title: "テキストの例文の［入力］ボタンを押すと", text: "チャット欄に例文が入ります" },
      { at: "sent", step: "送信", title: "そのまま送って", text: "AIの答えを、テキストと見比べよう" },
      { at: "full-point", step: "全画面", title: "テキストをじっくり読みたいときは", text: "全画面で表示できます" },
      { at: "closed", title: "もう一度ボタンを押すと", text: "テキストを閉じて、チャットを広く使えます" },
    ],
  },
  {
    id: "ch5",
    thumb: "proc-point",
    retime: [wait("sent", "thinking"), { from: "thinking", to: "answered", as: 6 }],
    captions: [
      { at: 0, step: "チャプタ5", title: "推論モード", text: "AIに、よく考えてから答えてもらう" },
      { at: "toggle-point", step: "推論モード", title: "電球のボタン（Gemma4 を選んでいるときだけ表示）", text: "押すと、推論モードがオンになります" },
      { at: "typed", title: "順を追って考える問題を", text: "聞いてみます" },
      { at: "thinking", step: "思考中", title: "答える前に", text: "AIが考えている途中です" },
      { at: "proc-point", step: "思考プロセス", title: "AIが考えた道すじ（押すと開け閉めできます）", text: "答えの前に、どう考えたかを確かめられる" },
      { at: "off", title: "答えが出るまで時間がかかるので", text: "ふだんはオフ、じっくり考えさせたいときにオン" },
    ],
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
      { at: 0, step: "チャプタ6", title: "新しく始める・確認テスト", text: "話題を変えるときと、最後のふりかえり" },
      { at: "clear-point", step: "新規チャット", title: "ゴミ箱のボタンで会話を消して", text: "新しい話題は、新しいチャットで" },
      { at: "quiz-point", step: "確認テスト", title: "ハンズオンのあとに", text: "学んだ内容を4択テストで確認" },
      { at: "quiz", step: "確認テスト", title: "問題はAIがその場で作るので", text: "受けるたびに内容が変わります" },
      { at: "question", title: "1問ずつ答えると", text: "すぐに正解と解説が表示されます" },
      { at: "done", title: "結果はこのブラウザにだけ記録されます", text: "何度でも挑戦しよう" },
    ],
  },
];

const only = process.argv[2];
const targets = only ? CHAPTERS.filter((c) => c.id === only) : CHAPTERS;
if (!targets.length) throw new Error(`そんなチャプタはありません: ${only}`);

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
  const fitTo = retimer(marks, duration, retime)(duration) + HOLD;
  const clip = `${clips}${c.id}.mp4`;
  const { total } = renderClip(dir, clip, { retime, captions: c.captions, fitTo });
  // アプリから配信する版。画面の録画は動きが少ないので、画質を保ったまま軽くできる。音声は入れない。
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", clip,
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-tune", "stillimage", "-pix_fmt", "yuv420p",
    "-an", "-movflags", "+faststart", `${pub}${c.id}.mp4`,
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
