"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogBook } from "@/lib/types";
import { searchCatalog } from "@/lib/catalog";
import { SearchResultCard } from "./BookCards";
import { EmptyState, PageTitle } from "./ui";

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
  const [results, setResults] = useState<{
    query: string;
    books: CatalogBook[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pending = results === null || results.query !== query;
  const books = results?.books ?? [];

  useEffect(() => {
    let cancelled = false;

    // Debounce: harmless against the mock catalog, necessary against an API.
    const timer = setTimeout(async () => {
      const found = await searchCatalog(query);
      if (!cancelled) setResults({ query, books: found });
    }, query ? 180 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const caption = pending
    ? "Searching…"
    : query
      ? `${books.length} ${books.length === 1 ? "match" : "matches"} for “${query}”`
      : `${books.length} books in the catalogue`;

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
            placeholder="Title, author or genre"
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

        <div className="mt-4 space-y-3">
          {books.map((book) => (
            <SearchResultCard key={book.id} book={book} />
          ))}

          {!pending && books.length === 0 && (
            <EmptyState
              title="No matches"
              body={`Nothing in the catalogue matches “${query}”. Try an author's surname, or a genre like Poetry.`}
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
