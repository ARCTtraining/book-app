import { describe, expect, it } from "vitest";
import { emptyState, isSeededDemoShelf } from "./storage";
import { buildSampleLibrary } from "./seed";
import { addToShelf } from "./library";
import { SAMPLE_CATALOG } from "./catalog";
import type { LibraryState, ShelfEntry } from "./types";

const piranesi = SAMPLE_CATALOG[0];

function entry(id: string): ShelfEntry {
  return {
    id,
    book: piranesi,
    status: "want",
    currentPage: 0,
    addedAt: new Date().toISOString(),
  };
}

const withEntries = (entries: ShelfEntry[]): LibraryState => ({
  ...emptyState(),
  entries,
});

describe("isSeededDemoShelf", () => {
  it("recognises a shelf built entirely by the seed generator", () => {
    expect(isSeededDemoShelf(buildSampleLibrary())).toBe(true);
  });

  it("does not treat an empty shelf as demo data", () => {
    // Nothing to clear, and clearing would be indistinguishable anyway.
    expect(isSeededDemoShelf(emptyState())).toBe(false);
  });

  it("does not treat a reader's own shelf as demo data", () => {
    const mine = addToShelf(emptyState(), piranesi, "reading");
    expect(isSeededDemoShelf(mine)).toBe(false);
  });

  it("protects a demo shelf the reader has added even one book to", () => {
    // The one-time clear-out must never take a real book with it.
    const mixed = addToShelf(buildSampleLibrary(), SAMPLE_CATALOG[11], "want");
    expect(isSeededDemoShelf(mixed)).toBe(false);
  });

  it("is decided by entry ids, not by which books are on the shelf", () => {
    // A reader who genuinely added Piranesi is not holding demo data.
    expect(isSeededDemoShelf(withEntries([entry("seed-entry-1")]))).toBe(true);
    expect(isSeededDemoShelf(withEntries([entry("a1b2c3d4-uuid")]))).toBe(false);
  });
});
