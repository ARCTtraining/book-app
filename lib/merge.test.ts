import { describe, expect, it } from "vitest";
import { mergeLibraries, mergeLogs, sameLibrary, type Mergeable } from "./merge";
import { SAMPLE_CATALOG } from "./catalog";
import type { ProgressLog, ShelfEntry } from "./types";

const piranesi = SAMPLE_CATALOG[0];

function entry(id: string, updatedAt: string, over: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    id,
    book: piranesi,
    status: "reading",
    currentPage: 0,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    ...over,
  };
}

function log(entryId: string, day: string, pagesRead: number): ProgressLog {
  return { id: `${entryId}-${day}`, entryId, day, pagesRead, page: pagesRead, at: day };
}

const shelf = (over: Partial<Mergeable> = {}): Mergeable => ({
  entries: [],
  logs: [],
  tombstones: [],
  ...over,
});

describe("mergeLibraries", () => {
  it("keeps books that only one side has", () => {
    const merged = mergeLibraries(
      shelf({ entries: [entry("a", "2026-01-02T00:00:00.000Z")] }),
      shelf({ entries: [entry("b", "2026-01-02T00:00:00.000Z")] })
    );
    expect(merged.entries.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("takes the newer edit when both sides changed a book", () => {
    const mine = entry("a", "2026-03-02T00:00:00.000Z", { currentPage: 120 });
    const theirs = entry("a", "2026-03-01T00:00:00.000Z", { currentPage: 40 });

    expect(mergeLibraries(shelf({ entries: [mine] }), shelf({ entries: [theirs] }))
      .entries[0].currentPage).toBe(120);

    // Symmetric: the same pair merges the same way whichever device syncs.
    expect(mergeLibraries(shelf({ entries: [theirs] }), shelf({ entries: [mine] }))
      .entries[0].currentPage).toBe(120);
  });

  it("lets an unstamped legacy entry lose to a real edit", () => {
    const legacy = entry("a", new Date(0).toISOString(), { currentPage: 5 });
    const edited = entry("a", "2026-03-01T00:00:00.000Z", { currentPage: 200 });
    expect(
      mergeLibraries(shelf({ entries: [legacy] }), shelf({ entries: [edited] }))
        .entries[0].currentPage
    ).toBe(200);
  });

  it("propagates a deletion made on the other device", () => {
    // Without tombstones the book would simply come back.
    const merged = mergeLibraries(
      shelf({ entries: [entry("a", "2026-03-01T00:00:00.000Z")] }),
      shelf({ tombstones: [{ id: "a", deletedAt: "2026-03-02T00:00:00.000Z" }] })
    );
    expect(merged.entries).toHaveLength(0);
  });

  it("keeps a book edited after it was deleted elsewhere", () => {
    // Deleting on the phone then reading on the laptop should not lose the
    // reading.
    const merged = mergeLibraries(
      shelf({ entries: [entry("a", "2026-03-05T00:00:00.000Z", { currentPage: 90 })] }),
      shelf({ tombstones: [{ id: "a", deletedAt: "2026-03-02T00:00:00.000Z" }] })
    );
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].currentPage).toBe(90);
    // And the spent tombstone is not carried forever.
    expect(merged.tombstones).toHaveLength(0);
  });

  it("discards logs belonging to a deleted book", () => {
    const merged = mergeLibraries(
      shelf({ logs: [log("a", "2026-03-01", 30)] }),
      shelf({
        entries: [entry("a", "2026-03-01T00:00:00.000Z")],
        tombstones: [{ id: "a", deletedAt: "2026-03-09T00:00:00.000Z" }],
      })
    );
    expect(merged.entries).toHaveLength(0);
    expect(merged.logs).toHaveLength(0);
  });

  it("is idempotent — syncing twice changes nothing", () => {
    const a = shelf({
      entries: [entry("a", "2026-03-01T00:00:00.000Z")],
      logs: [log("a", "2026-03-01", 30)],
    });
    const once = mergeLibraries(a, shelf());
    const twice = mergeLibraries(once, once);
    expect(twice).toEqual(once);
  });
});

describe("mergeLogs", () => {
  it("keeps the further progress when both devices read the same day", () => {
    // Same-day updates are one record per book, so the day is reconciled by
    // taking the larger figure rather than adding them together.
    const merged = mergeLogs([log("a", "2026-03-01", 40)], [log("a", "2026-03-01", 25)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].pagesRead).toBe(40);
  });

  it("keeps separate days apart", () => {
    const merged = mergeLogs(
      [log("a", "2026-03-01", 40)],
      [log("a", "2026-03-02", 25)]
    );
    expect(merged).toHaveLength(2);
  });

  it("keeps the same day apart for different books", () => {
    const merged = mergeLogs(
      [log("a", "2026-03-01", 40)],
      [log("b", "2026-03-01", 25)]
    );
    expect(merged).toHaveLength(2);
  });
});

describe("sameLibrary", () => {
  const base = shelf({
    entries: [entry("a", "2026-03-01T00:00:00.000Z")],
    logs: [log("a", "2026-03-01", 30)],
  });

  it("ignores ordering", () => {
    // Rows come back from the database in no particular order; a reorder
    // must not be mistaken for a change and trigger a pointless rewrite.
    const reordered = shelf({
      entries: [entry("b", "2026-03-02T00:00:00.000Z"), entry("a", "2026-03-01T00:00:00.000Z")],
      logs: [log("a", "2026-03-02", 10), log("a", "2026-03-01", 30)],
    });
    const forwards = shelf({
      entries: [entry("a", "2026-03-01T00:00:00.000Z"), entry("b", "2026-03-02T00:00:00.000Z")],
      logs: [log("a", "2026-03-01", 30), log("a", "2026-03-02", 10)],
    });
    expect(sameLibrary(reordered, forwards)).toBe(true);
  });

  it("notices a changed page", () => {
    const moved = shelf({
      entries: [entry("a", "2026-03-02T00:00:00.000Z", { currentPage: 90 })],
      logs: [log("a", "2026-03-01", 30)],
    });
    expect(sameLibrary(base, moved)).toBe(false);
  });

  it("notices an added or removed book", () => {
    const extra = shelf({
      entries: [entry("a", "2026-03-01T00:00:00.000Z"), entry("b", "2026-03-01T00:00:00.000Z")],
      logs: [log("a", "2026-03-01", 30)],
    });
    expect(sameLibrary(base, extra)).toBe(false);
    expect(sameLibrary(base, shelf())).toBe(false);
  });

  it("says two empty shelves match", () => {
    expect(sameLibrary(shelf(), shelf())).toBe(true);
  });
});

describe("a day is a day, whatever form it arrives in", () => {
  it("collapses a plain day and a full timestamp for the same book", () => {
    // This took production sync down: the two keys survived the merge and
    // then violated the unique index on (entry_id, day).
    const plain: ProgressLog = {
      id: "a", entryId: "e", day: "2026-08-22", pagesRead: 80, page: 80, at: "x",
    };
    const stamped: ProgressLog = {
      ...plain, id: "b", day: "2026-08-22T00:00:00.000Z", pagesRead: 40,
    };

    const merged = mergeLogs([plain], [stamped]);
    expect(merged).toHaveLength(1);
    expect(merged[0].day).toBe("2026-08-22");
    // The further progress still wins.
    expect(merged[0].pagesRead).toBe(80);
  });

  it("normalises the day it stores, not just the one it compares", () => {
    const stamped: ProgressLog = {
      id: "a", entryId: "e", day: "2026-08-22T12:00:00.000Z",
      pagesRead: 10, page: 10, at: "x",
    };
    expect(mergeLogs([stamped], [])[0].day).toBe("2026-08-22");
  });

  it("keeps genuinely different days apart", () => {
    const a: ProgressLog = {
      id: "a", entryId: "e", day: "2026-08-22", pagesRead: 10, page: 10, at: "x",
    };
    const b: ProgressLog = { ...a, id: "b", day: "2026-08-23T00:00:00.000Z" };
    expect(mergeLogs([a], [b])).toHaveLength(2);
  });
});

describe("one id is one record", () => {
  const at = (iso: string) => iso;

  it("collapses a stale copy of a log the repair has moved", () => {
    // Production hit this as a primary-key violation: the database still
    // held the log on its old date while the device had moved it.
    const stale: ProgressLog = {
      id: "same", entryId: "e", day: "2026-09-04",
      pagesRead: 245, page: 245, at: at("2026-09-03T21:58:00.000Z"),
    };
    const moved: ProgressLog = {
      ...stale, day: "2026-08-22", at: at("2026-09-04T10:00:00.000Z"),
    };

    const merged = mergeLogs([moved], [stale]);
    expect(merged).toHaveLength(1);
    // The later write is the repaired one.
    expect(merged[0].day).toBe("2026-08-22");
  });

  it("resolves the same pair whichever device syncs first", () => {
    const stale: ProgressLog = {
      id: "same", entryId: "e", day: "2026-09-04",
      pagesRead: 245, page: 245, at: at("2026-09-03T21:58:00.000Z"),
    };
    const moved: ProgressLog = {
      ...stale, day: "2026-08-22", at: at("2026-09-04T10:00:00.000Z"),
    };
    expect(mergeLogs([stale], [moved])).toEqual(mergeLogs([moved], [stale]));
  });

  it("never emits two logs sharing an id", () => {
    const a: ProgressLog = {
      id: "x", entryId: "e", day: "2026-01-01", pagesRead: 10, page: 10, at: "2026-01-01",
    };
    const b: ProgressLog = { ...a, day: "2026-02-02", at: "2026-02-02" };
    const c: ProgressLog = { ...a, day: "2026-03-03", at: "2026-03-03" };

    const merged = mergeLogs([a, b], [c]);
    expect(new Set(merged.map((l) => l.id)).size).toBe(merged.length);
  });

  it("keeps distinct logs on distinct days apart", () => {
    const a: ProgressLog = {
      id: "a", entryId: "e", day: "2026-01-01", pagesRead: 10, page: 10, at: "2026-01-01",
    };
    const b: ProgressLog = { ...a, id: "b", day: "2026-01-02", at: "2026-01-02" };
    expect(mergeLogs([a, b], [])).toHaveLength(2);
  });
});
