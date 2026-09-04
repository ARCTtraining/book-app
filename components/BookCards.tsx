"use client";

import { useState } from "react";
import type { CatalogBook, ShelfEntry, ShelfStatus } from "@/lib/types";
import { spineColor } from "@/lib/catalog";
import { progressPercent, progressRatio } from "@/lib/library";
import { formatDayRange } from "@/lib/dates";
import { useLibrary } from "./LibraryProvider";
import {
  Button,
  DateStamp,
  IndexCard,
  MetaLine,
  ProgressBar,
  cx,
} from "./ui";

/** Title + author block shared by every card. */
function BookHeading({
  book,
  size = "base",
}: {
  book: CatalogBook;
  size?: "base" | "sm";
}) {
  return (
    <div className="min-w-0">
      <h3
        className={cx(
          "font-serif leading-snug text-ink",
          size === "sm" ? "text-[15px]" : "text-[17px]"
        )}
      >
        {book.title}
      </h3>
      <p className="mt-0.5 truncate text-[13px] text-charcoal/70">{book.author}</p>
    </div>
  );
}

const STATUS_NOTE: Record<ShelfStatus, string> = {
  want: "On your list",
  reading: "In progress",
  finished: "Finished",
};

/* -------------------------------------------------------------------------- */

/** A catalog hit on the Search screen. */
export function SearchResultCard({ book }: { book: CatalogBook }) {
  const { addToShelf, shelfStatusOf, ready } = useLibrary();
  const status = shelfStatusOf(book.id);

  return (
    <IndexCard spine={spineColor(book.genre)}>
      <BookHeading book={book} />
      <MetaLine items={[`${book.pageCount} pp`, book.genre, book.year?.toString()]} />

      {book.blurb && (
        // Clamped as well as trimmed: catalogue blurbs vary wildly in length
        // and a result card must stay scannable in a list.
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-charcoal/70">
          {book.blurb}
        </p>
      )}

      {/* Held back until the shelf is known, so a book already on it never
          flashes "Want to read" first. */}
      {!ready ? (
        <div aria-hidden="true" className="mt-3 h-9" />
      ) : status ? (
        <p className="label-caps mt-3 flex items-center gap-1.5 text-teal">
          <CheckIcon />
          {STATUS_NOTE[status]}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => addToShelf(book, "want")}>Want to read</Button>
          <Button variant="primary" onClick={() => addToShelf(book, "reading")}>
            Start reading
          </Button>
        </div>
      )}
    </IndexCard>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A book in progress: bookmark slider, progress bar, and the two actions that
 * matter daily — log pages, mark finished.
 */
export function CurrentlyReadingCard({ entry }: { entry: ShelfEntry }) {
  const { updateProgress, markFinished } = useLibrary();

  // The slider is a draft until the drag ends, so a single gesture logs one
  // net advance rather than one per pointer move. When the committed page
  // changes — by the quick-add buttons, or by another card — the draft is
  // rebased during render rather than in an effect, so there is no frame
  // where the slider and the progress bar disagree.
  const [draft, setDraft] = useState(entry.currentPage);
  const [committed, setCommitted] = useState(entry.currentPage);
  if (committed !== entry.currentPage) {
    setCommitted(entry.currentPage);
    setDraft(entry.currentPage);
  }

  const commit = () => {
    if (draft !== entry.currentPage) updateProgress(entry.id, draft);
  };

  const pagesLeft = entry.book.pageCount - draft;

  return (
    <IndexCard spine={spineColor(entry.book.genre)} tone="alt">
      <div className="flex items-start justify-between gap-3">
        <BookHeading book={entry.book} />
        <span className="tnum label-caps shrink-0 pt-0.5 text-charcoal/55">
          {progressPercent({ ...entry, currentPage: draft })}%
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar
          ratio={progressRatio({ ...entry, currentPage: draft })}
          label={`Progress through ${entry.book.title}`}
        />
        <div className="tnum mt-1.5 flex items-baseline justify-between text-[12px] text-charcoal/60">
          <span>
            <span className="font-medium text-ink">{draft}</span> of{" "}
            {entry.book.pageCount} pp
          </span>
          <span>{pagesLeft > 0 ? `${pagesLeft} to go` : "Last page"}</span>
        </div>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Bookmark page for {entry.book.title}</span>
        <input
          type="range"
          min={0}
          max={entry.book.pageCount}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </label>

      <div className="mt-1 flex flex-wrap gap-2">
        <Button onClick={() => updateProgress(entry.id, entry.currentPage + 10)}>
          +10 pp
        </Button>
        <Button onClick={() => updateProgress(entry.id, entry.currentPage + 25)}>
          +25 pp
        </Button>
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => markFinished(entry.id)}
        >
          Mark finished
        </Button>
      </div>
    </IndexCard>
  );
}

/* -------------------------------------------------------------------------- */

export function WantToReadCard({ entry }: { entry: ShelfEntry }) {
  const { startReading, removeEntry } = useLibrary();

  return (
    <IndexCard spine={spineColor(entry.book.genre)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BookHeading book={entry.book} size="sm" />
          <MetaLine items={[`${entry.book.pageCount} pp`, entry.book.genre]} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button variant="primary" onClick={() => startReading(entry.id)}>
            Start
          </Button>
          <Button
            variant="quiet"
            className="min-h-0 px-1 py-0.5 text-[10px]"
            onClick={() => removeEntry(entry.id)}
          >
            Remove
          </Button>
        </div>
      </div>
    </IndexCard>
  );
}

/* -------------------------------------------------------------------------- */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function FinishedCard({ entry }: { entry: ShelfEntry }) {
  const finished = entry.finishedAt ? new Date(entry.finishedAt) : null;

  return (
    <IndexCard spine={spineColor(entry.book.genre)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BookHeading book={entry.book} size="sm" />
          {/* Genre is left to the spine here — the date range is the point of
              a finished card, and three items wrapped to a second line. */}
          <MetaLine
            items={[
              `${entry.book.pageCount} pp`,
              formatDayRange(
                entry.startedAt?.slice(0, 10),
                entry.finishedAt?.slice(0, 10)
              ),
            ]}
          />
        </div>
        {finished && (
          <DateStamp
            month={MONTHS[finished.getMonth()]}
            year={String(finished.getFullYear())}
          />
        )}
      </div>
    </IndexCard>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}
