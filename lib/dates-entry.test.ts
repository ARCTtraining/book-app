import { describe, expect, it } from "vitest";
import {
  addFinishedBook,
  addToShelf,
  repairBackfillLogs,
  setEntryDates,
  updateProgress,
  validateEntryDates,
} from "./library";
import { emptyState } from "./storage";
import { SAMPLE_CATALOG } from "./catalog";
import { dayKey, dayOf, isoFromDay, shiftDay, todayKey } from "./dates";
import { computeInsights } from "./insights";
import { computeStreak } from "./streaks";

const today = todayKey();
const piranesi = SAMPLE_CATALOG.find((b) => b.title === "Piranesi")!;

describe("isoFromDay / dayOf", () => {
  it("round-trips a calendar day", () => {
    expect(dayOf(isoFromDay("2026-03-14"))).toBe("2026-03-14");
  });

  it("survives timezones either side of Greenwich", () => {
    // Storing local midnight would shift the day; midday does not. This is
    // the bug that made a book finished on the 1st display as the 31st.
    for (const day of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
      expect(dayOf(isoFromDay(day))).toBe(day);
      expect(dayKey(new Date(isoFromDay(day)))).toBe(day);
    }
  });

  it("returns undefined for nothing or nonsense", () => {
    expect(dayOf(undefined)).toBeUndefined();
    expect(dayOf("not-a-date")).toBeUndefined();
  });
});

describe("validateEntryDates", () => {
  it("accepts a sensible pair", () => {
    expect(validateEntryDates(shiftDay(today, -10), today, today)).toBeNull();
  });

  it("accepts either date on its own, or neither", () => {
    expect(validateEntryDates(undefined, today, today)).toBeNull();
    expect(validateEntryDates(today, undefined, today)).toBeNull();
    expect(validateEntryDates(undefined, undefined, today)).toBeNull();
  });

  it("rejects a future date", () => {
    expect(validateEntryDates(shiftDay(today, 1), undefined, today)).toMatch(/future/);
    expect(validateEntryDates(undefined, shiftDay(today, 1), today)).toMatch(/future/);
  });

  it("rejects finishing before starting", () => {
    expect(validateEntryDates(today, shiftDay(today, -1), today)).toMatch(/before/);
  });

  it("allows starting and finishing on the same day", () => {
    expect(validateEntryDates(today, today, today)).toBeNull();
  });
});

describe("setEntryDates", () => {
  function finishedEntry() {
    let state = addToShelf(emptyState(), piranesi, "reading");
    const id = state.entries[0].id;
    state = setEntryDates(state, id, {
      startedAt: shiftDay(today, -20),
      finishedAt: shiftDay(today, -10),
    });
    return [state, id] as const;
  }

  it("rewrites both dates", () => {
    const [state, id] = finishedEntry();
    expect(dayOf(state.entries[0].startedAt)).toBe(shiftDay(today, -20));
    expect(dayOf(state.entries[0].finishedAt)).toBe(shiftDay(today, -10));
    expect(id).toBeTruthy();
  });

  it("leaves the other date alone when only one is given", () => {
    const [state, id] = finishedEntry();
    const next = setEntryDates(state, id, { finishedAt: shiftDay(today, -5) });

    expect(dayOf(next.entries[0].startedAt)).toBe(shiftDay(today, -20));
    expect(dayOf(next.entries[0].finishedAt)).toBe(shiftDay(today, -5));
  });

  it("clears a date when passed null", () => {
    const [state, id] = finishedEntry();
    const next = setEntryDates(state, id, { finishedAt: null });
    expect(next.entries[0].finishedAt).toBeUndefined();
    expect(next.entries[0].startedAt).toBeDefined();
  });

  it("refuses an invalid pair rather than storing it", () => {
    // The shelf must never hold a book finished before it was started.
    const [state, id] = finishedEntry();
    const next = setEntryDates(state, id, { finishedAt: shiftDay(today, -30) });
    expect(next).toBe(state);
  });

  it("refuses a future date", () => {
    const [state, id] = finishedEntry();
    expect(setEntryDates(state, id, { finishedAt: shiftDay(today, 1) })).toBe(state);
  });

  it("ignores an unknown entry", () => {
    const [state] = finishedEntry();
    expect(setEntryDates(state, "nope", { finishedAt: today })).toBe(state);
  });
});

