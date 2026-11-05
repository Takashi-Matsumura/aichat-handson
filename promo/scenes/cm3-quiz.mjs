/**
 * CM 03「理解度は、AI が作る確認テストで」の素材。
 * 確認テストを始める → AI が問題を作る → 答える → 解説 →「もう少し簡単に説明」。
 *
 *   node promo/scenes/cm3-quiz.mjs
 *
 * 確認テストは既定でモデル 2（8081）を使う。止まっていると撮れない（docs/PROMO_VIDEO.md「撮影の前提」）。
 */
import { BASE_URL, moveAndClick, openStage, startRecording } from "../lib/recorder.mjs";
import { OUT } from "./common.mjs";

const { browser, page } = await openStage();
await page.goto(`${BASE_URL}/quiz`);
await page.getByRole("button", { name: "テストを始める" }).waitFor();
await page.waitForTimeout(800);

const rec = await startRecording(page, `${OUT}cm3-quiz`);
await page.waitForTimeout(800);
await moveAndClick(page, page.getByRole("button", { name: "テストを始める" }));
rec.mark("started");

// 1 問目の 4 択が出るまで（AI が問題を作っている間）は早送りする。
const options = page.locator("button", { has: page.locator("span.flex-1") });
await options.nth(3).waitFor({ timeout: 600_000 });
rec.mark("ready");
await page.waitForTimeout(3500); // 問題文を読む間

// 4 択の 2 つめを選ぶ（正解かどうかは問わない。正解と解説が出る）。
await moveAndClick(page, options.nth(1));
rec.mark("answered");
await page.waitForTimeout(3500); // 解説を読む間

const simpler = page.getByRole("button", { name: /もう少し簡単に説明/ });
await moveAndClick(page, simpler);
rec.mark("help");
await page.getByText("AIが説明を作っています…").waitFor({ timeout: 10_000 }).catch(() => {});
await page.getByText("AIが説明を作っています…").waitFor({ state: "detached", timeout: 180_000 }).catch(() => {});
rec.mark("help-streaming");
// 説明が出終わる（ボタンが押せる状態に戻る）まで待つ。
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => /例題を見る/.test(b.textContent ?? "") && !b.disabled),
  null,
  { timeout: 180_000 },
);
rec.mark("help-done");
await page.locator("text=やさしい説明").first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" })).catch(() => {});
await page.waitForTimeout(2500);

const result = await rec.stop();
console.log("cm3-quiz:", result.duration.toFixed(1), "秒", result.marks.map((m) => `${m.name}=${m.t.toFixed(1)}`).join(" "));
await browser.close();
