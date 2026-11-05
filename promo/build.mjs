/**
 * 展示会ブース用の 30 秒 CM（1 本 1 機能）を組み立てる。構成は docs/PROMO_VIDEO.md。
 *
 *   node promo/build.mjs              # 4 本と、4 本をつないだループ用の 1 本
 *   node promo/build.mjs cm2          # 1 本だけ
 *
 * アプリの画面は、撮ってあるフレーム（promo/out/<素材>/）を使う。先に promo/scenes/*.mjs で撮っておく。
 * 字幕やカードの文言だけを直すなら、撮り直さずにこれだけを流せばよい。
 */
import { existsSync, mkdirSync } from "node:fs";
import { closingCard, questionCard, titleCard } from "./lib/cards.mjs";
import { captionHtml, concatClips, renderCard, renderClip, renderPngs } from "./lib/render.mjs";

const out = new URL("./out/", import.meta.url).pathname;
const png = `${out}png/`;
const clips = `${out}clips/`;
mkdirSync(png, { recursive: true });
mkdirSync(clips, { recursive: true });

const occLogo = `${out}assets/occ-logo.png`;
if (!existsSync(occLogo))
  throw new Error(`OCC のロゴを ${occLogo} に置いてください（会社の素材なのでリポジトリには入れません）`);

/** 1 本 30 秒 = 問いかけ 4 + タイトル 3 + アプリの画面 17 + 締め 6。 */
const SECONDS = { question: 4, title: 3, closing: 6 };

/**
 * 各 CM の中身。scenes の seconds の合計を 17 にする。
 * from は素材のフォルダ、since / until は素材の切り出し（秒か目印）、retime は待ち時間の早送り。
 * captions の at は目印の名前か秒。〔〕で囲んだ所がオレンジになる（カードのみ）。
 */
const CMS = [
  {
    id: "cm1",
    file: "AIチャットハンズオン-CM01-テキストと並べて学ぶ",
    question: "AIの研修、\n〔聞くだけ〕で終わっていませんか？",
    title: "テキストを読みながら、\n〔その場で試せる〕",
    scenes: [
      {
        from: "cm1-text",
        seconds: 17,
        retime: [
          { from: "sent", to: "streaming", as: 0.6 },
          { from: "streaming", to: "answered", as: 5 },
        ],
        captions: [
          { at: 0, title: "ハンズオンテキストを、チャットの隣に", text: "読みながら学ぶ" },
          { at: "inserted", title: "テキストの例文は、ボタンひとつで入力欄へ", text: "そのまま試せる" },
          { at: "streaming", title: "社内に置いたローカルの AI が答える", text: "その場で確かめる" },
        ],
      },
    ],
  },
  {
    id: "cm2",
    file: "AIチャットハンズオン-CM02-プロンプト配信",
    question: "「このプロンプトを打ってください」\n〔全員そろう〕まで、待っていませんか？",
    title: "講師のプロンプトを、\n〔全員の画面へ〕",
    scenes: [
      {
        from: "cm2-teacher",
        seconds: 5,
        until: "teacher-done",
        captions: [{ at: 0, title: "講師が用意しておいたプロンプトを", text: "ボタンひとつで配信", who: "講師" }],
      },
      {
        from: "cm2-student",
        seconds: 12,
        since: "broadcast",
        retime: [
          { from: "sent", to: "streaming", as: 0.6 },
          { from: "streaming", to: "answered", as: 4 },
        ],
        captions: [
          { at: 0, title: "受講者の画面に、すぐ届く", text: "全員が同じスタートラインに", who: "受講者" },
          { at: "sent", title: "入力欄に入れて、送るだけ", text: "打ち間違いも、待ち時間もなし", who: "受講者" },
        ],
      },
    ],
  },
  {
    id: "cm3",
    file: "AIチャットハンズオン-CM03-確認テスト",
    question: "研修のあと、本当に〔理解できた〕か\n分かりますか？",
    title: "理解度は、AI が作る\n〔確認テスト〕で",
    scenes: [
      {
        from: "cm3-quiz",
        seconds: 17,
        retime: [
          { from: "started", to: "ready", as: 1.2 },
          { from: "help", to: "help-streaming", as: 0.5 },
          { from: "help-streaming", to: "help-done", as: 3 },
        ],
        captions: [
          { at: 0, title: "テキストの内容から、AI がその場で出題", text: "受けるたびに、新しい問題" },
          { at: "answered", title: "答えると、すぐに正解と解説", text: "間違えても、その場で学べる" },
          { at: "help", title: "分からなければ、AI がかみくだいて説明", text: "もう少し簡単に" },
        ],
      },
    ],
  },
  {
    id: "cm4",
    file: "AIチャットハンズオン-CM04-利用状況",
    question: "AI を使うと、\nどれくらい〔コスト〕がかかるか\n知っていますか？",
    title: "AI の使い方が、\n〔数字で見える〕",
    scenes: [
      {
        from: "cm4-usage",
        seconds: 17,
        captions: [
          { at: 0, title: "自分の利用状況を、ダッシュボードで", text: "質問の回数とトークン" },
          { at: "flipped", title: "クラウドの AI で使った場合に換算", text: "推定コストが分かる" },
          { at: "models", title: "モデルごとの速さとコストも比べられる", text: "賢い使い方が身につく" },
        ],
      },
    ],
  },
];

