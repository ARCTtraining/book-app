"use client";

import { useLibrary } from "./LibraryProvider";
import { PagesByMonthChart } from "./charts/PagesByMonthChart";
import { cx, EmptyState, LoadingRules, PageTitle } from "./ui";

/**
 * Stat tiles first, then the two charts.
 *
 * The tiles are headline numbers, not plots, so they stay as tiles — a
 * four-value bar chart would say less than the numbers do.
 */
export function InsightsScreen() {
  const { insights, streak, state, ready } = useLibrary();
  const hasData = state.entries.length > 0;

  const title = (
    <PageTitle
      title="Insights"
      caption={
        !ready
          ? "Counting up…"
          : streak.current > 0
            ? `${streak.current}-day streak · longest ${streak.longest}`
            : "Your reading, counted up"
      }
    />
  );

  if (!ready) {
    return (
      <>
        {title}
        <div className="px-4 py-4">
          <LoadingRules rows={2} />
        </div>
      </>
    );
  }

  return (
    <>
      {title}

      <div className="space-y-4 px-4 py-4">
        {!hasData && (
          <EmptyState
            title="Nothing to measure yet"
            body="Add a book and log a few pages — your pace, totals and charts fill in from there."
          />
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            label="Pages read"
            value={insights.totalPagesRead.toLocaleString()}
            note="Across every book on your shelf"
          />
          <StatTile
            label="Books finished"
            value={insights.booksFinished}
            note={insights.booksFinished === 1 ? "One down" : "All time"}
          />
          {/* The two paces sit side by side so recent form reads against the
              year — the comparison is the point of having both. */}
          <StatTile
            label={`Pace · ${insights.paceWindowDays} days`}
            value={insights.avgPagesPerDay}
            unit="pp / day"
            note="Recent form"
          />
          <StatTile
            label={`Pace · ${insights.year}`}
            value={insights.avgPagesPerDayThisYear}
            unit="pp / day"
            note={`Every day since 1 Jan ${insights.year}`}
          />
          <StatTile
            label="On the shelf"
            value={insights.booksOnShelf}
            note="Reading or waiting to start"
            wide
          />
        </div>

        <PagesByMonthChart data={insights.pagesByMonth} />
      </div>
    </>
  );
}

/** A headline number on the darker stock, captioned above and below. */
function StatTile({
  label,
  value,
  unit,
  note,
  wide,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note: string;
  /** Spans both columns, so an odd tile does not sit orphaned. */
  wide?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-card border border-rule bg-paper-dark px-3 py-2.5",
        wide && "col-span-2"
      )}
    >
      <p className="label-caps text-charcoal/55">{label}</p>
      <p className="tnum mt-1.5 flex items-baseline gap-1 leading-none text-ink">
        <span className="text-[26px] font-semibold">{value}</span>
        {unit && <span className="label-caps text-charcoal/50">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-charcoal/55">{note}</p>
    </div>
  );
}
