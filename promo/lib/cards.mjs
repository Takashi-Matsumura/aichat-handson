/**
 * 30 秒 CM で使う、アプリの画面ではない場面（問いかけ・タイトル・締め）の画。
 * 配色と書体は BoX4 の CM（cheetah-frame の promo）とそろえる。構成は docs/PROMO_VIDEO.md。
 */
import { readFileSync } from "node:fs";
import { BRAND } from "./render.mjs";

const FONT = `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', system-ui, sans-serif`; // style="…" の中に入れるので、書体名は ' で囲む
const ORANGE_BG = `linear-gradient(135deg,${BRAND.deep} 0%,${BRAND.orange} 55%,#F7931E 100%)`;
const page = (body, bg = "#fff") =>
  `<!doctype html><html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;background:${bg};font-family:${FONT};color:${BRAND.ink}">${body}</body></html>`;
const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
/** 〔〕で囲んだ所をオレンジにする。改行は \n。 */
export const accent = (text) =>
  text
    .replaceAll("\n", "<br>")
    .replace(/〔(.+?)〕/g, `<span style="color:${BRAND.deep}">$1</span>`);

/** 問いかけ。研修の現場の「あるある」を 1 文で。 */
export function questionCard(text) {
  return page(
    `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 120px;font-size:96px;font-weight:800;line-height:1.45">
      <div>${accent(text)}</div>
    </div>`,
    BRAND.light,
  );
}

/** タイトル。上に「AIリテラシー研修 × AIチャット ハンズオン」、下にこの CM の主題。 */
export function titleCard({ no, title }) {
  return page(
    `<div style="position:absolute;left:0;top:0;bottom:0;width:28px;background:${ORANGE_BG}"></div>
    <div style="position:absolute;left:180px;right:120px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:44px;font-weight:700;letter-spacing:4px;color:#555">
        <span style="display:inline-block;background:${ORANGE_BG};color:#fff;border-radius:14px;padding:6px 26px;margin-right:28px;letter-spacing:2px">${no}</span>AIリテラシー研修　AIチャット ハンズオン
      </div>
      <div style="font-size:120px;font-weight:800;line-height:1.3;margin-top:48px">${accent(title)}</div>
    </div>`,
  );
}

/**
 * 締め（全本共通）。パンフレットの「STEP1 AIリテラシー研修」の 3 項目を並べる。
 * shown = false の画を先に出し、true の画（項目とロゴあり）を重ねて、後から現れるように見せる。
 * OCC のロゴは会社の素材なので promo/out/assets/ に各自で置く。
 */
export function closingCard({ occLogo, shown }) {
  const vis = shown ? "visible" : "hidden";
  const chip = (t) =>
    `<div style="border:4px solid ${BRAND.orange};background:#fff;border-radius:999px;padding:22px 52px;font-size:50px;font-weight:800">${t}</div>`;
  return page(
    `<div style="position:absolute;left:0;right:0;top:0;height:24px;background:${ORANGE_BG}"></div>
    <div style="position:absolute;left:0;right:0;top:150px;text-align:center">
      <div style="display:inline-block;background:${ORANGE_BG};color:#fff;border-radius:16px;padding:10px 36px;font-size:46px;font-weight:800;letter-spacing:2px">STEP 1　AIリテラシー研修</div>
      <div style="margin-top:44px;font-size:104px;font-weight:800;line-height:1.3">${accent("まずは、〔AIを正しく使う〕ところから")}</div>
    </div>
    <div style="position:absolute;left:0;right:0;top:520px;display:flex;justify-content:center;gap:40px;visibility:${vis}">
      ${chip("生成AIの基礎")}${chip("情報管理の注意点")}${chip("業務での活用例")}
    </div>
    <div style="position:absolute;left:0;right:0;top:680px;text-align:center;font-size:40px;font-weight:600;color:#555;visibility:${vis}">社内の情報を外に出さない、ローカル AI で体験できます</div>
    <img src="${dataUrl(occLogo)}" style="position:absolute;left:50%;bottom:30px;height:240px;transform:translateX(-50%);visibility:${vis}">`,
  );
}
