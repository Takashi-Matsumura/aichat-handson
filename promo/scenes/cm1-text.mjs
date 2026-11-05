/**
 * CM 01「テキストを読みながら、その場で試す」の素材。
 * チャット画面でハンズオンテキストを開き、テキストの例文を「入力」ボタンで入力欄へ送り、AI に答えさせる。
 *
 *   node promo/scenes/cm1-text.mjs
 */
import { moveAndClick, openStage, startRecording } from "../lib/recorder.mjs";
import { OUT, openChat, sendAndWait } from "./common.mjs";

const { browser, page } = await openStage();
await openChat(page);

const rec = await startRecording(page, `${OUT}cm1-text`);
await page.waitForTimeout(800);
await moveAndClick(page, page.getByRole("button", { name: "テキストを開く" }));
rec.mark("opened");
await page.waitForTimeout(1500);

// 第1章の 3 つめの例文（ビジネスメールのマナー）。テキストのパネルの中をそこまで送る。
const use = page.getByRole("button", { name: "入力", exact: true }).nth(2);
await use.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
await page.waitForTimeout(1500);
await moveAndClick(page, use, { scroll: false });
rec.mark("inserted");
await page.waitForTimeout(1200);

await sendAndWait(page, rec);
await page.waitForTimeout(1500);
const result = await rec.stop();
console.log("cm1-text:", result.duration.toFixed(1), "秒", result.marks.map((m) => `${m.name}=${m.t.toFixed(1)}`).join(" "));
await browser.close();
