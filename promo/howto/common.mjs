/**
 * アプリの使い方動画（トップページから見られるチャプタ動画）の撮影で共通に使う操作。
 *
 * 撮影の前提: dev サーバ（3000）と llama.cpp のモデル。テキストのパネル・確認テストはモデル 2 を使うので、
 * モデル 2 のサーバが無い環境では、dev サーバを LLAMA_API_URL_2 をモデル 1 の URL にして起動しておく。
 * 表示名は LLAMA_MODEL_LABEL_1 / _2 で付ける（例: Gemma4 / Gemma3）。
 */
import { moveAndClick, openStage, startRecording } from "../lib/recorder.mjs";
import { openChat, sendAndWait } from "../scenes/common.mjs";

export const OUT = new URL("../out/howto/", import.meta.url).pathname;
export { moveAndClick, sendAndWait };

/** 舞台を開き、まっさらなチャットを出して撮影を始める。 */
export async function begin(name, { model = 2 } = {}) {
  const { browser, page } = await openStage();
  // llama.cpp を別名なしで起動していると、モデル名がファイルのフルパス（ホームのパスを含む）で返る。
  // ボタンの title に入るので、撮影中はファイル名だけに縮める。
  await page.route("**/api/model-info**", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    if (typeof body.model === "string") body.model = body.model.split("/").pop();
    await route.fulfill({ response: res, json: body });
  });
  await openChat(page, { model });
  const rec = await startRecording(page, `${OUT}${name}`);
  await page.waitForTimeout(1000);
  return { browser, page, rec };
}

export async function finish(name, browser, rec) {
  const result = await rec.stop();
  console.log(
    `${name}:`,
    result.duration.toFixed(1),
    "秒",
    result.marks.map((m) => `${m.name}=${m.t.toFixed(1)}`).join(" "),
  );
  await browser.close();
}

export const input = (page) => page.getByPlaceholder(/メッセージを入力/);

/** 入力欄に、人の手に見える速さで打つ。lines が配列なら Shift+Enter で改行する。 */
export async function typeInto(page, lines, { delay = 60, click = true } = {}) {
  if (click) await moveAndClick(page, input(page));
  const list = Array.isArray(lines) ? lines : [lines];
  for (const [i, line] of list.entries()) {
    if (i > 0) await page.keyboard.press("Shift+Enter");
    if (line) await page.keyboard.type(line, { delay });
  }
}

/**
 * 説明している部品を、枠で囲んで目立たせる（撮影用に重ねるだけで、アプリには手を入れない）。
 * カーソルもその部品へ動かす。返り値の関数で枠を消す。
 */
export async function spotlight(page, locator, { pad = 6, hover = true } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("囲む先が画面にありません");
  if (hover) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await page.evaluate(
    ({ x, y, w, h, pad }) => {
      document.getElementById("promo-spot")?.remove();
      const el = document.createElement("div");
      el.id = "promo-spot";
      Object.assign(el.style, {
        position: "fixed",
        left: `${x - pad}px`,
        top: `${y - pad}px`,
        width: `${w + pad * 2}px`,
        height: `${h + pad * 2}px`,
        border: "3px solid #F59E0B",
        borderRadius: "12px",
        boxShadow: "0 0 0 4px rgba(245,158,11,.25), 0 0 0 9999px rgba(15,23,42,.18)",
        pointerEvents: "none",
        zIndex: "2147483646",
        opacity: "0",
        transition: "opacity .25s ease",
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = "1"));
    },
    { x: box.x, y: box.y, w: box.width, h: box.height, pad },
  );
  return () => page.evaluate(() => document.getElementById("promo-spot")?.remove());
}

export const unspot = (page) => page.evaluate(() => document.getElementById("promo-spot")?.remove());

/** ページ送り 1 回ごとに止まる時間（ミリ秒）。 */
const READ_MS = 4000;

export const lastAnswer = (page) => page.locator("div.flex.justify-start").last();

/** 長い答えを、頭から読めるように見せ直す（画面の半分ずつ送り、送るたびに止まる）。 */
export async function review(page, rec, { prefix = "", read = READ_MS } = {}) {
  const scroller = page.locator("div.flex-1.overflow-y-auto").first();
  const tall = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  const offset = await lastAnswer(page).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const sc = el.closest(".overflow-y-auto");
    return box.top - sc.getBoundingClientRect().top;
  });
  if (tall <= 0 || offset >= -10) {
    rec.mark(`${prefix}review`);
    await page.waitForTimeout(read);
    rec.mark(`${prefix}reviewed`);
    return;
  }
  await scroller.evaluate((el, d) => el.scrollBy({ top: d - 80, behavior: "smooth" }), offset);
  await page.waitForTimeout(1200);
  rec.mark(`${prefix}review`);
  await page.waitForTimeout(read);
  for (;;) {
    const left = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
    if (left <= 2) break;
    await scroller.evaluate((el) => el.scrollBy({ top: Math.round(el.clientHeight * 0.5), behavior: "smooth" }));
    await page.waitForTimeout(read);
  }
  rec.mark(`${prefix}reviewed`);
}
