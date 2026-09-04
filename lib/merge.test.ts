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
