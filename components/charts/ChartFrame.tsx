"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** Palette echoed from globals.css, since Recharts needs literal values. */
export const CHART_COLORS = {
  ink: "#1B2A41",
  paper: "#F1ECDF",
  paperDark: "#E4DCC5",
  marigold: "#C98A2B",
  teal: "#3F6F6B",
  charcoal: "#2A2620",
  rule: "#C9BFA0",
};

export const AXIS_TICK = {
  fill: CHART_COLORS.charcoal,
  fillOpacity: 0.55,
  fontSize: 10,
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;

/**
 * Titled well for a chart.
 *
 * Each chart carries exactly one series, so the title names it and no legend
 * box is needed — identity is never left to colour alone.
 */
export function ChartFrame({
  title,
  note,
  height,
  children,
}: {
  title: string;
  note?: string;
  height: number;
  children: ReactNode;
}) {
  // Recharts measures its container, which has no width on the server pass.
  const mounted = useMounted();

  return (
    <section className="rounded-card border border-rule bg-paper-dark/60 px-3 pt-3 pb-2">
      <h2 className="label-caps font-sans text-ink">{title}</h2>
      {note && <p className="mt-1 text-[12px] text-charcoal/60">{note}</p>}
      <div className="mt-3" style={{ height }}>
        {mounted ? children : null}
      </div>
    </section>
  );
}

/** Never resubscribes — the value differs only between server and client. */
const NEVER_CHANGES = () => () => {};

/** False during the server render and hydration, true immediately after. */
function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false
  );
}

/** Tooltip drawn as a small index card: flat, hairline, no shadow. */
export function CardTooltip({
  label,
  value,
  swatch,
}: {
  label: string;
  value: string;
  swatch?: string;
}) {
  return (
    <div className="rounded-card border border-ink bg-paper px-2.5 py-1.5">
      <p className="label-caps flex items-center gap-1.5 text-charcoal/60">
        {swatch && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[1px]"
            style={{ backgroundColor: swatch }}
          />
        )}
        {label}
      </p>
      <p className="tnum mt-0.5 text-[13px] font-medium text-ink">{value}</p>
    </div>
  );
}
