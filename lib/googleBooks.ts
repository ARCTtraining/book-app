import type { CatalogBook } from "./types";

/**
 * Google Books adapter.
 *
 * The API is a search index over every edition Google knows about, not a
 * clean catalogue, so the raw response needs work before it can drive a
 * reading tracker. Measured over 100 real volumes: 22% carry no `pageCount`,
 * 30% no `categories`, a fifth are duplicate editions of a book already in
 * the results, and category strings arrive in inconsistent case
 * ("Biography & Autobiography" alongside "BIOGRAPHY & AUTOBIOGRAPHY").
 *
 * Everything except the fetch itself is pure, so the awkward cases are
 * covered by tests rather than by hitting the network.
 */

export const GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";

/** Only the fields used; the response carries far more. */
export interface GoogleVolume {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    pageCount?: number;
    categories?: string[];
    publishedDate?: string;
    description?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

/**
 * Google's categories are broad shelf labels. These few aliases land the
 * common ones on the genres the design system already has a spine colour
 * for, instead of falling through to a hashed fallback.
 */
const GENRE_ALIASES: Record<string, string> = {
  "biography & autobiography": "Biography",
  "literary collections": "Essays",
  "literary criticism": "Essays",
  "juvenile fiction": "Fiction",
  "young adult fiction": "Fiction",
  "detective and mystery stories": "Mystery",
  "american fiction": "Fiction",
  "english fiction": "Fiction",
};

/**
 * Study guides, summaries and reviews that crowd out the actual book.
 *
 * Searching "sapiens harari" returns nine of these against one real edition,
 * so they are recognised on three signals: the title, the category, and the
 * author — the summary mills publish under names like "Book Summary",
 * "Readtrepreneur Publishing" and "Hyper Summary".
 */
const JUNK_TITLE =
  /\b(summar\w*|study guide|studyguide|analysis|workbook|conversation starters|key takeaways|sparknotes|cliffsnotes|quicklet|book review|review of|trivia[- ]on[- ]books)\b/i;

const JUNK_AUTHOR =
  /\b(summar\w*|editorial|publishing|publications|library|insights?|\d+minutes?|instaread|blinkist|joosr|quicklet)\b/i;

const JUNK_CATEGORIES = new Set(["Study Aids", "Adaptations"]);

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word === "&" ? "&" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * Picks one genre from Google's list.
 *
 * Takes the broadest segment of the first category ("Biography &
 * Autobiography / Personal Memoirs" → "Biography & Autobiography"), then
 * normalizes case so one genre cannot draw as two bars in the chart.
 */
export function normalizeGenre(categories?: string[]): string {
  const raw = categories?.find((c) => c && c.trim());
  if (!raw) return "Unfiled";

  const broadest = raw.split("/")[0].trim().replace(/\s+/g, " ");
  const cased = titleCase(broadest);
  return GENRE_ALIASES[cased.toLowerCase()] ?? cased;
}

function isbn13Of(volume: GoogleVolume): string | undefined {
  return volume.volumeInfo?.industryIdentifiers?.find((i) => i.type === "ISBN_13")
    ?.identifier;
}

/** Mojibake that Google itself serves — UTF-8 punctuation decoded as latin-1. */
const MOJIBAKE: [RegExp, string][] = [
  [/â€"|â€“|âe"|âe“/g, "—"],
  [/â€˜|â€™|âe™|âe˜/g, "’"],
  [/â€œ|â€|âe œ/g, "“"],
  [/â€¦/g, "…"],
  [/Â/g, ""],
];

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "’",
  "&apos;": "’",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

/** How much blurb a search result card can carry without dominating the list. */
export const BLURB_LIMIT = 180;

/**
 * Turns a Google description into one scannable line.
 *
 * Descriptions run to several hundred words and arrive with HTML markup,
 * escaped entities and occasional mojibake. Left raw, a single result fills
 * the screen — and because shelf entries snapshot the book, it would all be
 * written to localStorage too. Trimmed at a word boundary.
 */
export function cleanBlurb(raw?: string): string | undefined {
  if (!raw) return undefined;

  let text = raw.replace(/<[^>]*>/g, " ");
  for (const [pattern, replacement] of Object.entries(ENTITIES)) {
    text = text.split(pattern).join(replacement);
  }
  for (const [pattern, replacement] of MOJIBAKE) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\s+/g, " ")
    // Removing a tag mid-sentence ("house</b>.") would otherwise strand a
    // space in front of the punctuation.
    .replace(/\s+([.,;:!?…])/g, "$1")
    .trim();
  if (!text) return undefined;
  if (text.length <= BLURB_LIMIT) return text;

  const cut = text.slice(0, BLURB_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : BLURB_LIMIT).trimEnd()}…`;
}

/**
 * Maps one volume, or returns null if it is not a book at all.
 *
 * `pageCount` may come back as 0 here. The search endpoint carries thinner
 * metadata than the per-volume endpoint — David Keenan's "Boyhood" reports 0
 * pages in a search and 342 when fetched by id — so a missing count is not
 * yet grounds to discard the book. `hydratePageCounts` fills the gaps and
 * `isTrackable` makes the final call.
 */
export function mapVolume(volume: GoogleVolume): CatalogBook | null {
  const info = volume.volumeInfo;
  if (!volume.id || !info?.title) return null;

  const year = Number((info.publishedDate ?? "").slice(0, 4));

  return {
    id: volume.id,
    isbn13: isbn13Of(volume),
    title: info.title.trim(),
    author: info.authors?.[0]?.trim() || "Unknown author",
    pageCount: info.pageCount && info.pageCount > 0 ? info.pageCount : 0,
    genre: normalizeGenre(info.categories),
    year: Number.isFinite(year) && year > 0 ? year : undefined,
    blurb: cleanBlurb(info.description),
    // Google serves http:// thumbnails; upgrade so they are not blocked.
    thumbnailUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:"),
  };
}

/** Identity for deduplication: same work, whatever the edition. */
function editionKey(book: CatalogBook): string {
  const title = book.title
    // Edition markers that differ between printings of one book:
    // "(Movie Tie-In)", "[Illustrated]", and anything after a subtitle colon.
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .split(":")[0]
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const author = book.author.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${title}|${author}`;
}

