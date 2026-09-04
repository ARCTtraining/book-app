"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightsSummary } from "@/lib/types";
import { spineColor } from "@/lib/catalog";
import { AXIS_TICK, CardTooltip, CHART_COLORS, ChartFrame } from "./ChartFrame";

/**
 * Books per genre.
 *
 * Horizontal so genre names sit as direct labels down the axis — colour here
 * repeats the spine colour each genre already wears on the shelf, so it
 * reinforces identity rather than carrying it alone.
 */
export function GenreChart({ data }: { data: InsightsSummary["booksByGenre"] }) {
  if (data.length === 0) {
    return (
      <ChartFrame
        title="Books by genre"
        note="Add a book to your shelf to see how your reading splits up."
        height={72}
      >
        <div />
      </ChartFrame>
    );
  }

  // ~26px a row keeps bars thin without crowding the labels.
  const height = Math.max(96, data.length * 26 + 24);
  const max = Math.max(...data.map((d) => d.books));

  return (
    <ChartFrame
      title="Books by genre"
      note={`${data.length} ${data.length === 1 ? "genre" : "genres"} on your shelf`}
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barCategoryGap={4}
        >
          <XAxis type="number" hide domain={[0, max]} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="genre"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.rule }}
            width={96}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.ink, fillOpacity: 0.06 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof data)[number];
              return (
                <CardTooltip
                  label={point.genre}
                  value={`${point.books} ${point.books === 1 ? "book" : "books"}`}
                  swatch={spineColor(point.genre)}
                />
              );
            }}
          />
          <Bar
            dataKey="books"
            radius={[0, 4, 4, 0]}
            barSize={12}
            isAnimationActive={false}
            label={{
              position: "right",
              fill: CHART_COLORS.charcoal,
              fillOpacity: 0.7,
              fontSize: 10,
            }}
          >
            {data.map((row) => (
              <Cell key={row.genre} fill={spineColor(row.genre)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
