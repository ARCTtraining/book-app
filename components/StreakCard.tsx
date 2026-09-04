"use client";

import Link from "next/link";
import { useLibrary } from "./LibraryProvider";
import { cx, IndexCard } from "./ui";
import { weekdayInitial } from "@/lib/dates";
import { pagesOnDay } from "@/lib/streaks";
import { todayKey } from "@/lib/dates";

/**
 * The streak counter, sitting at the top of the Shelf.
 *
 * Three states, and none of them tell the reader off:
 *  - zero      → an invitation to start one today
 *  - alive     → yesterday counted, today is still open
 *  - logged    → today is in, here is the run
 */
export function StreakCard() {
  const { streak, state } = useLibrary();
  const today = todayKey();
  const pagesToday = pagesOnDay(state.logs, today);
  const hasBookInProgress = state.entries.some((e) => e.status === "reading");

  const headline =
    streak.current === 0
      ? "Start a streak"
      : `${streak.current} day${streak.current === 1 ? "" : "s"}`;

  return (
    <IndexCard spine="#C98A2B" tone="alt">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps text-charcoal/55">
            {streak.current === 0 ? "Reading streak" : "Current streak"}
          </p>
          <p
            className={cx(
              "tnum mt-1 font-serif leading-none text-ink",
              streak.current === 0 ? "text-[22px]" : "text-[34px]"
            )}
          >
            {headline}
          </p>
        </div>
        <WeekStrip days={streak.recentDays} />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-charcoal/75">
        <StreakMessage
          current={streak.current}
          loggedToday={streak.loggedToday}
          pagesToday={pagesToday}
          longest={streak.longest}
          hasBookInProgress={hasBookInProgress}
        />
      </p>
    </IndexCard>
  );
}

function StreakMessage({
  current,
  loggedToday,
  pagesToday,
  longest,
  hasBookInProgress,
}: {
  current: number;
  loggedToday: boolean;
  pagesToday: number;
  longest: number;
  hasBookInProgress: boolean;
}) {
  if (loggedToday) {
    return (
      <>
        <span className="tnum font-medium text-ink">{pagesToday} pages</span>{" "}
        logged today.
        {longest > current
          ? ` Your best run is ${longest} days.`
          : " That is your longest run yet."}
      </>
    );
  }

  if (current > 0) {
    return <>Yesterday counted. A few pages today keeps the run going.</>;
  }

  if (hasBookInProgress) {
    return <>Log today&rsquo;s pages on any book below and your streak starts at one.</>;
  }

  return (
    <>
      Streaks count days with pages logged.{" "}
      <Link href="/search" className="text-ink underline underline-offset-2">
        Find a book
      </Link>{" "}
      to begin one.
    </>
  );
}

/** Seven cells, oldest first, reading left to right into today. */
function WeekStrip({ days }: { days: { day: string; logged: boolean }[] }) {
  return (
    <ul className="flex shrink-0 gap-1" aria-label="Last seven days">
      {days.map(({ day, logged }, i) => {
        const isToday = i === days.length - 1;
        return (
          <li key={day} className="flex flex-col items-center gap-1">
            <span
              title={`${day}: ${logged ? "logged" : "no pages"}`}
              className={cx(
                "block size-5 rounded-[3px] border",
                logged ? "border-marigold bg-marigold" : "border-rule bg-paper",
                isToday && !logged && "border-ink border-dashed"
              )}
            />
            <span
              aria-hidden="true"
              className={cx(
                "label-caps text-[9px] tracking-normal",
                isToday ? "text-ink" : "text-charcoal/40"
              )}
            >
              {weekdayInitial(day)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
