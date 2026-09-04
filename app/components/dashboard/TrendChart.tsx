"use client";

import { useRef, useState, type PointerEvent } from "react";

type Point = { label: string; value: number };

type Props = {
  data: Point[];
  valueFormatter?: (value: number) => string;
};

const WIDTH = 600;
const HEIGHT = 160;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 22;
const PADDING_X = 4;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const PLOT_WIDTH = WIDTH - PADDING_X * 2;

// 件数の推移(1系列・時系列)なので単一色(sequential)のライン+エリアで表現する。
export function TrendChart({ data, valueFormatter }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const format = valueFormatter ?? ((v: number) => v.toLocaleString("ja-JP"));

  if (data.length === 0) {
    return <p className="text-xs text-foreground/50">データがありません</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const points = data.map((d, i) => ({
    ...d,
    x: data.length === 1 ? PADDING_X + PLOT_WIDTH / 2 : PADDING_X + (i / (data.length - 1)) * PLOT_WIDTH,
    y: PADDING_TOP + PLOT_HEIGHT - (d.value / max) * PLOT_HEIGHT,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const baseline = PADDING_TOP + PLOT_HEIGHT;
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
      : "";
  const last = points[points.length - 1];

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute top-0 right-0 text-right">
        <p className="text-xs text-foreground/50">最新</p>
        <p className="text-sm font-semibold tabular-nums">{format(last.value)}</p>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`推移グラフ。最新値は${format(last.value)}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <line
          x1={PADDING_X}
          y1={baseline}
          x2={WIDTH - PADDING_X}
          y2={baseline}
          stroke="currentColor"
          strokeWidth={1}
          className="text-black/10 dark:text-white/15"
        />

        {areaPath && <path d={areaPath} fill="var(--chart-bar)" fillOpacity={0.1} stroke="none" />}

        {points.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke="var(--chart-bar)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx={points[0].x} cy={points[0].y} r={4} fill="var(--chart-bar)" />
        )}

        <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-bar)" stroke="var(--background)" strokeWidth={2} />

        {hovered && (
          <>
            <line
              x1={hovered.x}
              y1={PADDING_TOP}
              x2={hovered.x}
              y2={baseline}
              stroke="currentColor"
              strokeWidth={1}
              className="text-black/20 dark:text-white/25"
            />
            <circle cx={hovered.x} cy={hovered.y} r={5} fill="var(--chart-bar)" stroke="var(--background)" strokeWidth={2} />
          </>
        )}

        <text x={points[0].x} y={HEIGHT - 6} textAnchor="start" fontSize={10} className="fill-current text-foreground/50">
          {points[0].label}
        </text>
        {points.length > 1 && (
          <text
            x={points[points.length - 1].x}
            y={HEIGHT - 6}
            textAnchor="end"
            fontSize={10}
            className="fill-current text-foreground/50"
          >
            {points[points.length - 1].label}
          </text>
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-black/10 bg-background px-2 py-1 text-xs shadow-sm dark:border-white/15"
          style={{ left: `${(hovered.x / WIDTH) * 100}%`, top: `${(hovered.y / HEIGHT) * 100}%` }}
        >
          <span className="font-semibold tabular-nums">{format(hovered.value)}</span>
          <span className="ml-1 text-foreground/50">{hovered.label}</span>
        </div>
      )}
    </div>
  );
}
