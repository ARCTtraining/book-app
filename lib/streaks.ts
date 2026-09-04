import type { ProgressLog, StreakSummary } from "./types";
import { shiftDay, todayKey, type DayKey } from "./dates";

/**
 * Streaks: consecutive local calendar days with at least one page update.
 *
 * A streak stays alive through today until midnight — if the last update was
 * yesterday the count still stands, and the UI invites you to log today
 * rather than telling you it is broken. Only once a full day is missed does
 * the count drop to zero.
 */
export function computeStreak(
  logs: ProgressLog[],
  today: DayKey = todayKey()
): StreakSummary {
  const logged = new Set(logs.filter((log) => log.pagesRead > 0).map((l) => l.day));

  const loggedToday = logged.has(today);
  const yesterday = shiftDay(today, -1);

  // Anchor on today if it is logged, else yesterday if that is. Anything
  // older means the streak has already lapsed.
  let anchor: DayKey | null = null;
  if (loggedToday) anchor = today;
  else if (logged.has(yesterday)) anchor = yesterday;

  let current = 0;
  if (anchor) {
    let cursor = anchor;
    while (logged.has(cursor)) {
      current += 1;
      cursor = shiftDay(cursor, -1);
    }
  }

  return {
    current,
    longest: longestRun(logged),
    loggedToday,
    recentDays: lastSevenDays(logged, today),
  };
}

/** Longest run of consecutive logged days anywhere in the history. */
function longestRun(logged: Set<DayKey>): number {
  const days = [...logged].sort();
  let longest = 0;
  let run = 0;
  let previous: DayKey | null = null;

  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

/** Oldest first, so the strip reads left to right into today. */
function lastSevenDays(logged: Set<DayKey>, today: DayKey) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    return { day, logged: logged.has(day) };
  });
}

/** Total pages logged on a given day, across every book. */
export function pagesOnDay(logs: ProgressLog[], day: DayKey): number {
  return logs
    .filter((log) => log.day === day)
    .reduce((sum, log) => sum + log.pagesRead, 0);
}
