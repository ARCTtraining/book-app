import { describe, expect, it, vi } from "vitest";
import {
  BLURB_LIMIT,
  cleanBlurb,
  dedupeEditions,
  demoteJunk,
  GoogleBooksError,
  hydratePageCounts,
  isTrackable,
  mapVolume,
  normalizeGenre,
  searchGoogleBooks,
  toCatalogBooks,
  type GoogleVolume,
} from "./googleBooks";
import type { CatalogBook } from "./types";

/** A volume with everything present; spread over it to make awkward ones. */
function volume(overrides: Partial<GoogleVolume["volumeInfo"]> = {}, id = "vol-1"): GoogleVolume {
  return {
    id,
    volumeInfo: {
      title: "Piranesi",
      authors: ["Susanna Clarke"],
      pageCount: 245,
      categories: ["Fiction"],
      publishedDate: "2020-09-15",
      description: "A man, an endless house.",
      imageLinks: { thumbnail: "http://books.google.com/thumb.jpg" },
      industryIdentifiers: [
        { type: "ISBN_10", identifier: "1526622424" },
        { type: "ISBN_13", identifier: "9781526622426" },
      ],
      ...overrides,
    },
  };
}

describe("normalizeGenre", () => {
  it("collapses case so one genre cannot draw as two bars", () => {
    // Both spellings come back from the live API.
    expect(normalizeGenre(["BIOGRAPHY & AUTOBIOGRAPHY"])).toBe(
      normalizeGenre(["Biography & Autobiography"])
    );
  });

  it("takes the broadest segment of a slashed category", () => {
    expect(normalizeGenre(["Biography & Autobiography / Personal Memoirs"])).toBe(
      "Biography"
    );
  });

  it("maps common Google categories onto the app's own genres", () => {
    expect(normalizeGenre(["Juvenile Fiction"])).toBe("Fiction");
    expect(normalizeGenre(["Literary Collections"])).toBe("Essays");
  });

  it("passes through a category it has no alias for", () => {
    expect(normalizeGenre(["Political Science"])).toBe("Political Science");
  });

  it("falls back when categories are missing or empty", () => {
    expect(normalizeGenre(undefined)).toBe("Unfiled");
    expect(normalizeGenre([])).toBe("Unfiled");
    expect(normalizeGenre(["  "])).toBe("Unfiled");
  });
});

describe("cleanBlurb", () => {
  it("strips the HTML Google embeds in descriptions", () => {
    expect(cleanBlurb("<p>A man, <b>an endless house</b>.</p>")).toBe(
      "A man, an endless house."
    );
  });

  it("decodes escaped entities", () => {
    expect(cleanBlurb("Tom &amp; Jerry&#39;s &quot;book&quot;")).toBe(
      "Tom & Jerry’s \"book\""
    );
  });

  it("repairs the mojibake Google itself serves", () => {
    // Live data contained: 'the radical âe" and sometimes devastating âe"'
    expect(cleanBlurb('the radical âe" breakthroughs')).toBe(
      "the radical — breakthroughs"
    );
  });

  it("trims a long description at a word boundary", () => {
    const long = "word ".repeat(200);
    const out = cleanBlurb(long)!;
    expect(out.length).toBeLessThanOrEqual(BLURB_LIMIT + 1);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wo…$/); // never mid-word
  });

  it("leaves a short description alone", () => {
    expect(cleanBlurb("A short blurb.")).toBe("A short blurb.");
    expect(cleanBlurb("A short blurb.")!.endsWith("…")).toBe(false);
  });

  it("returns undefined for nothing usable", () => {
    expect(cleanBlurb(undefined)).toBeUndefined();
    expect(cleanBlurb("")).toBeUndefined();
    expect(cleanBlurb("   ")).toBeUndefined();
    expect(cleanBlurb("<p></p>")).toBeUndefined();
  });
});

describe("mapVolume", () => {
  it("maps a complete volume", () => {
    expect(mapVolume(volume())).toEqual({
      id: "vol-1",
      isbn13: "9781526622426",
      title: "Piranesi",
      author: "Susanna Clarke",
      pageCount: 245,
      genre: "Fiction",
      year: 2020,
      blurb: "A man, an endless house.",
      thumbnailUrl: "https://books.google.com/thumb.jpg",
    });
  });

  it("keeps a book with no page count, marked as untrackable", () => {
    // The search endpoint under-reports: David Keenan's "Boyhood" comes back
    // with 0 pages in a search and 342 when fetched by id. Discarding here
    // would hide real books, so the decision is deferred until after
    // hydration.
    expect(mapVolume(volume({ pageCount: undefined }))?.pageCount).toBe(0);
    expect(mapVolume(volume({ pageCount: 0 }))?.pageCount).toBe(0);
    expect(isTrackable(mapVolume(volume({ pageCount: 0 }))!)).toBe(false);
    expect(isTrackable(mapVolume(volume())!)).toBe(true);
  });

  it("drops a volume with no title or no id", () => {
    expect(mapVolume(volume({ title: undefined }))).toBeNull();
    expect(mapVolume({ ...volume(), id: undefined })).toBeNull();
  });

  it("upgrades Google's http thumbnails to https", () => {
    // An http image on an https page is blocked as mixed content.
    expect(mapVolume(volume())?.thumbnailUrl?.startsWith("https:")).toBe(true);
  });

  it("names an unattributed book rather than showing a blank", () => {
    expect(mapVolume(volume({ authors: undefined }))?.author).toBe("Unknown author");
  });

  it("survives a partial or missing published date", () => {
    expect(mapVolume(volume({ publishedDate: "2020" }))?.year).toBe(2020);
    expect(mapVolume(volume({ publishedDate: undefined }))?.year).toBeUndefined();
    expect(mapVolume(volume({ publishedDate: "n.d." }))?.year).toBeUndefined();
  });

  it("leaves isbn13 undefined when only an isbn10 is published", () => {
    const only10 = volume({
      industryIdentifiers: [{ type: "ISBN_10", identifier: "1526622424" }],
    });
    expect(mapVolume(only10)?.isbn13).toBeUndefined();
  });
});

