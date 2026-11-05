/**
 * 撮ったフレーム（frames.json）を mp4 にする。
 *
 * - 時間の伸び縮み: retime に [{ from, to, as }] を渡すと、目印 from〜to の区間を as 秒に縮める
 *   （AI の応答待ちのような「待つだけの時間」を早送りにする）。
 * - 字幕: 透明な PNG を同じ土台（Chromium）で作り、ffmpeg で上に重ねる。フォントは OS のものがそのまま使える。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

export const FPS = 30;
const W = 1920;
const H = 1080;

/** パンフレットの配色。 */
export const BRAND = { orange: "#F15A24", deep: "#E8380D", light: "#FFF3EA", ink: "#1A1A1A" };

/** 字幕の帯の高さ。アプリの画面はその上の 1920x930 に入る（recorder.mjs の VIEWPORT と対）。 */
export const BAND = 150;
const FONT = `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif`; // style="…" の中に入れるので、書体名は ' で囲む

/** 画面下の字幕帯（番号つきの見出し＋ひとこと）。who は右端に出す「誰の画面か」。 */
export function captionHtml({ no, title, text, who }) {
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:transparent;font-family:${FONT}">
  <div style="position:absolute;left:0;right:0;bottom:0;height:${BAND}px;display:flex;align-items:center;gap:36px;padding:0 64px;
    background:linear-gradient(90deg,${BRAND.deep},${BRAND.orange} 60%,#F7931E);color:#fff">
    ${no ? `<div style="font-size:76px;font-weight:800;letter-spacing:-2px;opacity:.95">${no}</div>` : ""}
    <div>
      ${title ? `<div style="font-size:30px;font-weight:600;opacity:.92;margin-bottom:6px">${title}</div>` : ""}
      <div style="font-size:46px;font-weight:700;letter-spacing:1px">${text}</div>
    </div>
    ${who ? `<div style="margin-left:auto;background:#fff;color:${BRAND.deep};border-radius:999px;padding:12px 34px;font-size:32px;font-weight:700;white-space:nowrap">${who}</div>` : ""}
  </div></body></html>`;
}

/** HTML を 1920x1080 の PNG にする。jobs は [{ html, file, transparent }]（字幕は透明な地、カードは白い地）。 */
export async function renderPngs(jobs) {
  // 旧ヘッドレス（既定）は日本語が明朝に落ちるので、撮影と同じ新しいヘッドレスで描く。
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: W, height: H }, locale: "ja-JP" });
  for (const { html, file, transparent } of jobs) {
    await page.setContent(html);
    await page.screenshot({ path: file, omitBackground: !!transparent });
  }
  await browser.close();
}

export const ENCODE = [
  "-r",
  String(FPS),
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "16",
  "-pix_fmt",
  "yuv420p",
];
/** 場面の変わり目は白を経由する（アプリの画面もカードも地が白いので、いちばん目立たない）。 */
const FADE = 0.3;
const edgeFade = (d) =>
  `fade=t=in:st=0:d=${FADE}:color=white,fade=t=out:st=${(d - FADE).toFixed(3)}:d=${FADE}:color=white`;

/** 目印の時刻を使って、区間ごとに時間を伸び縮みさせる関数を作る。 */
export function retimer(marks, duration, retime = []) {
  const at = (name) => {
    if (name === "start") return 0;
    if (name === "end") return duration;
    const m = marks.find((x) => x.name === name);
    if (!m) throw new Error(`目印がありません: ${name}`);
    return m.t;
  };
  const spans = retime
    .map((r) => ({ a: at(r.from), b: at(r.to), as: r.as }))
    .sort((x, y) => x.a - y.a);
  return (t) => {
    let out = t;
    for (const s of spans) {
      if (t >= s.b) out -= s.b - s.a - s.as;
      else if (t > s.a) out -= (t - s.a) * (1 - s.as / (s.b - s.a));
    }
    return out;
  };
}

/**
 * 撮った素材の前後を切り落とす。since / until は秒か目印の名前（省くと素材の始め・終わり）。
 * 切った後の始まりを 0 秒に詰める（目印の時刻もずらす）。
 */
export function trim(shot, since, until) {
  if (since === undefined && until === undefined) return shot;
  const at = (x, fallback) => {
    if (x === undefined) return fallback;
    if (typeof x === "number") return x;
    const m = shot.marks.find((m) => m.name === x);
    if (!m) throw new Error(`目印がありません: ${x}`);
    return m.t;
  };
  const a = at(since, 0);
  const b = at(until, shot.duration);
  // 始まりの画面は、since より前で最後に撮れたフレーム（画面が変わらない間はフレームが届かないため）。
  const first = shot.frames.filter((f) => f.t <= a).at(-1);
  const frames = shot.frames.filter((f) => f.t > a && f.t <= b);
  if (first) frames.unshift({ ...first, t: a });
  return {
    duration: b - a,
    frames: frames.map((f) => ({ ...f, t: f.t - a })),
    marks: shot.marks.filter((m) => m.t >= a && m.t <= b).map((m) => ({ ...m, t: m.t - a })),
  };
}

/**
 * dir のフレームを mp4 にする。captions は [{ png, at }]。at は素材の目印の名前か、仕上がりの秒。
 * 字幕は次の字幕の at まで出す（最後の字幕は終わりまで）。
 * since / until は素材の切り出し（trim）。
 * 仕上がりの長さ（秒）を返す。
 */
export function renderClip(
  dir,
  outFile,
  { retime, captions: cues = [], fitTo, since, until } = {},
) {
  const shot = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8"));
  const { duration, frames, marks } = trim(shot, since, until);
  const base = retimer(marks, duration, retime);
  // fitTo: 仕上がりの秒数をそろえる。長ければ全体を少し早送りし、短ければ最後の画面で止めて待つ。
  const speed = fitTo ? Math.max(base(duration) / fitTo, 1) : 1;
  const map = (t) => base(t) / speed;
  const total = fitTo ?? map(duration);
  const when = (at) => {
    if (typeof at === "number") return at;
    const m = marks.find((x) => x.name === at);
    if (!m) throw new Error(`目印がありません: ${at}`);
    return Math.min(map(m.t), total);
  };
  const captions = cues.map((c, i) => ({
    png: c.png,
    from: when(c.at ?? 0).toFixed(3),
    to: cues[i + 1] ? when(cues[i + 1].at).toFixed(3) : undefined,
  }));
  // 1 フレームより短い間隔のフレームは捨てる（早送りの区間で大量に余るため）。
  const kept = [];
  for (const f of frames) {
    const t = map(f.t);
    if (kept.length && t - kept[kept.length - 1].t < 1 / FPS)
      kept[kept.length - 1] = { ...f, t: kept[kept.length - 1].t };
    else kept.push({ ...f, t });
  }
  const lines = ["ffconcat version 1.0"];
  kept.forEach((f, i) => {
    const next = i + 1 < kept.length ? kept[i + 1].t : total;
    lines.push(`file '${f.file}'`, `duration ${Math.max(next - f.t, 1 / FPS).toFixed(4)}`);
  });
  lines.push(`file '${kept[kept.length - 1].file}'`);
  const list = join(dir, "frames.ffconcat");
  writeFileSync(list, `${lines.join("\n")}\n`);

  const input = ["-f", "concat", "-safe", "0", "-i", list];
  const args = ["-y", "-loglevel", "error", ...input];
  for (const c of captions) args.push("-loop", "1", "-i", c.png);
  let chain = `[0:v]fps=${FPS},scale=${W}:${H - BAND}:flags=lanczos,pad=${W}:${H}:0:0:color=0xF15A24,format=yuv420p[v0]`;
  // 帯は出したままにして、文だけを切り替える（帯ごと消すと画面がちらつく）。
  captions.forEach((c, i) => {
    chain += `;[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${c.from},${c.to ?? total})'[v${i + 1}]`;
  });
  chain += `;[v${captions.length}]tpad=stop_mode=clone:stop_duration=${total.toFixed(3)},${edgeFade(total)}[out]`;
  args.push("-filter_complex", chain, "-map", "[out]", "-t", total.toFixed(3), ...ENCODE, outFile);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return { total, speed };
}