const only = process.argv[2];
const targets = only ? CMS.filter((c) => c.id === only) : CMS;
if (!targets.length) throw new Error(`そんな CM はありません: ${only}`);
for (const cm of targets)
  for (const s of cm.scenes)
    if (!existsSync(`${out}${s.from}/frames.json`))
      throw new Error(`${s.from} がまだ撮れていません。先に promo/scenes/ の台本で撮ってください`);

// 締めは全本共通なので 1 回だけ作る。
await renderPngs([
  { html: closingCard({ occLogo, shown: false }), file: `${png}closing-0.png` },
  { html: closingCard({ occLogo, shown: true }), file: `${png}closing-1.png` },
]);
const closing = `${clips}closing.mp4`;
renderCard(
  [
    { png: `${png}closing-0.png` },
    { png: `${png}closing-1.png`, at: 1.2 },
  ],
  closing,
  SECONDS.closing,
);

const finished = [];
for (const cm of targets) {
  const jobs = [
    { html: questionCard(cm.question), file: `${png}${cm.id}-question.png` },
    { html: titleCard({ no: `CM ${cm.id.slice(2).padStart(2, "0")}`, title: cm.title }), file: `${png}${cm.id}-title.png` },
  ];
  cm.scenes.forEach((s, si) =>
    s.captions.forEach((c, ci) => {
      c.png = `${png}${cm.id}-${si}-${ci}.png`;
      jobs.push({ html: captionHtml(c), file: c.png, transparent: true });
    }),
  );
  await renderPngs(jobs);

  const order = [];
  renderCard([{ png: `${png}${cm.id}-question.png` }], `${clips}${cm.id}-question.mp4`, SECONDS.question);
  order.push(`${clips}${cm.id}-question.mp4`);
  renderCard([{ png: `${png}${cm.id}-title.png` }], `${clips}${cm.id}-title.mp4`, SECONDS.title);
  order.push(`${clips}${cm.id}-title.mp4`);
  for (const [si, s] of cm.scenes.entries()) {
    const file = `${clips}${cm.id}-${si}.mp4`;
    const { speed } = renderClip(`${out}${s.from}`, file, {
      since: s.since,
      until: s.until,
      retime: s.retime,
      captions: s.captions,
      fitTo: s.seconds,
    });
    console.log(`${cm.id} ${s.from}: ${s.seconds} 秒（${speed.toFixed(2)} 倍速）`);
    order.push(file);
  }
  order.push(closing);
  const target = `${out}${cm.file}.mp4`;
  concatClips(order, target);
  finished.push(target);
  console.log(`書き出しました: ${target}`);
}

// 4 本そろっていれば、続けて流すループ用の 1 本も作る。
if (!only) {
  const loop = `${out}AIチャットハンズオン-CM-4本連続.mp4`;
  concatClips(finished, loop);
  console.log(`書き出しました: ${loop}`);
}