describe("addFinishedBook", () => {
  const lastYear = shiftDay(today, -300);

  it("puts the book straight on the finished shelf, fully read", () => {
    const state = addFinishedBook(emptyState(), piranesi, { finishedAt: lastYear });
    const [entry] = state.entries;

    expect(entry.status).toBe("finished");
    expect(entry.currentPage).toBe(piranesi.pageCount);
    expect(dayOf(entry.finishedAt)).toBe(lastYear);
  });

  it("lands the pages in the right month on the chart", () => {
    // Without a log, Insights would count the book in its totals but draw
    // nothing in the pages-by-month line.
    const state = addFinishedBook(emptyState(), piranesi, {
      finishedAt: shiftDay(today, -40),
    });
    const insights = computeInsights(state, today);

    expect(insights.totalPagesRead).toBe(piranesi.pageCount);
    expect(insights.booksFinished).toBe(1);
    expect(insights.pagesByMonth.some((m) => m.pages === piranesi.pageCount)).toBe(true);
  });

  it("records an optional start date", () => {
    const state = addFinishedBook(emptyState(), piranesi, {
      startedAt: shiftDay(today, -320),
      finishedAt: lastYear,
    });
    expect(dayOf(state.entries[0].startedAt)).toBe(shiftDay(today, -320));
  });

  it("refuses an invalid pair", () => {
    const before = emptyState();
    const after = addFinishedBook(before, piranesi, {
      startedAt: today,
      finishedAt: shiftDay(today, -5),
    });
    expect(after).toBe(before);
  });

  it("converts a book already on the shelf instead of duplicating it", () => {
    let state = addToShelf(emptyState(), piranesi, "want");
    state = addFinishedBook(state, piranesi, { finishedAt: lastYear });

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].status).toBe("finished");
  });

  it("does not double-count pages when added twice", () => {
    let state = addFinishedBook(emptyState(), piranesi, { finishedAt: lastYear });
    state = addFinishedBook(state, piranesi, { finishedAt: shiftDay(today, -20) });

    expect(state.logs).toHaveLength(1);
    expect(computeInsights(state, today).totalPagesRead).toBe(piranesi.pageCount);
  });

  it("does not award a streak for a book finished long ago", () => {
    const state = addFinishedBook(emptyState(), piranesi, { finishedAt: lastYear });
    expect(computeStreak(state.logs, today).current).toBe(0);
  });
});

describe("the backfill log follows the finish date", () => {
  const march = shiftDay(today, -180);
  const june = shiftDay(today, -90);

  it("moves the log when the finish date is corrected", () => {
    // The bug: a shelf of books read across the year drew every page into
    // the month they happened to be entered.
    let state = addFinishedBook(emptyState(), piranesi, { finishedAt: today });
    expect(state.logs[0].day).toBe(today);

    state = setEntryDates(state, state.entries[0].id, { finishedAt: march });

    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].day).toBe(march);
    expect(state.logs[0].pagesRead).toBe(piranesi.pageCount);
  });

  it("puts the pages in the right month on the chart", () => {
    let state = addFinishedBook(emptyState(), piranesi, { finishedAt: today });
    state = setEntryDates(state, state.entries[0].id, { finishedAt: june });

    const insights = computeInsights(state, today);
    const month = insights.pagesByMonth.find((m) => m.month === june.slice(0, 7));
    expect(month?.pages).toBe(piranesi.pageCount);
    // And nothing left behind in the month it was entered.
    const entered = insights.pagesByMonth.find((m) => m.month === today.slice(0, 7));
    expect(entered?.pages).toBe(0);
  });

  it("leaves a genuine day-by-day record alone", () => {
    // A book actually read through the app has real sessions; correcting its
    // finish date must not redistribute them.
    let state = addToShelf(emptyState(), piranesi, "reading");
    const id = state.entries[0].id;
    state = { ...state, logs: [
      { id: "a", entryId: id, day: shiftDay(today, -3), pagesRead: 100, page: 100, at: "x" },
      { id: "b", entryId: id, day: shiftDay(today, -1), pagesRead: 145, page: 245, at: "x" },
    ] };

    const after = setEntryDates(state, id, { finishedAt: march });
    expect(after.logs.map((l) => l.day)).toEqual([
      shiftDay(today, -3),
      shiftDay(today, -1),
    ]);
  });

  it("leaves a single log alone when it is not the whole book", () => {
    let state = addToShelf(emptyState(), piranesi, "reading");
    const id = state.entries[0].id;
    state = { ...state, logs: [
      { id: "a", entryId: id, day: today, pagesRead: 30, page: 30, at: "x" },
    ] };
    expect(setEntryDates(state, id, { finishedAt: march }).logs[0].day).toBe(today);
  });

  it("repairs a shelf saved before the fix", () => {
    let state = addFinishedBook(emptyState(), piranesi, { finishedAt: today });
    // Simulate the old behaviour: dates edited, log left behind.
    state = {
      ...state,
      entries: state.entries.map((e) => ({ ...e, finishedAt: isoFromDay(march) })),
    };
    expect(state.logs[0].day).toBe(today);

    const repaired = repairBackfillLogs(state);
    expect(repaired.logs[0].day).toBe(march);
  });

  it("leaves an unfinished book out of the repair", () => {
    let state = addToShelf(emptyState(), piranesi, "reading");
    state = updateProgress(state, state.entries[0].id, piranesi.pageCount - 1);
    expect(repairBackfillLogs(state)).toBe(state);
  });
});
