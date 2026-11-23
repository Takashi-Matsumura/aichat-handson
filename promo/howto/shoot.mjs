/**
 * アプリの使い方動画の撮影（チャプタごと）。基本の使い方は ch1〜ch6、応用編は web（Web検索）・rag（社内資料）・usage（AI利用状況）。
 *
 *   node promo/howto/shoot.mjs           # 全チャプタ
 *   node promo/howto/shoot.mjs ch3 rag   # 指定したチャプタだけ
 *
 * rag は knowledge/ に資料が登録済みで、埋め込みサーバが動いていること（RAG ボタンが押せる状態）。
 * 質問は、架空の会社の経費精算規程（締切は毎月7日）が入っている前提。
 *
 * 撮った素材は promo/out/howto/<id>/。字幕と合成は build.mjs。
 */
import { openStage, startRecording } from "../lib/recorder.mjs";
import { openChat } from "../scenes/common.mjs";
import {
  OUT,
  begin,
  finish,
  input,
  moveAndClick,
  review,
  sendAndWait,
  spotlight,
  typeInto,
  unspot,
} from "./common.mjs";

const pause = (page, ms) => page.waitForTimeout(ms);

const SCENES = {
  /** 1. 画面の見かた（AI には聞かない）。 */
  async ch1() {
    const { browser, page, rec } = await begin("ch1");
    await pause(page, 3500);
    const steps = [
      ["input", input(page)],
      ["examples", page.getByRole("button", { name: "自己紹介してもらう" }).locator("..")],
      ["model", page.locator("header button[title]").first().locator("..")],
      ["text", page.getByRole("button", { name: "テキストを開く" })],
      ["quiz", page.getByRole("link", { name: "確認テスト" })],
      ["stats", page.getByRole("link", { name: "AI利用状況ダッシュボード" })],
      ["note", page.getByText("AI の回答は参考情報です")],
      // 入口は基本の使い方と応用編の2枚。並んだカードをまとめて囲む。
      ["howto", page.getByRole("button", { name: /使い方の動画/ }).locator("..")],
    ];
    for (const [name, loc] of steps) {
      await spotlight(page, loc);
      rec.mark(name);
      await pause(page, 4200);
    }
    await unspot(page);
    rec.mark("end-card");
    await pause(page, 2000);
    await finish("ch1", browser, rec, page);
  },

  /** 2. 質問してみよう（例文・自分で入力・改行・送信・停止）。 */
  async ch2() {
    const { browser, page, rec } = await begin("ch2");
    await pause(page, 2500);
    const example = page.getByRole("button", { name: "やさしく説明してもらう" });
    await spotlight(page, example);
    rec.mark("example");
    await pause(page, 1800);
    await unspot(page);
    await moveAndClick(page, example);
    rec.mark("filled");
    await pause(page, 3500);
    // 例文を消して、自分で書く。
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    rec.mark("own");
    await pause(page, 800);
    await typeInto(page, ["AIに上手に質問するコツを3つ、理由もつけて教えてください。"], { click: false });
    await pause(page, 600);
    rec.mark("newline");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("見出しをつけて、読みやすくしてください。", { delay: 60 });
    rec.mark("typed");
    await pause(page, 2500);
    const send = page.getByRole("button", { name: "送信" });
    await spotlight(page, send);
    rec.mark("send");
    await pause(page, 1500);
    await unspot(page);
    // 送信して、出始めたら停止ボタンを囲む。
    await moveAndClick(page, send);
    rec.mark("sent");
    const stop = page.getByRole("button", { name: "生成を停止" });
    await stop.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll(".animate-bounce").length === 0, null, {
      timeout: 300_000,
      polling: 200,
    });
    rec.mark("streaming");
    await spotlight(page, stop).catch(() => {});
    await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => {});
    rec.mark("answered");
    await unspot(page);
    await review(page, rec);
    await pause(page, 1500);
    await finish("ch2", browser, rec, page);
  },

  /** 3. 答えを確かめる（再生成・バージョン・トークン表示・コンテキスト）。 */
  async ch3() {
    const { browser, page, rec } = await begin("ch3");
    await pause(page, 1500);
    await typeInto(page, "会議を短くするコツを3つ、1行ずつ教えてください。");
    rec.mark("typed");
    await pause(page, 800);
    await sendAndWait(page, rec);
    await pause(page, 2500);
    rec.mark("shown");

    const regen = page.getByTitle("回答を再生成", { exact: true }).last();
    await spotlight(page, regen);
    rec.mark("regen-point");
    await pause(page, 3500);
    await unspot(page);
    await moveAndClick(page, regen);
    rec.mark("regen-sent");
    const stop = page.getByRole("button", { name: "生成を停止" });
    await stop.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll(".animate-bounce").length === 0, null, {
      timeout: 300_000,
      polling: 200,
    });
    rec.mark("regen-streaming");
    await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => {});
    rec.mark("regen-answered");
    await pause(page, 2500);

    const prev = page.getByTitle("前のバージョン", { exact: true }).last();
    const next = page.getByTitle("次のバージョン", { exact: true }).last();
    await spotlight(page, prev.locator(".."));
    rec.mark("versions");
    await pause(page, 2500);
    await unspot(page);
    await moveAndClick(page, prev);
    await pause(page, 3500);
    await moveAndClick(page, next);
    await pause(page, 3000);

    const tokens = page.getByTitle("トークン単位で表示", { exact: true }).last();
    await spotlight(page, tokens);
    rec.mark("tokens-point");
    await pause(page, 2500);
    await unspot(page);
    await moveAndClick(page, tokens);
    rec.mark("tokens");
    await pause(page, 5500);
    await moveAndClick(page, page.getByTitle("マークダウン表示に戻す", { exact: true }).last());
    await pause(page, 2000);

    await spotlight(page, page.getByText("コンテキスト", { exact: true }).locator(".."));
    rec.mark("context");
    await pause(page, 5000);
    await unspot(page);
    rec.mark("done");
    await pause(page, 1000);
    await finish("ch3", browser, rec, page);
  },

  /** 4. テキストを見ながら進める（パネル・タブ・文字サイズ・入力ボタン・全画面）。 */
  async ch4() {
    const { browser, page, rec } = await begin("ch4");
    await pause(page, 1500);
    const open = page.getByRole("button", { name: "テキストを開く" });
    await spotlight(page, open);
    rec.mark("open-point");
    await pause(page, 2200);
    await unspot(page);
    await moveAndClick(page, open);
    rec.mark("opened");
    await pause(page, 3500);

    const tabs = page.getByRole("button", { name: "AIリテラシー" }).first().locator("..");
    await spotlight(page, tabs);
    rec.mark("tabs");
    await pause(page, 3000);
    await unspot(page);
    await moveAndClick(page, page.getByRole("button", { name: "AIの仕組み" }).first());
    await pause(page, 2500);
    await moveAndClick(page, page.getByRole("button", { name: "AIリテラシー" }).first());
    await pause(page, 2000);

    const bigger = page.getByRole("button", { name: "文字を大きく" });
    await spotlight(page, bigger.locator(".."));
    rec.mark("font");
    await pause(page, 2000);
    await unspot(page);
    await moveAndClick(page, bigger);
    await pause(page, 1200);
    await moveAndClick(page, bigger);
    await pause(page, 2500);
    const smaller = page.getByRole("button", { name: "文字を小さく" });
    await moveAndClick(page, smaller);
    await pause(page, 600);
    await moveAndClick(page, smaller);
    await pause(page, 1500);

    // 第1章の最初の例文。テキストのパネルの中をそこまで送る。
    const use = page.getByRole("button", { name: "入力", exact: true }).first();
    await use.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await pause(page, 1500);
    await spotlight(page, use, { hover: true });
    rec.mark("use-point");
    await pause(page, 2500);
    await unspot(page);
    await moveAndClick(page, use, { scroll: false });
    rec.mark("inserted");
    await pause(page, 3000);
    await sendAndWait(page, rec);
    await pause(page, 3000);
    rec.mark("shown");

    const full = page.getByRole("button", { name: "テキストを全画面表示" });
    await spotlight(page, full);
    rec.mark("full-point");
    await pause(page, 2000);
    await unspot(page);
    await moveAndClick(page, full);
    rec.mark("full");
    await pause(page, 3500);
    await moveAndClick(page, page.getByRole("button", { name: "テキストを画面半分に戻す" }));
    await pause(page, 2000);
    await moveAndClick(page, page.getByRole("button", { name: "テキストを閉じる" }));
    rec.mark("closed");
    await pause(page, 2500);
    await finish("ch4", browser, rec, page);
  },

  /** 5. 推論モード（モデル 1 のときだけ使える）。 */
  async ch5() {
    const { browser, page, rec } = await begin("ch5", { model: 1 });
    await pause(page, 1500);
    const toggle = page.getByRole("button", { name: /推論モード/ });
    await spotlight(page, toggle);
    rec.mark("toggle-point");
    await pause(page, 3000);
    await unspot(page);
    await moveAndClick(page, toggle);
    rec.mark("on");
    await pause(page, 2500);
    await typeInto(page, "りんごが3個あります。みかんはりんごより2個多いです。全部で何個？", { click: true });
    rec.mark("typed");
    await pause(page, 1000);
    await moveAndClick(page, page.getByRole("button", { name: "送信" }));
    rec.mark("sent");
    await page.getByText("思考中...").waitFor({ timeout: 300_000 });
    rec.mark("thinking");
    const stop = page.getByRole("button", { name: "生成を停止" });
    await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => {});
    rec.mark("answered");
    await pause(page, 2000);
    const proc = page.getByText("思考プロセス").last();
    // 答えが出た後も思考プロセスが開いたままのことがある。字幕は「押すと開く」なので、先に閉じておく。
    const body = page.locator("div.border-amber-200 > div.border-t").last();
    if (await body.isVisible().catch(() => false)) await moveAndClick(page, proc);
    await pause(page, 1500);
    await spotlight(page, proc.locator(".."));
    rec.mark("proc-point");
    await pause(page, 2500);
    await unspot(page);
    await moveAndClick(page, proc);
    rec.mark("proc");
    await pause(page, 1500);
    await review(page, rec);
    await moveAndClick(page, toggle);
    rec.mark("off");
    await pause(page, 2000);
    await finish("ch5", browser, rec, page);
  },

  /** 応用編 1. Web検索（SearXNG でインターネットを調べてから答える）。 */
  async web() {
    const { browser, page, rec } = await begin("web");
    await pause(page, 4000);
    const web = page.getByRole("button", { name: "Web検索", exact: true });
    await spotlight(page, web);
    rec.mark("toggle-point");
    await pause(page, 3500);
    await unspot(page);
    await moveAndClick(page, web);
    rec.mark("on");
    await pause(page, 1200);
    await spotlight(page, page.getByText(/Web検索ON：/), { hover: false });
    rec.mark("notice");
    await pause(page, 6000);
    await unspot(page);
    await typeInto(page, "今週のAIに関するニュースを3つ、1行ずつ教えてください。");
    rec.mark("typed");
    await pause(page, 1500);
    await moveAndClick(page, page.getByRole("button", { name: "送信" }));
    rec.mark("sent");
    // 検索キーワードを作って SearXNG で調べている間は「Webを検索しています…」が出る。
    const searching = page.getByText("Webを検索しています…");
    await searching.waitFor({ timeout: 30_000 }).catch(() => {});
    rec.mark("searching");
    await searching.waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
    rec.mark("searched");
    const stop = page.getByRole("button", { name: "生成を停止" });
    await page.waitForFunction(() => document.querySelectorAll(".animate-bounce").length === 0, null, {
      timeout: 300_000,
      polling: 200,
    });
    rec.mark("streaming");
    await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => {});
    rec.mark("answered");
    await pause(page, 1000);
    await review(page, rec);

    // 答えの下の「参照したWebページ」を開いて、検索キーワードと出典を見せる。
    const sources = page.getByRole("button", { name: /参照したWebページ/ }).last();
    await spotlight(page, sources);
    rec.mark("sources-point");
    await pause(page, 3500);
    await unspot(page);
    await moveAndClick(page, sources);
    await pause(page, 500);
    await page
      .locator("div.flex-1.overflow-y-auto")
      .first()
      .evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
    rec.mark("sources");
    await pause(page, 8000);
    rec.mark("searxng");
    await pause(page, 9000);
    await spotlight(page, web);
    rec.mark("off-point");
    await pause(page, 1500);
    await unspot(page);
    await moveAndClick(page, web);
    rec.mark("off");
    await pause(page, 3000);
    await finish("web", browser, rec, page);
  },

  /** 応用編 2. 社内資料を検索（RAG）。同じ質問を RAG オフ → オンで聞き比べる。 */
  async rag() {
    // gemma-3-4b は資料を渡しても「記載がありません」と読み落とすことがあるため、モデル 1 で撮る。
    const { browser, page, rec } = await begin("rag", { model: 1 });
    await pause(page, 4000);
    const question = "経費精算の締切は、毎月何日ですか？";
    // まずは RAG オフのまま聞く（AI は社内の決まりを知らないので、一般論でしか答えられない）。
    await typeInto(page, question);
    rec.mark("typed");
    await pause(page, 1200);
    await moveAndClick(page, page.getByRole("button", { name: "送信" }));
    rec.mark("sent");
    const stop = page.getByRole("button", { name: "生成を停止" });
    await page.waitForFunction(() => document.querySelectorAll(".animate-bounce").length === 0, null, {
      timeout: 300_000,
      polling: 200,
    });
    rec.mark("streaming");
    await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => {});
    rec.mark("answered");
    await pause(page, 1000);
    await review(page, rec);

    // 前の答えに引きずられないよう、新しいチャットにしてから RAG をオンにする。
    await moveAndClick(page, page.getByTitle("新規チャット", { exact: true }));
    rec.mark("cleared");
    await pause(page, 1500);
    const rag = page.getByRole("button", { name: /^RAG/ });
    await spotlight(page, rag);
    rec.mark("toggle-point");
    await pause(page, 3500);
    await unspot(page);
    await moveAndClick(page, rag);
    rec.mark("on");
    await pause(page, 2000);
    await typeInto(page, question);
    rec.mark("typed2");
    await pause(page, 1200);
    await moveAndClick(page, page.getByRole("button", { name: "送信" }));
    rec.mark("sent2");
    await page.waitForFunction(() => document.querySelectorAll(".animate-bounce").length === 0, null, {
      timeout: 300_000,
      polling: 200,
    });
    rec.mark("streaming2");
    await stop.waitFor({ state: "detached", timeout: 300_000 }).catch(() => {});
    rec.mark("answered2");
    await pause(page, 1000);
    await review(page, rec, { prefix: "2-" });

    // 答えの下の「参照した資料」を開いて、どの資料のどこを使ったかを見せる。
    const sources = page.getByRole("button", { name: /参照した資料/ }).last();
    await spotlight(page, sources);
    rec.mark("sources-point");
    await pause(page, 3500);
    await unspot(page);
    await moveAndClick(page, sources);
    await pause(page, 500);
    await page
      .locator("div.flex-1.overflow-y-auto")
      .first()
      .evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
    rec.mark("sources");
    await pause(page, 8000);
    rec.mark("admin");
    await pause(page, 7000);
    await spotlight(page, rag);
    rec.mark("off-point");
    await pause(page, 1500);
    await unspot(page);
    await moveAndClick(page, rag);
    rec.mark("off");
    await pause(page, 3000);
    await finish("rag", browser, rec, page);
  },

  /** 応用編 3. AI利用状況（自分の利用分を数字で見る）。 */
  async usage() {
    // 下ごしらえ（撮らない）。同じ質問をモデル 1・2 に 1 回ずつ送り、モデル別の比較に両方の数字を出す。
    // 利用状況はブラウザの localStorage にだけ積まれるので、撮影のブラウザは毎回まっさらな状態から始まる。
    const { browser, page } = await openStage();
    const noop = { mark: () => {} };
    const question = "AIの「トークン」とは何ですか？3行で教えてください。";
    for (const model of [1, 2]) {
      await openChat(page, { model });
      await input(page).fill(question);
      await sendAndWait(page, noop);
      await pause(page, 500);
    }
    const rec = await startRecording(page, `${OUT}usage`);
    await pause(page, 3000);

    const link = page.getByRole("link", { name: "AI利用状況ダッシュボード" });
    await spotlight(page, link);
    rec.mark("open-point");
    await pause(page, 3000);
    await unspot(page);
    await moveAndClick(page, link);
    await page.getByText("質問した回数").waitFor();
    rec.mark("opened");
    await pause(page, 2500);

    const tile = (label) => page.getByText(label, { exact: true }).first().locator("..");
    const steps = [
      ["note", page.getByText(/このブラウザに記録された分だけ/), 5000],
      ["count", tile("質問した回数"), 3500],
      ["input", tile("入力トークン"), 5000],
      ["output", tile("出力トークン"), 4000],
      ["cost", page.getByRole("button", { name: /推定コスト/ }), 5000],
    ];
    for (const [name, loc, ms] of steps) {
      await spotlight(page, loc);
      rec.mark(name);
      await pause(page, ms);
    }
    await unspot(page);
    const cost = page.getByRole("button", { name: /推定コスト/ });
    await moveAndClick(page, cost);
    rec.mark("flipped");
    await pause(page, 6000);
    await moveAndClick(page, cost);
    await pause(page, 1200);
    await spotlight(page, tile("平均レスポンス時間"));
    rec.mark("latency");
    await pause(page, 4000);
    await unspot(page);

    const models = page.getByRole("heading", { name: "モデル別のコスト・速度比較" }).locator("..");
    await models.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await pause(page, 1200);
    await spotlight(page, models.locator("> div.grid"));
    rec.mark("models");
    await pause(page, 6000);
    await spotlight(page, page.getByText("生成速度", { exact: true }).first().locator(".."));
    rec.mark("speed");
    await pause(page, 4500);
    await unspot(page);

    const services = page.getByRole("heading", { name: "関連サービスの稼働状況" }).locator("..");
    await services.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await pause(page, 1200);
    await spotlight(page, services.locator("> div.grid"));
    rec.mark("services");
    await pause(page, 5000);
    await unspot(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    rec.mark("end");
    await pause(page, 3000);
    await finish("usage", browser, rec, page);
  },

  /** 6. 新しく始める・確認テスト。 */
  async ch6() {
    const { browser, page, rec } = await begin("ch6");
    await pause(page, 1000);
    await typeInto(page, "こんにちは！ひとことで自己紹介してください。");
    await pause(page, 600);
    await sendAndWait(page, rec);
    await pause(page, 2000);
    rec.mark("shown");
    const clear = page.getByTitle("新規チャット", { exact: true });
    await spotlight(page, clear);
    rec.mark("clear-point");
    await pause(page, 3500);
    await unspot(page);
    await moveAndClick(page, clear);
    rec.mark("cleared");
    await pause(page, 3000);

    const quiz = page.getByRole("link", { name: "確認テスト" });
    await spotlight(page, quiz);
    rec.mark("quiz-point");
    await pause(page, 2500);
    await unspot(page);
    await moveAndClick(page, quiz);
    await page.getByRole("button", { name: "テストを始める" }).waitFor();
    rec.mark("quiz");
    await pause(page, 5000);
    await moveAndClick(page, page.getByRole("button", { name: "テストを始める" }));
    rec.mark("generating");
    await page.getByText("AIが問題を作っています").waitFor({ state: "detached", timeout: 600_000 });
    rec.mark("question");
    await pause(page, 4000);
    // 4 つの選択肢（A〜D の丸印が付いたボタン）の 2 つめを選ぶ。
    const choices = page.locator("button.text-left:has(span.rounded-full)");
    await choices.first().waitFor({ timeout: 60_000 });
    await moveAndClick(page, choices.nth(1));
    rec.mark("picked");
    await pause(page, 2500);
    // 下に出る解説が見えるところまで送る。
    await page.evaluate(() => window.scrollBy({ top: 360, behavior: "smooth" }));
    await pause(page, 6500);
    rec.mark("done");
    await finish("ch6", browser, rec, page);
  },
};

const ids = process.argv.slice(2);
for (const id of ids.length ? ids : Object.keys(SCENES)) {
  if (!SCENES[id]) throw new Error(`そんなチャプタはありません: ${id}`);
  await SCENES[id]();
}
