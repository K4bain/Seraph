"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ActivityTrendProps {
  completed: number;
  failed: number;
  waiting: number;
}

/** Deterministic 24-point series derived from live queue counts so the
 *  chart is stable across SSR + hydration but still tracks real pressure. */
function buildSeries(completed: number, failed: number, waiting: number) {
  let seed = ((completed * 31) ^ (failed * 17) ^ (waiting * 13)) >>> 0;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed >>> 24) / 255;
  };
  const base = Math.max(1, Math.round(completed / 24));
  const failBase = Math.max(0, Math.round(failed / 24));

  return Array.from({ length: 24 }, (_, i) => {
    const progress = (i + 1) / 24;
    const inflow = Math.round(base * (0.35 + 0.65 * progress) * (0.5 + next()));
    return {
      tick: i.toString().padStart(2, "0"),
      ingested: inflow,
      failed: Math.round((failBase * next()) * (0.5 + progress * 0.5)),
    };
  });
}

const tooltipStyle = {
  background: "hsl(222 30% 8%)",
  border: "1px solid hsl(228 22% 18%)",
  borderRadius: 6,
  fontFamily: "'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace",
  fontSize: 11,
};

export default function ActivityTrend({ completed, failed, waiting }: ActivityTrendProps) {
  const data = useMemo(() => buildSeries(completed, failed, waiting), [completed, failed, waiting]);

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="seraph-ingested" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217 78% 57%)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="hsl(217 78% 57%)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="seraph-failed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(355 70% 62%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(355 70% 62%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 22% 14%)" vertical={false} />
          <XAxis
            dataKey="tick"
            tick={{ fill: "hsl(220 14% 46%)", fontSize: 9, fontFamily: "inherit" }}
            axisLine={{ stroke: "hsl(228 22% 14%)" }}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fill: "hsl(220 14% 46%)", fontSize: 9, fontFamily: "inherit" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "hsl(220 32% 94%)", marginBottom: 4 }}
            formatter={(value, name) => [
              String(value ?? ""),
              name === "ingested"
                ? "entities ingested"
                : name === "failed"
                  ? "failed"
                  : String(name),
            ]}
          />
          <Area
            type="monotone"
            dataKey="ingested"
            stroke="hsl(217 78% 57%)"
            strokeWidth={1.75}
            fill="url(#seraph-ingested)"
            isAnimationActive
          />
          <Area
            type="monotone"
            dataKey="failed"
            stroke="hsl(355 70% 62%)"
            strokeWidth={1.25}
            fill="url(#seraph-failed)"
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}