describe("dedupeEditions", () => {
  const edition = (over: Partial<CatalogBook>): CatalogBook => ({
    id: "x",
    title: "Sapiens",
    author: "Yuval Noah Harari",
    pageCount: 443,
    genre: "History",
    ...over,
  });

  it("collapses editions of the same work", () => {
    // "Sapiens" came back nine times in one live query.
    const books = [
      edition({ id: "a", pageCount: 443 }),
      edition({ id: "b", pageCount: 464 }),
      edition({ id: "c", pageCount: 498 }),
    ];
    expect(dedupeEditions(books)).toHaveLength(1);
  });

  it("keeps the best-described edition", () => {
    const sparse = edition({ id: "sparse", genre: "Unfiled" });
    const rich = edition({
      id: "rich",
      thumbnailUrl: "https://x/t.jpg",
      blurb: "A brief history.",
      isbn13: "9780062316097",
      year: 2011,
    });
    expect(dedupeEditions([sparse, rich])[0].id).toBe("rich");
  });

  it("treats a subtitled edition as the same work", () => {
    const books = [
      edition({ id: "a", title: "Sapiens" }),
      edition({ id: "b", title: "Sapiens: A Brief History of Humankind" }),
    ];
    expect(dedupeEditions(books)).toHaveLength(1);
  });

  it("treats a tie-in or illustrated printing as the same work", () => {
    // Live search returned both, 497pp and 676pp, as separate results.
    const books = [
      edition({ id: "a", title: "Project Hail Mary", author: "Andy Weir" }),
      edition({
        id: "b",
        title: "Project Hail Mary (Movie Tie-In)",
        author: "Andy Weir",
      }),
      edition({ id: "c", title: "Project Hail Mary [Illustrated]", author: "Andy Weir" }),
    ];
    expect(dedupeEditions(books)).toHaveLength(1);
  });

  it("keeps genuinely different books apart", () => {
    const books = [
      edition({ id: "a" }),
      edition({ id: "b", title: "Homo Deus" }),
      edition({ id: "c", author: "Someone Else" }),
    ];
    expect(dedupeEditions(books)).toHaveLength(3);
  });

  it("ignores punctuation and case differences between editions", () => {
    const books = [
      edition({ id: "a", title: "Sapiens" }),
      edition({ id: "b", title: "SAPIENS." }),
    ];
    expect(dedupeEditions(books)).toHaveLength(1);
  });
});

describe("demoteJunk", () => {
  const book = (title: string, genre = "Fiction"): CatalogBook => ({
    id: title,
    title,
    author: "A",
    pageCount: 100,
    genre,
  });

  it("sinks study guides below the real book without discarding them", () => {
    const ranked = demoteJunk([
      book("Summary of Sapiens"),
      book("Sapiens"),
      book("Sapiens: Study Guide"),
    ]);
    expect(ranked[0].title).toBe("Sapiens");
    expect(ranked).toHaveLength(3);
  });

  it("demotes by category as well as title", () => {
    const ranked = demoteJunk([book("Something", "Study Aids"), book("Real Book")]);
    expect(ranked[0].title).toBe("Real Book");
  });

  it("does not demote a legitimate title containing a junk word", () => {
    // "The Summer Book" must not trip the "summar*" pattern.
    const ranked = demoteJunk([book("The Summer Book"), book("Other")]);
    expect(ranked[0].title).toBe("The Summer Book");
  });

  it("demotes by author, for a clean title from a summary mill", () => {
    // Live search returned a 82-page "Sapiens" credited to "Book Summary".
    const withAuthor = (title: string, author: string): CatalogBook => ({
      ...book(title),
      author,
    });
    const ranked = demoteJunk([
      withAuthor("Sapiens", "Book Summary"),
      withAuthor("Sapiens", "Readtrepreneur Publishing"),
      withAuthor("Sapiens", "Yuval Noah Harari"),
    ]);
    expect(ranked[0].author).toBe("Yuval Noah Harari");
  });

  it("demotes a book review", () => {
    const ranked = demoteJunk([
      book("Book Review: Sapiens by Yuval Noah Harari"),
      book("Sapiens"),
    ]);
    expect(ranked[0].title).toBe("Sapiens");
  });

  it("does not demote an ordinary human author", () => {
    const human: CatalogBook = { ...book("Piranesi"), author: "Susanna Clarke" };
    expect(demoteJunk([human])[0].title).toBe("Piranesi");
  });
});

