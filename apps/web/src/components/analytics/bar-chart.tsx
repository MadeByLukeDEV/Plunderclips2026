"use client";

import { useState } from "react";

/**
 * A single-series daily bar chart: one hue (the site's mint), thin bars with a 2px gap and
 * rounded tops sitting on the baseline, a recessive grid, and a hover/focus tooltip per day.
 * The numbers are also in a table under "Show the numbers" (a chart is never the only way in).
 */
export function BarChart({
  data,
  unit,
  label,
}: {
  data: { day: string; value: number }[];
  /** "views", "followers"… for the tooltip and the table. */
  unit: string;
  /** What the chart shows, for screen readers and the table caption. */
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const pad = { top: 12, right: 8, bottom: 24, left: 36 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, slot - 2);
  const y = (v: number) => pad.top + plotH - (v / nice) * plotH;
  // A halfway tick only when it lands on a whole number.
  const ticks = nice >= 2 ? [0, nice / 2, nice] : [0, nice];
  const total = data.reduce((n, d) => n + d.value, 0);
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const a = active !== null ? data[active] : null;

  return (
    <figure className="grid gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label}: ${total.toLocaleString("en-GB")} ${unit} over ${data.length} days`}
          className="block h-auto w-full overflow-visible"
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-muted-foreground font-mono text-[11px]"
              >
                {Math.round(t).toLocaleString("en-GB")}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + i * slot + 1;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, barW / 2, h);
            const top = y(0) - h;
            return (
              <g key={d.day}>
                {h > 0 ? (
                  <path
                    d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                    className={active === i ? "fill-headline" : "fill-headline/80"}
                  />
                ) : null}
                {/* Hit target: the whole column, bigger than the bar. */}
                <rect
                  x={pad.left + i * slot}
                  y={pad.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${fmt(d.day)}: ${d.value.toLocaleString("en-GB")} ${unit}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="focus-visible:stroke-ring outline-none"
                />
              </g>
            );
          })}
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) =>
            data[i] ? (
              <text
                key={i}
                x={pad.left + i * slot + slot / 2}
                y={H - 6}
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground font-mono text-[11px]"
              >
                {fmt(data[i]!.day)}
              </text>
            ) : null,
          )}
        </svg>
        {a && active !== null ? (
          <div
            role="status"
            className="bg-popover border-border pointer-events-none absolute top-0 rounded-lg border px-3 py-2 text-sm whitespace-nowrap shadow-lg"
            style={{
              left: `${((pad.left + active * slot + slot / 2) / W) * 100}%`,
              transform: `translateX(${active > data.length / 2 ? "-100%" : "0"})`,
            }}
          >
            <p className="text-muted-foreground font-mono text-xs">{fmt(a.day)}</p>
            <p className="font-medium">
              {a.value.toLocaleString("en-GB")} {unit}
            </p>
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="text-muted-foreground hover:text-foreground min-h-11 cursor-pointer content-center">
          Show the numbers
        </summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="text-muted-foreground font-mono text-xs">
              <th className="py-1 font-normal">Day (UTC)</th>
              <th className="py-1 text-right font-normal">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-border border-t">
                <td className="py-1">{fmt(d.day)}</td>
                <td className="py-1 text-right font-mono tabular-nums">
                  {d.value.toLocaleString("en-GB")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** A round axis top: 1, 2 or 5 times a power of ten. */
function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
