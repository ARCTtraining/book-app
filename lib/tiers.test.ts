import { describe, expect, it } from "vitest";
import { buildTierBoard, TIERS } from "./tiers";
import { addFinishedBook, addToShelf, duplicateGroups, setTier } from "./library";
import { emptyState } from "./storage";
import { SAMPLE_CATALOG } from "./catalog";
import { shiftDay, todayKey } from "./dates";
import type { CatalogBook } from "./types";

const today = todayKey();
const piranesi = SAMPLE_CATALOG.find((b) => b.title === "Piranesi")!;
const sapiens = SAMPLE_CATALOG.find((b) => b.title === "Sapiens")!;

function finishedShelf(...books: CatalogBook[]) {
  let state = emptyState();
  books.forEach((book, i) => {
    state = addFinishedBook(state, book, { finishedAt: shiftDay(today, -i - 1) });
  });
  return state;
}

describe("setTier", () => {
  it("places a book and clears it again", () => {
    let state = finishedShelf(piranesi);
    const id = state.entries[0].id;

    state = setTier(state, id, "S");
    expect(state.entries[0].tier).toBe("S");

    state = setTier(state, id, null);
    expect(state.entries[0].tier).toBeUndefined();
  });

  it("stamps the entry, so a tier syncs like any other edit", () => {
    // Tiers merge through updatedAt; an unstamped change would be lost.
    const state = finishedShelf(piranesi);
    const before = state.entries[0].updatedAt;
    const after = setTier(state, state.entries[0].id, "A");
    expect(after.entries[0].updatedAt >= before).toBe(true);
  });
});

describe("buildTierBoard", () => {
  it("offers a row for every tier, even empty ones", () => {
    const board = buildTierBoard(finishedShelf(piranesi));
    expect(board.rows.map((r) => r.tier)).toEqual(TIERS);
  });

  it("starts with everything unplaced", () => {
    const board = buildTierBoard(finishedShelf(piranesi, sapiens));
    expect(board.unranked).toHaveLength(2);
    expect(board.placed).toBe(0);
    expect(board.total).toBe(2);
  });

  it("moves a book out of the tray once it has a tier", () => {
    let state = finishedShelf(piranesi, sapiens);
    state = setTier(state, state.entries[0].id, "B");

    const board = buildTierBoard(state);
    expect(board.rows.find((r) => r.tier === "B")!.entries).toHaveLength(1);
    expect(board.unranked).toHaveLength(1);
    expect(board.placed).toBe(1);
  });

  it("ranks only finished books", () => {
    // A book you have not read has nothing to rank.
    let state = finishedShelf(piranesi);
    state = addToShelf(state, sapiens, "reading");
    const board = buildTierBoard(state);

    expect(board.total).toBe(1);
    expect(board.unranked.map((e) => e.book.title)).toEqual(["Piranesi"]);
  });

  it("treats an unknown tier as unplaced rather than dropping the book", () => {
    const state = finishedShelf(piranesi);
    const corrupted = {
      ...state,
      entries: [{ ...state.entries[0], tier: "Z" as never }],
    };
    expect(buildTierBoard(corrupted).unranked).toHaveLength(1);
  });
});

describe("the same book cannot land on the shelf twice", () => {
  // The live case: one Piranesi came from the bundled catalogue (245pp,
  // no cover) and one from Google Books (272pp). Different ids AND
  // different ISBNs, so only title and author catch it.
  const sampleEdition: CatalogBook = {
    id: "9780571334650", isbn13: "9780571334650", title: "Piranesi",
    author: "Susanna Clarke", pageCount: 245, genre: "Literary Fiction",
  };
  const googleEdition: CatalogBook = {
    id: "MUMIEAAAQBAJ", isbn13: "9781526634108", title: "Piranesi",
    author: "Susanna Clarke", pageCount: 272, genre: "Fiction",
    thumbnailUrl: "https://books.google.com/x.jpg",
  };

  it("recognises a different edition of a book already on the shelf", () => {
    let state = addToShelf(emptyState(), sampleEdition, "finished");
    state = addToShelf(state, googleEdition, "want");
    expect(state.entries).toHaveLength(1);
  });

  it("catches it when backfilling too", () => {
    let state = addToShelf(emptyState(), sampleEdition, "want");
    state = addFinishedBook(state, googleEdition, { finishedAt: today });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].status).toBe("finished");
  });

  it("ignores subtitles and edition markers in the title", () => {
    const tieIn: CatalogBook = { ...googleEdition, id: "z", isbn13: "z",
      title: "Piranesi: A Novel (Movie Tie-In)" };
    let state = addToShelf(emptyState(), sampleEdition, "want");
    state = addToShelf(state, tieIn, "want");
    expect(state.entries).toHaveLength(1);
  });

  it("still keeps genuinely different books apart", () => {
    let state = addToShelf(emptyState(), sampleEdition, "want");
    state = addToShelf(state, sapiens, "want");
    expect(state.entries).toHaveLength(2);
  });

  it("reports duplicates already on a shelf", () => {
    // For cleaning up what the old matching let through.
    const state = {
      ...emptyState(),
      entries: [
        { id: "a", book: sampleEdition, status: "finished" as const, currentPage: 245,
          addedAt: "x", updatedAt: "x" },
        { id: "b", book: googleEdition, status: "finished" as const, currentPage: 272,
          addedAt: "x", updatedAt: "x" },
        { id: "c", book: sapiens, status: "finished" as const, currentPage: 443,
          addedAt: "x", updatedAt: "x" },
      ],
    };
    const groups = duplicateGroups(state);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
});