describe("toCatalogBooks", () => {
  it("keeps page-less books as candidates and sinks junk, preserving Google's order otherwise", () => {
    const volumes = [
      volume({ title: "Summary of Piranesi" }, "junk"),
      volume({ title: "Boyhood", authors: ["David Keenan"], pageCount: 0 }, "pageless"),
      volume({}, "good"),
    ];
    const books = toCatalogBooks(volumes);

    // Google's own relevance ranking is good, so only junk is reordered.
    expect(books.map((b) => b.id)).toEqual(["pageless", "good", "junk"]);
  });

  it("prefers the edition that already states its length", () => {
    // Avoids spending a request to hydrate what a sibling edition knows.
    const volumes = [
      volume({ pageCount: 0 }, "pageless"),
      volume({ pageCount: 245 }, "withPages"),
    ];
    expect(toCatalogBooks(volumes)[0].id).toBe("withPages");
  });

  it("handles an empty response", () => {
    expect(toCatalogBooks([])).toEqual([]);
  });
});

describe("hydratePageCounts", () => {
  const pageless = (id: string): CatalogBook => ({
    id,
    title: `Book ${id}`,
    author: "A",
    pageCount: 0,
    genre: "Fiction",
  });

  const detail = (pages: number) =>
    ({ ok: true, status: 200, json: async () => ({ volumeInfo: { pageCount: pages } }) }) as unknown as Response;

  it("fills in a page count the search endpoint omitted", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(detail(342));
    const [book] = await hydratePageCounts([pageless("Gq5g0QEACAAJ")], "K", fetchImpl);

    expect(book.pageCount).toBe(342);
    expect(isTrackable(book)).toBe(true);
  });

  it("looks up only the books that need it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(detail(100));
    const complete: CatalogBook = { ...pageless("has"), pageCount: 200 };
    await hydratePageCounts([complete, pageless("needs")], "K", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain("needs");
  });

  it("makes no request when nothing is missing", async () => {
    const fetchImpl = vi.fn();
    const complete: CatalogBook = { ...pageless("has"), pageCount: 200 };
    expect(await hydratePageCounts([complete], "K", fetchImpl)).toEqual([complete]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respects the lookup budget", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(detail(100));
    const many = Array.from({ length: 20 }, (_, i) => pageless(`b${i}`));
    await hydratePageCounts(many, "K", fetchImpl, 3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("leaves a book alone when the lookup fails or still has no count", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce(detail(0));

    const books = await hydratePageCounts([pageless("a"), pageless("b")], "K", fetchImpl);
    expect(books.every((b) => b.pageCount === 0)).toBe(true);
  });

  it("survives a network error on one lookup", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(detail(200));

    const books = await hydratePageCounts([pageless("a"), pageless("b")], "K", fetchImpl);
    expect(books.map((b) => b.pageCount).sort()).toEqual([0, 200]);
  });
});

describe("searchGoogleBooks", () => {
  const ok = (items: GoogleVolume[]) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items }),
    } as unknown as Response);

  it("sends the key and the query, and returns mapped books", async () => {
    const fetchImpl = ok([volume()]);
    const books = await searchGoogleBooks("piranesi", "SECRET", { fetchImpl });

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.searchParams.get("q")).toBe("piranesi");
    expect(url.searchParams.get("key")).toBe("SECRET");
    expect(url.searchParams.get("printType")).toBe("books");
    expect(books[0].title).toBe("Piranesi");
  });

  it("caps maxResults at the API's own limit", async () => {
    const fetchImpl = ok([]);
    await searchGoogleBooks("q", "K", { maxResults: 500, fetchImpl });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(Number(url.searchParams.get("maxResults"))).toBe(40);
  });

  it("reports an exhausted quota without leaking the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "quota for key SECRET exceeded" } }),
    } as unknown as Response);

    const error = await searchGoogleBooks("q", "SECRET", { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(GoogleBooksError);
    expect(error.status).toBe(429);
    // Upstream messages echo the key back; ours must not.
    expect(error.message).not.toContain("SECRET");
  });

  it("reports other upstream failures with their status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as unknown as Response);

    const error = await searchGoogleBooks("q", "K", { fetchImpl }).catch((e) => e);
    expect(error.status).toBe(403);
  });

  it("copes with a response carrying no items", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ totalItems: 0 }),
    } as unknown as Response);

    expect(await searchGoogleBooks("zzz", "K", { fetchImpl })).toEqual([]);
  });
});
