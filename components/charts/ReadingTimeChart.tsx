"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightsSummary } from "@/lib/types";
import { AXIS_TICK, CardTooltip, CHART_COLORS, ChartFrame } from "./ChartFrame";

/**
 * How long books take to finish.
 *
 * A distribution, so bars over ordered duration bands rather than a bar per
 * book — a shelf of twenty would be unreadable, and the question is where the
 * mass sits, not which book was which.
 *
 * One series, one hue: the bands are magnitude along an axis, not identities
 * to tell apart, so colour would encode nothing here.
 */
export function ReadingTimeChart({
  data,
}: {
  data: InsightsSummary["readingTimes"];
}) {
  if (data.counted === 0) {
    return (
      <ChartFrame
        title="How long books take"
        note="Finish a book with a start date recorded and it appears here."
        height={72}
      >
        <div />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title="How long books take"
      note={`${data.counted} ${data.counted === 1 ? "book" : "books"} · half finished within ${data.median} ${data.median === 1 ? "day" : "days"}`}
      height={172}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.buckets}
          margin={{ top: 6, right: 8, bottom: 0, left: -20 }}
          barCategoryGap={6}
        >
          <CartesianGrid stroke={CHART_COLORS.rule} strokeWidth={1} vertical={false} />
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
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.ink, fillOpacity: 0.06 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof data.buckets)[number];
              return (
                <CardTooltip
                  label={`${point.label} days`}
                  value={`${point.books} ${point.books === 1 ? "book" : "books"}`}
                  swatch={CHART_COLORS.teal}
                />
              );
            }}
          />
          <Bar
            dataKey="books"
            fill={CHART_COLORS.teal}
            // Rounded only at the free end; the bars stay anchored to zero.
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
