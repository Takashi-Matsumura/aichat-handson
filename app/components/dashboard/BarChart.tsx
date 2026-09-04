type Item = { label: string; value: number };

type Props = {
  items: Item[];
  valueFormatter?: (value: number) => string;
};

// 単一指標(件数)の大小比較なので色は系列識別ではなく単一色(sequential)を使う。
export function BarChart({ items, valueFormatter }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-foreground/50">データがありません</p>;
  }

  const max = Math.max(1, ...items.map((item) => item.value));
  const format = valueFormatter ?? ((v: number) => v.toLocaleString("ja-JP"));

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const pct = Math.max((item.value / max) * 100, 2);
        return (
          <li key={item.label} className="group relative">
            <div
              tabIndex={0}
              aria-label={`${item.label}: ${format(item.value)}`}
              className="flex items-center gap-3 rounded-lg px-1 py-0.5 outline-none transition-colors hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
            >
              <span className="w-28 shrink-0 truncate text-xs text-foreground/70" title={item.label}>
                {item.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className="h-full rounded-r-full"
                  style={{ width: `${pct}%`, backgroundColor: "var(--chart-bar)" }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-foreground/70">
                {format(item.value)}
              </span>
            </div>

            <div
              role="tooltip"
              className="pointer-events-none absolute -top-8 left-28 z-10 hidden items-baseline gap-1 whitespace-nowrap rounded-md border border-black/10 bg-background px-2 py-1 text-xs shadow-sm group-hover:flex group-focus-within:flex dark:border-white/15"
            >
              <span className="font-semibold tabular-nums">{format(item.value)}</span>
              <span className="text-foreground/50">{item.label}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
