"use client";

import { useState } from "react";
import type { CatalogBook } from "@/lib/types";
import { customBook, spineColor, validateCustomBook, type CustomBookFields } from "@/lib/catalog";
import { SearchResultCard } from "./BookCards";
import { Button, IndexCard, cx } from "./ui";

/**
 * Add a book by hand, for one Google Books cannot find or cannot be reached
 * for.
 *
 * Once the fields are filled in, the book is shown as an ordinary search
 * result, so it goes onto the shelf through the same three actions — want to
 * read, start reading, already read — as any catalogue book.
 */
export function CustomBookForm({ initialTitle }: { initialTitle: string }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<CustomBookFields>({
    title: "",
    author: "",
    pageCount: "",
    genre: "",
    year: "",
  });
  const [book, setBook] = useState<CatalogBook | null>(null);
  // Only complain after a first attempt, not while the reader is still typing.
  const [tried, setTried] = useState(false);

  const error = validateCustomBook(fields);
  const set = (key: keyof CustomBookFields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  if (book) {
    return (
      <div className="space-y-2">
        <SearchResultCard book={book} />
        <div className="flex justify-end">
          <Button variant="quiet" onClick={() => setBook(null)}>
            Edit details
          </Button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-dashed border-rule px-3.5 py-3">
        <p className="text-[13px] text-charcoal/70">Can’t find it?</p>
        <Button
          onClick={() => {
            // Whatever was searched for is usually the title.
            setFields((current) =>
              current.title ? current : { ...current, title: initialTitle.trim() }
            );
            setOpen(true);
          }}
        >
          Add it yourself
        </Button>
      </div>
    );
  }

  return (
    <IndexCard spine={spineColor(fields.genre.trim() || "Unfiled")}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!error) setBook(customBook(fields));
        }}
      >
        <h3 className="font-serif text-[17px] leading-snug text-ink">Add a book yourself</h3>

        <div className="mt-2 space-y-2">
          <Field label="Title" value={fields.title} onChange={set("title")} autoFocus />
          <Field label="Author" value={fields.author} onChange={set("author")} />
          <div className="flex flex-wrap gap-2">
            <Field
              label="Pages"
              value={fields.pageCount}
              onChange={set("pageCount")}
              inputMode="numeric"
              className="min-w-[6rem] flex-1"
            />
            <Field
              label="Year (optional)"
              value={fields.year}
              onChange={set("year")}
              inputMode="numeric"
              className="min-w-[6rem] flex-1"
            />
          </div>
          <Field label="Genre (optional)" value={fields.genre} onChange={set("genre")} />
        </div>

        {tried && error && (
          <p role="alert" className="mt-2 text-[12px] leading-snug text-[#8A3A2B]">
            {error}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            Continue
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setOpen(false);
              setTried(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </IndexCard>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  autoFocus,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "numeric";
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="label-caps block text-charcoal/55">{label}</span>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "mt-1 w-full rounded-card border border-rule bg-paper px-2 py-1.5",
          "text-[13px] text-ink focus:border-ink focus:outline-none",
          inputMode === "numeric" && "tnum"
        )}
      />
    </label>
  );
}