/** How complete a record is, used to pick between editions of one work. */
function completeness(book: CatalogBook): number {
  return (
    // Weighted highest: an edition that already states its length needs no
    // extra request, and is the only kind that can actually be tracked.
    (book.pageCount > 0 ? 4 : 0) +
    (book.genre !== "Unfiled" ? 2 : 0) +
    (book.thumbnailUrl ? 2 : 0) +
    (book.blurb ? 1 : 0) +
    (book.isbn13 ? 1 : 0) +
    (book.year ? 1 : 0)
  );
}

/** Only a book with a known length can drive the progress UI. */
export function isTrackable(book: CatalogBook): boolean {
  return book.pageCount > 0;
}

function isJunk(book: CatalogBook): boolean {
  return (
    JUNK_TITLE.test(book.title) ||
    JUNK_AUTHOR.test(book.author) ||
    JUNK_CATEGORIES.has(book.genre)
  );
}

/**
 * Collapses editions of the same work, keeping the best-described one.
 *
 * Google returns the same book many times over — "Sapiens" came back nine
 * times in one query, with page counts differing between editions. Order is
 * otherwise preserved, since Google's own relevance ranking is good.
 */
export function dedupeEditions(books: CatalogBook[]): CatalogBook[] {
  const best = new Map<string, CatalogBook>();

  for (const book of books) {
    const key = editionKey(book);
    const held = best.get(key);
    if (!held || completeness(book) > completeness(held)) {
      best.set(key, book);
    }
  }
  return [...best.values()];
}

