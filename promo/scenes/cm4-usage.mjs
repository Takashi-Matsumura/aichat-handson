/**
 * CM 04「AI の使い方が、数字で見える」の素材。
 * 先に 2 回質問しておき（ここは撮らない）、チャット画面から利用状況のダッシュボードを開く →
 * 質問の回数・トークン・推定コスト → 推定コストのタイルを裏返して単価を見せる。
 *
 *   node promo/scenes/cm4-usage.mjs
 *
 * 利用状況はブラウザの localStorage にだけ積まれるので、撮影のブラウザは毎回まっさらな状態から始まる。
 */
import { moveAndClick, openStage, startRecording } from "../lib/recorder.mjs";
import { OUT, openChat, sendAndWait } from "./common.mjs";

const QUESTIONS = [
  "AIの「トークン」とは何ですか？ひとことで教えてください。",
  "社外秘の情報をクラウドのAIに入力してはいけない理由を、3行で教えてください。",
];

const { browser, page } = await openStage();
await openChat(page);

// 下ごしらえ（撮らない）。目印は使わないので、捨てる記録係を渡す。
const noop = { mark: () => {} };
for (const q of QUESTIONS) {
  await page.getByPlaceholder(/メッセージを入力/).fill(q);
  await sendAndWait(page, noop);
  await page.waitForTimeout(500);
}

const rec = await startRecording(page, `${OUT}cm4-usage`);
await page.waitForTimeout(1500);
await moveAndClick(page, page.getByRole("link", { name: "AI利用状況ダッシュボード" }).or(page.getByRole("button", { name: "AI利用状況ダッシュボード" })).first());
await page.getByText("質問した回数").waitFor();
rec.mark("dashboard");
await page.waitForTimeout(2500);
await moveAndClick(page, page.getByRole("button", { name: /推定コスト/ }));
rec.mark("flipped");
await page.waitForTimeout(3000);
await moveAndClick(page, page.getByRole("button", { name: /推定コスト/ }));
await page.waitForTimeout(800);
await page.getByText("モデル別のコスト・速度比較").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" })).catch(() => {});
rec.mark("models");
await page.waitForTimeout(2500);

const result = await rec.stop();
console.log("cm4-usage:", result.duration.toFixed(1), "秒", result.marks.map((m) => `${m.name}=${m.t.toFixed(1)}`).join(" "));
await browser.close();
