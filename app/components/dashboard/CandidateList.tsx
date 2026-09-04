import type { CandidateItem } from "@/lib/analytics/analytics";

export function CandidateList({ items }: { items: CandidateItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-foreground/50">対象期間内に候補はありません</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.requestId} className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{item.businessCategory}</span>
            <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{item.usagePurpose}</span>
            <span>確信度 {(item.confidence * 100).toFixed(0)}%</span>
            <span className="ml-auto tabular-nums">{new Date(item.createdAt).toLocaleString("ja-JP")}</span>
          </div>
          <p className="mt-2 text-sm text-foreground/90">{item.promptExcerpt}</p>
        </li>
      ))}
    </ul>
  );
}
