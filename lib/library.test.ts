import { describe, expect, it } from "vitest";
import {
  addToShelf,
  entriesByStatus,
  logPagesToday,
  markFinished,
  progressPercent,
  removeEntry,
  updateProgress,
} from "./library";
import { emptyState } from "./storage";
import { SAMPLE_CATALOG } from "./catalog";
import { computeStreak } from "./streaks";
import type { LibraryState } from "./types";

const piranesi = SAMPLE_CATALOG.find((b) => b.title === "Piranesi")!;
const sapiens = SAMPLE_CATALOG.find((b) => b.title === "Sapiens")!;

/** A shelf with one book being read, plus the id of its entry. */
function reading(): [LibraryState, string] {
  const state = addToShelf(emptyState(), piranesi, "reading");
  return [state, state.entries[0].id];
}

describe("addToShelf", () => {
  it("puts a book on the shelf with the given status", () => {
    const state = addToShelf(emptyState(), piranesi, "want");
    expect(entriesByStatus(state, "want")).toHaveLength(1);
    expect(state.entries[0].currentPage).toBe(0);
  });

  it("moves an existing entry rather than duplicating it", () => {
    // Searching for a book already on the shelf and hitting "Start reading"
    // is a normal path, not an error.
    let state = addToShelf(emptyState(), piranesi, "want");
    state = addToShelf(state, piranesi, "reading");

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].status).toBe("reading");
    expect(state.entries[0].startedAt).toBeDefined();
  });

  it("does not demote a book already being read", () => {
    let state = addToShelf(emptyState(), piranesi, "reading");
    state = addToShelf(state, piranesi, "want");
    expect(state.entries[0].status).toBe("reading");
  });
});

describe("updateProgress", () => {
  it("records the new page and logs the advance", () => {
    const [state, id] = reading();
    const next = updateProgress(state, id, 40);

    expect(next.entries[0].currentPage).toBe(40);
    expect(next.logs).toHaveLength(1);
    expect(next.logs[0].pagesRead).toBe(40);
  });

  it("folds repeated same-day updates into one log", () => {
    // The slider fires continuously, and a day should count once.
    const [state, id] = reading();
    let next = updateProgress(state, id, 40);
    next = updateProgress(next, id, 90);

    expect(next.logs).toHaveLength(1);
    expect(next.logs[0].pagesRead).toBe(90);
    expect(next.logs[0].page).toBe(90);
  });

  it("moves the bookmark backwards without logging", () => {
    // Dragging back is a correction, not reading.
    const [state, id] = reading();
    let next = updateProgress(state, id, 90);
    next = updateProgress(next, id, 60);

    expect(next.entries[0].currentPage).toBe(60);
    expect(next.logs[0].pagesRead).toBe(90);
  });

  it("clamps to the page count and finishes the book", () => {
    const [state, id] = reading();
    const next = updateProgress(state, id, 5000);

    expect(next.entries[0].currentPage).toBe(piranesi.pageCount);
    expect(next.entries[0].status).toBe("finished");
    expect(next.entries[0].finishedAt).toBeDefined();
  });

  it("clamps negative pages to zero", () => {
    const [state, id] = reading();
    expect(updateProgress(state, id, -20).entries[0].currentPage).toBe(0);
  });

  it("ignores an unknown entry", () => {
    const [state] = reading();
    expect(updateProgress(state, "nope", 10)).toBe(state);
  });
});

describe("markFinished", () => {
  it("fills in the page count and credits the remaining pages", () => {
    const [state, id] = reading();
    let next = updateProgress(state, id, 100);
    next = markFinished(next, id);

    expect(next.entries[0].status).toBe("finished");
    expect(next.entries[0].currentPage).toBe(piranesi.pageCount);
    expect(next.logs[0].pagesRead).toBe(piranesi.pageCount);
  });
});

describe("logPagesToday", () => {
  it("advances by a delta and starts a streak", () => {
    const [state, id] = reading();
    const next = logPagesToday(state, id, 25);

    expect(next.entries[0].currentPage).toBe(25);
    expect(computeStreak(next.logs).current).toBe(1);
  });

  it("ignores non-positive amounts", () => {
    const [state, id] = reading();
    expect(logPagesToday(state, id, 0)).toBe(state);
    expect(logPagesToday(state, id, -5)).toBe(state);
  });
});

describe("removeEntry", () => {
  it("takes the book's logs with it", () => {
    // Orphaned logs would keep inflating the charts after the book is gone.
    let state = addToShelf(emptyState(), piranesi, "reading");
    const id = state.entries[0].id;
    state = updateProgress(state, id, 50);
    state = addToShelf(state, sapiens, "reading");
    state = updateProgress(state, state.entries[0].id, 30);

    const next = removeEntry(state, id);
    expect(next.entries).toHaveLength(1);
    expect(next.logs.every((log) => log.entryId !== id)).toBe(true);
  });
});

describe("entriesByStatus", () => {
  it("puts the book you are furthest through first", () => {
    let state = addToShelf(emptyState(), piranesi, "reading");
    state = addToShelf(state, sapiens, "reading");
    const [a, b] = state.entries;
    state = updateProgress(state, b.id, 200);
    state = updateProgress(state, a.id, 10);

    expect(entriesByStatus(state, "reading")[0].id).toBe(b.id);
  });
});

describe("progressPercent", () => {
  it("rounds to whole percent", () => {
    const [state, id] = reading();
    const next = updateProgress(state, id, 123);
    expect(progressPercent(next.entries[0])).toBe(
      Math.round((123 / piranesi.pageCount) * 100)
    );
  });
});
