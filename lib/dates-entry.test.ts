import { describe, expect, it } from "vitest";
import { addFinishedBook, setEntryDates, validateEntryDates } from "./library";
import { addToShelf } from "./library";
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
