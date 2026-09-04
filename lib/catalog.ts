import type { CatalogBook } from "./types";

/**
 * Catalogue search.
 *
 * Live results come from Google Books via `/api/books`, which holds the API
 * key server-side. The sample catalogue below is the fallback: it keeps the
 * prototype demonstrable with no key, no network, or an exhausted quota, and
 * it is what the app shows when installed and offline.
 *
 * Callers get told which source answered, so the UI can say so rather than
 * quietly presenting twelve books as the whole of Google Books.
 */

export const SAMPLE_CATALOG: CatalogBook[] = [
  {
    id: "9780571334650",
    isbn13: "9780571334650",
    title: "Piranesi",
    author: "Susanna Clarke",
    pageCount: 245,
    genre: "Literary Fiction",
    year: 2020,
    blurb: "A man, an endless house, and the tide coming through the halls.",
  },
  {
    id: "9780316556347",
    isbn13: "9780316556347",
    title: "Project Hail Mary",
    author: "Andy Weir",
    pageCount: 476,
    genre: "Science Fiction",
    year: 2021,
    blurb: "A lone astronaut, an unlikely friendship, a dying sun.",
  },
  {
    id: "9780374533557",
    isbn13: "9780374533557",
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    pageCount: 499,
    genre: "Science",
    year: 2011,
    blurb: "Two systems of thought and the errors they make.",
  },
  {
    id: "9781984801258",
    isbn13: "9781984801258",
    title: "The Overstory",
    author: "Richard Powers",
    pageCount: 502,
    genre: "Literary Fiction",
    year: 2018,
    blurb: "Nine strangers, drawn together by the trees.",
  },
  {
    id: "9780307476463",
    isbn13: "9780307476463",
    title: "The Girl with the Dragon Tattoo",
    author: "Stieg Larsson",
    pageCount: 465,
    genre: "Mystery",
    year: 2005,
    blurb: "A cold case, a disgraced journalist, a hacker with a ledger.",
  },
  {
    id: "9780062316097",
    isbn13: "9780062316097",
    title: "Sapiens",
    author: "Yuval Noah Harari",
    pageCount: 443,
    genre: "History",
    year: 2011,
    blurb: "A brief history of how one species took over.",
  },
  {
    id: "9780345806033",
    isbn13: "9780345806033",
    title: "The Emperor of All Maladies",
    author: "Siddhartha Mukherjee",
    pageCount: 592,
    genre: "Science",
    year: 2010,
    blurb: "A biography of cancer and the people who fought it.",
  },
  {
    id: "9780679745587",
    isbn13: "9780679745587",
    title: "The White Album",
    author: "Joan Didion",
    pageCount: 224,
    genre: "Essays",
    year: 1979,
    blurb: "California in the late sixties, reported at close range.",
  },
  {
    id: "9780241983089",
    isbn13: "9780241983089",
    title: "Educated",
    author: "Tara Westover",
    pageCount: 352,
    genre: "Biography",
    year: 2018,
    blurb: "A childhood off the grid and an education won late.",
  },
  {
    id: "9780571364954",
    isbn13: "9780571364954",
    title: "Devotions",
    author: "Mary Oliver",
    pageCount: 455,
    genre: "Poetry",
    year: 2017,
    blurb: "Fifty years of looking closely at the world.",
  },
  {
    id: "9780593135204",
    isbn13: "9780593135204",
    title: "Klara and the Sun",
    author: "Kazuo Ishiguro",
    pageCount: 303,
    genre: "Science Fiction",
    year: 2021,
    blurb: "An artificial friend watches, waits, and learns to hope.",
  },
  {
    id: "9781400033416",
    isbn13: "9781400033416",
    title: "The Long Ships",
    author: "Frans G. Bengtsson",
    pageCount: 503,
    genre: "Fiction",
    year: 1945,
    blurb: "A Viking's life, told with an entirely straight face.",
  },
];

/** Case- and diacritic-insensitive normalization for the filter. */
function normalize(value: string): string {
  // Decompose, then drop combining marks, so "Bronte" matches "Brontë" once
  // real catalog data arrives.
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** Filters the bundled sample catalogue by title, author, genre or year. */
export function filterSampleCatalog(query: string): CatalogBook[] {
  const q = normalize(query);
  if (!q) return SAMPLE_CATALOG;

  const terms = q.split(/\s+/);
  return SAMPLE_CATALOG.filter((book) => {
    const haystack = normalize(
      `${book.title} ${book.author} ${book.genre} ${book.year ?? ""}`
    );
    return terms.every((term) => haystack.includes(term));
  });
}

/** Which catalogue answered a search. */
export type CatalogSource = "google" | "sample";

export interface CatalogResults {
  books: CatalogBook[];
  source: CatalogSource;
  /** Why the fallback was used, when it was. */
  reason?: "offline" | "quota" | "unconfigured" | "error";
}

/**
 * Searches the live catalogue, falling back to the sample one.
 *
 * A failed lookup is never surfaced as an error: an empty query, a missing
 * key, an exhausted quota or no network all quietly return sample results
 * with the reason attached, so Search always shows something usable.
 */
export async function searchCatalog(query: string): Promise<CatalogResults> {
  // No query, no results. Listing the sample catalogue here presented twelve
  // books the reader does not own as though they were their shelf.
  if (!query.trim()) {
    return { books: [], source: "sample" };
  }

  try {
    const response = await fetch(`/api/books?q=${encodeURIComponent(query)}`);

    if (!response.ok) {
      const reason =
        response.status === 503
          ? "unconfigured"
          : response.status === 429
            ? "quota"
            : "error";
      return { books: filterSampleCatalog(query), source: "sample", reason };
    }

    const body = (await response.json()) as { books?: CatalogBook[] };
    return { books: body.books ?? [], source: "google" };
  } catch {
    // Offline, or the route is unreachable. The installed app lands here.
    return { books: filterSampleCatalog(query), source: "sample", reason: "offline" };
  }
}

export async function getCatalogBook(id: string): Promise<CatalogBook | null> {
  return SAMPLE_CATALOG.find((book) => book.id === id) ?? null;
}

/**
 * Genre-to-spine-colour map. The spine strip on the left edge of every card
 * is the one place colour carries meaning, so it stays consistent across
 * Search, Shelf and Insights.
 */
export const GENRE_COLORS: Record<string, string> = {
  Fiction: "#3F6F6B",
  "Literary Fiction": "#1B2A41",
  "Science Fiction": "#C98A2B",
  Mystery: "#6B3F4A",
  History: "#7A6A3F",
  Biography: "#4A5C6B",
  Science: "#2F5D50",
  Essays: "#8A5A2B",
  Poetry: "#5A4A6B",
};

/** Fallback spines for categories the map has never seen. */
const SPINE_FALLBACKS = ["#3F6F6B", "#6B3F4A", "#7A6A3F", "#4A5C6B", "#5A4A6B"];

/**
 * Every genre gets a spine colour, including the uncontrolled category
 * strings Google Books returns. Unknown genres hash to a fixed fallback, so
 * the same category always draws the same colour across screens and sessions
 * — colour follows the entity, never its position in a list.
 */
export function spineColor(genre: string): string {
  const known = GENRE_COLORS[genre];
  if (known) return known;

  let hash = 0;
  for (let i = 0; i < genre.length; i++) {
    hash = (hash * 31 + genre.charCodeAt(i)) | 0;
  }
  return SPINE_FALLBACKS[Math.abs(hash) % SPINE_FALLBACKS.length];
}
