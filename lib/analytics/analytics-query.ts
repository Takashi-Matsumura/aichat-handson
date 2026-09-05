// 日付範囲・ページングの解決。ai-usalysis-demo の src/server/analytics-query.ts を無改造で移植したもの。

const DEFAULT_RANGE_DAYS = 30;

export type DateRange = { from: Date; to: Date };

export function resolveDateRange(searchParams: URLSearchParams): DateRange {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("from/toの日付形式が不正です");
  }
  if (from > to) {
    throw new Error("fromはto以前の日付にしてください");
  }

  return { from, to };
}

// Next.js のページ props で渡される searchParams (プレーンなキー/値オブジェクト) を
// resolveDateRange が期待する URLSearchParams に変換する。
export function toURLSearchParams(
  sp: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}
