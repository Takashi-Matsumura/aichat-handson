/**
 * 撮影の台本で共通に使う操作。
 */
import { BASE_URL, moveAndClick } from "../lib/recorder.mjs";

export const OUT = new URL("../out/", import.meta.url).pathname;

/**
 * チャット画面を、毎回同じ状態で開く。
 * テキストのパネルは閉じ、推論モードと RAG は切り、model（1 か 2）を選ぶ。既定はハンズオン中に使うモデル 2。
 * 会話はタブ内（sessionStorage）に残るので、それも消す。
 */
export async function openChat(page, { model = 2 } = {}) {
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.setItem("handson-panel-open", "false");
    localStorage.setItem("thinking-mode", "false");
    localStorage.setItem("rag-mode", "false");
    sessionStorage.clear();
  });
  await page.reload();
  await page.getByPlaceholder(/メッセージを入力/).waitFor();
  await page.waitForTimeout(800);
  // モデルは画面の切り替えを押して選ぶ（利用状況のモデル名は、選んだ側の名前で記録される）。
  const switcher = page.locator("header button[title]").nth(model - 1);
  if (!(await switcher.getAttribute("class"))?.includes("bg-ocean-700")) await switcher.click();
  await page.waitForTimeout(500);
}

/** 送信を押し、AI の答えが出始めた所と出終わった所に目印を付ける。 */
export async function sendAndWait(page, rec, { prefix = "" } = {}) {
  await moveAndClick(page, page.getByRole("button", { name: "送信" }));
  rec.mark(`${prefix}sent`);
  const stop = page.getByRole("button", { name: "生成を停止" });
  await stop.waitFor({ timeout: 30_000 });
  // 答えの 1 文字目が出るまで（点が跳ねている間）は早送りしてよい。
  // 待ちが長いと「応答に時間がかかっています」が出て点が描き直されるので、点が 1 つも無くなるまで待つ。
  await page.waitForFunction(() => document.querySelectorAll(".animate-bounce").length === 0, null, {
    timeout: 300_000,
    polling: 200,
  });
  rec.mark(`${prefix}streaming`);
  await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => stop.waitFor({ state: "hidden" }));
  rec.mark(`${prefix}answered`);
}

/** 人の手に見える速さで文字を打つ。 */
export async function typeSlowly(page, locator, text) {
  await moveAndClick(page, locator);
  await page.keyboard.type(text, { delay: 70 });
}
