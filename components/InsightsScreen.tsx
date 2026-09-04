"use client";

import { useLibrary } from "./LibraryProvider";
import { PagesByMonthChart } from "./charts/PagesByMonthChart";
import { GenreChart } from "./charts/GenreChart";
import { EmptyState, LoadingRules, PageTitle } from "./ui";

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
          <StatTile
            label="Pace"
            value={insights.avgPagesPerDay}
            unit="pp / day"
            note={`Mean over the last ${insights.paceWindowDays} days`}
          />
          <StatTile
            label="On the shelf"
            value={insights.booksOnShelf}
            note="Reading or waiting to start"
          />
        </div>

        <PagesByMonthChart data={insights.pagesByMonth} />
        <GenreChart data={insights.booksByGenre} />
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
}: {
  label: string;
  value: string | number;
  unit?: string;
  note: string;
}) {
  return (
    <div className="rounded-card border border-rule bg-paper-dark px-3 py-2.5">
      <p className="label-caps text-charcoal/55">{label}</p>
      <p className="tnum mt-1.5 flex items-baseline gap-1 leading-none text-ink">
        <span className="text-[26px] font-semibold">{value}</span>
        {unit && <span className="label-caps text-charcoal/50">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-charcoal/55">{note}</p>
    </div>
  );
}
