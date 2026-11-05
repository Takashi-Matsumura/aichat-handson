/**
 * プロモーション動画の撮影の土台。
 *
 * Playwright 標準の recordVideo は画質が粗い（VP8・低ビットレート）ので、CDP の screencast で
 * フレームを 1 枚ずつ受け取り、受信時刻つきで保存する。あとで ffmpeg が時刻どおりに並べて mp4 にする。
 * 画面が変わらない間はフレームが来ないので、止まっている画面はファイルが増えない。
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

export const BASE_URL = process.env.PROMO_BASE_URL ?? "http://localhost:3000";

/**
 * 仕上がりは 1920x1080。下 150px は字幕の帯に使うので、アプリの画面は残りの 1920x930 に収める。
 * 画面は 1280x620 の広さで組み、1.5 倍の密度で撮る（ブースのモニターでも文字が読める大きさ）。
 */
export const VIEWPORT = { width: 1280, height: 620 };
export const SCALE = 1.5;

/** 動画に写したくないもの（開発用の印）を消し、矢印カーソルを足す。 */
const STAGE_SCRIPT = `
(() => {
  const css = \`
    nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
    [data-promo-hide] { visibility: hidden !important; }
    #promo-cursor {
      position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
      width: 22px; height: 22px; margin: -2px 0 0 -2px;
      transition: transform 0.05s linear;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.35));
    }
    #promo-cursor.down { scale: 0.85; }
  \`;
  const install = () => {
    if (document.getElementById("promo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "promo-cursor";
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    const last = JSON.parse(sessionStorage.getItem("promo-cursor") ?? JSON.stringify({ x: innerWidth / 2, y: innerHeight / 2 }));
    cursor.style.transform = "translate(" + last.x + "px," + last.y + "px)";
    document.body.appendChild(cursor);
    addEventListener("mousemove", (e) => {
      cursor.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
      sessionStorage.setItem("promo-cursor", JSON.stringify({ x: e.clientX, y: e.clientY }));
    }, true);
    addEventListener("mousedown", () => cursor.classList.add("down"), true);
    addEventListener("mouseup", () => cursor.classList.remove("down"), true);
  };
  if (document.body) install(); else addEventListener("DOMContentLoaded", install);
})();
`;

export async function openStage({
  storageState,
  args = [],
  permissions,
  viewport = VIEWPORT,
  scale = SCALE,
  extraHTTPHeaders,
} = {}) {
  // 新しいヘッドレス（channel: "chromium"）＋ --force-device-scale-factor でないと、
  // screencast のフレームが 1280x720 のまま届く（deviceScaleFactor の指定だけでは 1.5 倍にならない）。
  const browser = await chromium.launch({
    channel: "chromium",
    args: [`--force-device-scale-factor=${scale}`, ...args],
  });
  const context = await browser.newContext({
    viewport,
    extraHTTPHeaders,
    deviceScaleFactor: scale,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    storageState,
    permissions,
  });
  await context.addInitScript(STAGE_SCRIPT);
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * 撮影を始める。返り値の mark(名前) で「ここから先は早送りしてよい」などの目印を時刻つきで残せる。
 * stop() でフレームの一覧（frames.json）を書き出す。
 */
export async function startRecording(page, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const marks = [];
  let t0 = null;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    if (t0 === null) t0 = metadata.timestamp;
    const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp - t0 });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, everyNthFrame: 1 });
  const now = () => (frames.length ? frames[frames.length - 1].t : 0);
  const started = Date.now();
  return {
    mark: (name) => marks.push({ name, t: (Date.now() - started) / 1000 }),
    async stop() {
      await page.waitForTimeout(300);
      await cdp.send("Page.stopScreencast");
      const duration = Math.max(now(), (Date.now() - started) / 1000);
      writeFileSync(join(dir, "frames.json"), JSON.stringify({ duration, frames, marks }, null, 1));
      return { duration, frames: frames.length, marks };
    },
  };
}

/**
 * 人の手に見える速さでカーソルを動かして押す。
 * scroll: false は、押す先を画面内へ寄せない。はみ出しを隠している入れ物（丸いメニューなど）の中の部品は、
 * 寄せると入れ物の中身だけがずれて、見た目が崩れる。
 */
export async function moveAndClick(page, locator, { scroll = true } = {}) {
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("押す先が画面にありません");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}
