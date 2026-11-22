/**
 * アプリの使い方動画（チャプタ）を組み立て、アプリから再生する用の動画とサムネイルを public/howto/ へ書き出す。
 *
 *   node promo/howto/build.mjs        # 全チャプタ
 *   node promo/howto/build.mjs ch3    # 1 本だけ
 *
 * 先に shoot.mjs で撮っておく。字幕だけを直すなら、撮り直さずにこれだけを流せばよい。
 * 仕上がりの秒数は lib/howto/chapters.ts の duration に手で写す（一覧に長さを出すため）。
 *
 * 字幕の大きい一言（text）を VOICEVOX で読み上げ、lib/howto/voices.json の声ごとに音声を
 * public/howto/<チャプタ>.<声>.m4a へ書き出す。受講者は再生画面で声を選べる（動画は映像と無音の
 * 音声トラックだけで、選んだ声の音声をアプリが動画に合わせて流す）。VOICEVOX を起動しておくこと。
 *   VOICEVOX_URL=http://localhost:50021   VOICEVOX の場所
 *   HOWTO_NARRATION=0                      読み上げの音声を書き出さない
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderClip, renderPngs, retimer } from "../lib/render.mjs";

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

/** 文を VOICEVOX で読み上げた wav を作り、ファイル名と長さ（秒）を返す。同じ文・話者なら作り直さない。 */
async function synthesize(text, speaker, speed = VOICE_SPEED) {
  const key = createHash("sha1").update(`${speaker}:${speed}:${text}`).digest("hex").slice(0, 16);
  const file = `${voice}${key}.wav`;
  if (!existsSync(file)) {
    const q = new URLSearchParams({ text, speaker: String(speaker) });
    const queryRes = await fetch(`${VOICEVOX_URL}/audio_query?${q}`, { method: "POST" });
    if (!queryRes.ok) throw new Error(`VOICEVOX の audio_query に失敗しました (${queryRes.status})`);
    const query = await queryRes.json();
    query.speedScale = speed;
    query.prePhonemeLength = 0.05;
    query.postPhonemeLength = 0.1;
    const synthRes = await fetch(`${VOICEVOX_URL}/synthesis?speaker=${speaker}`, {
      method: "POST",
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
  const { total, captions: spans } = renderClip(dir, clip, { retime, captions: c.captions, fitTo });

  // 字幕の大きい一言を、声ごとに読み上げる。字幕の表示時間に収まらない文は、その文だけ
  // 速めて読み直す（VOICE_SPEED_MAX まで）。それでも収まらなければ知らせる
  // （字幕の at をずらすか、文を短くして直す。収まらないと次の字幕の読み上げと声が重なる）。
  if (NARRATION) {
    for (const v of VOICES) {
      const lines = [];
      for (const [i, cap] of c.captions.entries()) {
        const span = spans[i].to - spans[i].from;
        let speed = VOICE_SPEED;
        let { file, seconds } = await synthesize(cap.text, v.speaker, speed);
        // 文の前後の無音は速さで縮まないため、一度では収まりきらないことがある。数回まで詰め直す。
        for (let tries = 0; tries < 3 && seconds + VOICE_MARGIN > span && speed < VOICE_SPEED_MAX; tries++) {
          speed = Math.min(Math.round((Math.ceil(speed * (seconds / (span - VOICE_MARGIN)) * 100) + 2)) / 100, VOICE_SPEED_MAX);
          ({ file, seconds } = await synthesize(cap.text, v.speaker, speed));
        }
        if (speed !== VOICE_SPEED) console.log(`  ${c.id} ${v.name} 字幕${i + 1}: 表示 ${span.toFixed(1)} 秒に合わせて ${speed} 倍で読む`);
        if (seconds + VOICE_MARGIN > span)
          console.warn(
            `  ⚠ ${c.id} ${v.name} 字幕${i + 1}「${cap.text}」: 読み上げ ${seconds.toFixed(1)} 秒・表示 ${span.toFixed(1)} 秒（次の字幕まで余白 ${VOICE_MARGIN} 秒を取れない）`,
          );
        lines.push({ file, from: spans[i].from });
      }
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