/**
 * 静止画のカードを動画にする。layers は [{ png, at }]。2 枚目以降は at 秒にふわっと重なる
 * （前の画に要素を足した画を重ねれば、要素が 1 つずつ現れるように見える）。
 */
export function renderCard(layers, outFile, duration) {
  const args = ["-y", "-loglevel", "error"];
  for (const l of layers)
    args.push("-loop", "1", "-framerate", String(FPS), "-t", String(duration), "-i", l.png);
  let chain = "[0:v]format=yuv420p[v0]";
  layers.slice(1).forEach((l, i) => {
    chain += `;[${i + 1}:v]format=rgba,fade=t=in:st=${l.at}:d=0.5:alpha=1[l${i}]`;
    chain += `;[v${i}][l${i}]overlay=0:0:enable='gte(t,${l.at})'[v${i + 1}]`;
  });
  chain += `;[v${layers.length - 1}]${edgeFade(duration)}[out]`;
  args.push("-filter_complex", chain, "-map", "[out]", "-t", String(duration), ...ENCODE, outFile);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
}

/** できたクリップを順につなぐ。音は無音のトラックを 1 本入れる（音声が無いと再生できない機器への備え）。 */
export function concatClips(files, outFile) {
  const list = `${outFile}.txt`;
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-shortest",
      "-movflags",
      "+faststart",
      outFile,
    ],
    { stdio: "inherit" },
  );
}
