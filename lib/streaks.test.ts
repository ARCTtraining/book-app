import { describe, expect, it } from "vitest";
import { computeStreak, pagesOnDay } from "./streaks";
import { shiftDay, todayKey } from "./dates";
import type { ProgressLog } from "./types";

const today = todayKey();

/** A log `daysAgo` before today. */
const log = (daysAgo: number, pagesRead = 10): ProgressLog => ({
  id: `log-${daysAgo}`,
  entryId: "entry",
  day: shiftDay(today, -daysAgo),
  pagesRead,
  page: pagesRead,
  at: shiftDay(today, -daysAgo),
});

const on = (...daysAgo: number[]) => daysAgo.map((d) => log(d));

describe("computeStreak", () => {
  it("counts back from today", () => {
    expect(computeStreak(on(0, 1, 2), today).current).toBe(3);
  });

  it("stops at the first missed day", () => {
    expect(computeStreak(on(0, 1, 3, 4), today).current).toBe(2);
  });

  it("restarts at one when today follows a gap", () => {
    expect(computeStreak(on(0, 3), today).current).toBe(1);
  });

  it("stays alive on an unlogged today if yesterday counted", () => {
    // The day is not over — the UI invites a log rather than reporting a break.
    const streak = computeStreak(on(1, 2), today);
    expect(streak.current).toBe(2);
    expect(streak.loggedToday).toBe(false);
  });

  it("lapses once a whole day is missed", () => {
    expect(computeStreak(on(2, 3), today).current).toBe(0);
  });

  it("reports whether today is logged", () => {
    expect(computeStreak(on(0), today).loggedToday).toBe(true);
    expect(computeStreak(on(1), today).loggedToday).toBe(false);
  });

  it("ignores logs that recorded no pages", () => {
    expect(computeStreak([log(0, 0)], today).current).toBe(0);
  });

  it("is zero with no logs at all", () => {
    const streak = computeStreak([], today);
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(0);
    expect(streak.loggedToday).toBe(false);
  });

  it("finds the longest run anywhere in history", () => {
    expect(computeStreak(on(9, 8, 7, 6, 1), today).longest).toBe(4);
  });

  it("counts a day once however many books were read", () => {
    const twoBooks: ProgressLog[] = [
      { ...log(0), id: "a", entryId: "book-a" },
      { ...log(0), id: "b", entryId: "book-b" },
    ];
    expect(computeStreak(twoBooks, today).current).toBe(1);
  });

  it("always returns seven day cells, oldest first, ending today", () => {
    const streak = computeStreak(on(0, 2), today);
    expect(streak.recentDays).toHaveLength(7);
    expect(streak.recentDays[6].day).toBe(today);
    expect(streak.recentDays[6].logged).toBe(true);
    expect(streak.recentDays[5].logged).toBe(false);
    expect(streak.recentDays[4].logged).toBe(true);
  });
});

describe("pagesOnDay", () => {
  it("totals every book read that day", () => {
    const logs = [
      { ...log(0, 30), id: "a", entryId: "book-a" },
      { ...log(0, 12), id: "b", entryId: "book-b" },
      { ...log(1, 99), id: "c", entryId: "book-a" },
    ];
    expect(pagesOnDay(logs, today)).toBe(42);
  });

  it("is zero for a day with nothing logged", () => {
    expect(pagesOnDay(on(3), today)).toBe(0);
  });
});
