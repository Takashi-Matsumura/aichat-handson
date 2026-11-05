/**
 * CM 02「講師のプロンプトを、全員の画面へ」の素材。
 * 講師（/presenter）と受講者（チャット画面）の 2 つのブラウザを同時に撮る。
 * 講師が「配信」を押す → 受講者の画面に「講師からのプロンプト」が出る → 入力欄に入れて送る。
 *
 *   node promo/scenes/cm2-broadcast.mjs
 *
 * 講師の画面には .env.local の PRESENTER_PASSWORD で、ふつうにログインする。
 * 撮り終わったら配信を取り下げる（ほかの受講者の画面に出たままにしない）。
 */
import { existsSync } from "node:fs";
import { BASE_URL, moveAndClick, openStage, startRecording } from "../lib/recorder.mjs";
import { OUT, openChat, sendAndWait } from "./common.mjs";

const envFile = new URL("../../.env.local", import.meta.url).pathname;
if (!process.env.PRESENTER_PASSWORD && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.PRESENTER_PASSWORD) throw new Error("PRESENTER_PASSWORD が設定されていません");

/** 配信するプロンプト（data/presenter-prompts.json にあるもの）。 */
const PROMPT_TITLE = process.env.PROMO_PROMPT_TITLE ?? "販促・商品PR";

const teacher = await openStage();
const student = await openStage();

// 講師: ログインして「プロンプト配信」タブを開いておく（ここは撮らない）。
await teacher.page.goto(`${BASE_URL}/presenter`);
await teacher.page.locator('input[type="password"]').fill(process.env.PRESENTER_PASSWORD);
await teacher.page.getByRole("button", { name: "ログイン" }).click();
await teacher.page.getByRole("button", { name: "プロンプト配信" }).click();
const row = teacher.page.locator("tr", { hasText: PROMPT_TITLE }).first();
await row.waitFor();
// 前の撮影の配信が残っていたら取り下げる。
const clear = teacher.page.getByRole("button", { name: "配信を取り下げる" });
if (await clear.isVisible()) {
  await clear.click();
  await teacher.page.waitForTimeout(800);
}

await openChat(student.page);

// 2 つを同時に撮る。目印は両方に同じ名前で付けるので、あとで「配信」の瞬間で切り替えられる。
const recT = await startRecording(teacher.page, `${OUT}cm2-teacher`);
const recS = await startRecording(student.page, `${OUT}cm2-student`);
const markBoth = (name) => {
  recT.mark(name);
  recS.mark(name);
};
await teacher.page.waitForTimeout(1500);
await moveAndClick(teacher.page, row.getByRole("button", { name: "配信", exact: true }));
markBoth("broadcast");
await teacher.page.getByText("配信中").first().waitFor();
await teacher.page.waitForTimeout(1200);
markBoth("teacher-done");

const dialog = student.page.getByRole("dialog", { name: "講師からのプロンプト" });
await dialog.waitFor({ timeout: 15_000 });
markBoth("arrived");
await student.page.waitForTimeout(2000);
await moveAndClick(student.page, dialog.getByRole("button", { name: "入力欄に入れる" }));
await student.page.waitForTimeout(1200);
await sendAndWait(student.page, recS);
await student.page.waitForTimeout(1500);

const t = await recT.stop();
const s = await recS.stop();
console.log("cm2-teacher:", t.duration.toFixed(1), "秒", t.marks.map((m) => `${m.name}=${m.t.toFixed(1)}`).join(" "));
console.log("cm2-student:", s.duration.toFixed(1), "秒", s.marks.map((m) => `${m.name}=${m.t.toFixed(1)}`).join(" "));

// 後片づけ: 配信を取り下げる。
await teacher.page.getByRole("button", { name: "配信を取り下げる" }).click();
await teacher.page.waitForTimeout(800);
await teacher.browser.close();
await student.browser.close();