/** Sinks study guides and summaries below the real editions. */
export function demoteJunk(books: CatalogBook[]): CatalogBook[] {
  const real = books.filter((b) => !isJunk(b));
  const junk = books.filter(isJunk);
  return [...real, ...junk];
}

/**
 * The pure half of the pipeline: map, collapse editions, rank.
 *
 * Results may still carry `pageCount: 0` — those are candidates for
 * hydration, not yet rejects.
 */
export function toCatalogBooks(volumes: GoogleVolume[]): CatalogBook[] {
  const mapped = volumes
    .map(mapVolume)
    .filter((b): b is CatalogBook => b !== null);
  return demoteJunk(dedupeEditions(mapped));
}

/**
 * How many volumes a single search may look up individually.
 *
 * Each one is a separate request against a small daily quota, so this is
 * deliberately tight. Junk is never hydrated — no quota is spent confirming
 * the length of a study guide — and responses are cached for an hour, so a
 * repeated search costs nothing.
 */
export const HYDRATE_LIMIT = 8;

/** Fetches one volume's full record, or null if it cannot be read. */
async function fetchVolume(
  id: string,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<GoogleVolume | null> {
  try {
    const url = new URL(`${GOOGLE_BOOKS_ENDPOINT}/${encodeURIComponent(id)}`);
    url.searchParams.set("key", apiKey);
    const response = await fetchImpl(url.toString(), {
      next: { revalidate: 86_400 },
    } as RequestInit);
    return response.ok ? ((await response.json()) as GoogleVolume) : null;
  } catch {
    // One book failing to hydrate must not fail the whole search.
    return null;
  }
}

/**
 * Fills in page counts the search endpoint omitted.
 *
 * Without this the app silently hides real books — the bug that surfaced it
 * was a reader finding a title on books.google.com that never appeared in
 * search. Bounded by `HYDRATE_LIMIT` and run in parallel.
 */
export async function hydratePageCounts(
  books: CatalogBook[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  limit = HYDRATE_LIMIT
): Promise<CatalogBook[]> {
  const wanted = books
    .filter((book) => !isTrackable(book))
    .slice(0, limit)
    .map((book) => book.id);

  if (wanted.length === 0) return books;

  const found = new Map<string, number>();
  await Promise.all(
    wanted.map(async (id) => {
      const volume = await fetchVolume(id, apiKey, fetchImpl);
      const pages = volume?.volumeInfo?.pageCount;
      if (pages && pages > 0) found.set(id, pages);
    })
  );

  return books.map((book) =>
    found.has(book.id) ? { ...book, pageCount: found.get(book.id)! } : book
  );
}

export class GoogleBooksError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GoogleBooksError";
  }
}

/**
 * Searches Google Books. Server-side only — the key must never reach the
 * browser, so this is called from the route handler, not from a component.
 */
export async function searchGoogleBooks(
  query: string,
  apiKey: string,
  options: { maxResults?: number; fetchImpl?: typeof fetch } = {}
): Promise<CatalogBook[]> {
  const { maxResults = 24, fetchImpl = fetch } = options;

  const url = new URL(GOOGLE_BOOKS_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(maxResults, 40)));
  url.searchParams.set("printType", "books");
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url.toString(), {
    // The catalogue barely moves and the daily quota is small, so identical
    // searches are served from the cache for an hour.
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!response.ok) {
    // Never let the upstream message through — it echoes the key back.
    const reason =
      response.status === 429
        ? "Google Books daily quota exhausted"
        : `Google Books returned ${response.status}`;
    throw new GoogleBooksError(reason, response.status);
  }

  const body = (await response.json()) as { items?: GoogleVolume[] };

  const candidates = toCatalogBooks(body.items ?? []);
  const hydrated = await hydratePageCounts(candidates, apiKey, fetchImpl);

  // Anything still without a length cannot drive the progress UI, so it is
  // held back rather than shown as an untrackable book.
  return hydrated.filter(isTrackable);
}
