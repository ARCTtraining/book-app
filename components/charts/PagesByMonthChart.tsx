"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightsSummary } from "@/lib/types";
import { AXIS_TICK, CardTooltip, CHART_COLORS, ChartFrame } from "./ChartFrame";

/**
 * Pages logged per month over the trailing window.
 *
 * Change over time on a continuous measure, so: a line, one series, no
 * legend, horizontal gridlines only, and a hover readout on every point.
 */
export function PagesByMonthChart({
  data,
}: {
  data: InsightsSummary["pagesByMonth"];
}) {
  const total = data.reduce((sum, d) => sum + d.pages, 0);
  const current = data[data.length - 1];

  // The last bucket is the month you are in, so it is always short. Saying so
  // stops the closing dip from reading as a collapse in reading.
  const note =
    total > 0
      ? `${total.toLocaleString()} pages over ${data.length} months · ${current.label} still in progress`
      : "Nothing logged yet — pages appear here as you record them.";

  return (
    <ChartFrame title="Pages by month" note={note} height={168}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid
            stroke={CHART_COLORS.rule}
            strokeWidth={1}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.rule }}
            dy={2}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.ink, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof data)[number];
              return (
                <CardTooltip
                  label={
                    point.month === current.month
                      ? `${point.label} so far`
                      : point.label
                  }
                  value={`${point.pages.toLocaleString()} pages`}
                  swatch={CHART_COLORS.teal}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="pages"
            stroke={CHART_COLORS.teal}
            strokeWidth={2}
            dot={{
              r: 3,
              fill: CHART_COLORS.paper,
              stroke: CHART_COLORS.teal,
              strokeWidth: 2,
            }}
            activeDot={{
              r: 4.5,
              fill: CHART_COLORS.marigold,
              stroke: CHART_COLORS.ink,
              strokeWidth: 1.5,
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
