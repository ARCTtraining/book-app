"use client";

import { useEffect, useRef, useState } from "react";
import { searchCatalog, type CatalogResults } from "@/lib/catalog";
import { SearchResultCard } from "./BookCards";
import { EmptyState, PageTitle } from "./ui";

/** Said plainly, because the results are not what the reader asked for. */
const FALLBACK_NOTE: Record<NonNullable<CatalogResults["reason"]>, string> = {
  offline: "You are offline — showing the sample catalogue stored on this device.",
  quota: "Google Books has hit its daily limit. Showing the sample catalogue.",
  unconfigured:
    "No Google Books key is configured, so this is the sample catalogue of 12 books.",
  error: "Google Books could not be reached. Showing the sample catalogue.",
};

/**
 * Catalog search.
 *
 * `searchCatalog` is already async, so this component is shaped for a real
 * Google Books call: debounced input, a pending flag, and results keyed by query.
 */
export function SearchScreen() {
  const [query, setQuery] = useState("");
  // Results carry the query they answered, so "still searching" is derived
  // rather than tracked — the two can never disagree.
  const [results, setResults] = useState<(CatalogResults & { query: string }) | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const pending = results === null || results.query !== query;
  const books = results?.books ?? [];

  useEffect(() => {
    let cancelled = false;

    // Debounce: one request per pause in typing, not per keystroke — the
    // Google Books daily quota is small.
    const timer = setTimeout(async () => {
      const found = await searchCatalog(query);
      if (!cancelled) setResults({ query, ...found });
    }, query ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const caption = !query
    ? "Search by title or author — or paste an ISBN or Google Books link"
    : pending
      ? "Searching…"
      : `${books.length} ${books.length === 1 ? "match" : "matches"} for “${query}”`;

  return (
    <>
      <PageTitle title="Search" caption={caption} />

      <div className="px-4 py-4">
        <div className="flex items-center gap-2 rounded-card border border-rule bg-paper-dark px-3 focus-within:border-ink">
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, author, ISBN or a Google Books link"
            aria-label="Search the catalogue"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-charcoal placeholder:text-charcoal/40 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="label-caps -mr-1 px-1.5 py-1 text-charcoal/50"
            >
              Clear
            </button>
          )}
        </div>

        {/* Never let sample results pass as the whole of Google Books. */}
        {!pending && results?.reason && (
          <p className="mt-3 rounded-card border border-marigold/50 bg-paper-dark px-3 py-2 text-[12px] leading-relaxed text-charcoal/75">
            {FALLBACK_NOTE[results.reason]}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {books.map((book) => (
            <SearchResultCard key={book.id} book={book} />
          ))}

          {!query && (
            <EmptyState
              title="What are you reading?"
              body="Search by title or author to add a book to your shelf, or record one you have already finished. Some books are only reachable by ISBN or by pasting their Google Books link."
            />
          )}

          {query && !pending && books.length === 0 && (
            <EmptyState
              title="No matches"
              body={`Nothing matches “${query}”. Try an author's surname, fewer words, or the book's ISBN — small-press and very recent titles are often only findable that way.`}
            />
          )}
        </div>
      </div>
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2A2620"
      strokeOpacity="0.45"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  );
}
