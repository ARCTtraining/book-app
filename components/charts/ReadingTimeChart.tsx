"use client";

import { useState } from "react";
import type { InsightsSummary } from "@/lib/types";
import { ChartFrame } from "./ChartFrame";
import { cx } from "../ui";

type Bucket = InsightsSummary["readingTimes"]["buckets"][number];
type Cover = Bucket["covers"][number];

/**
 * How long books take to finish.
 *
 * A pictorial bar chart: each band's bar is built from the covers of the
 * books in it, so the length still encodes the count but every unit is a
 * particular book you can recognise. Abstract bars answered "how many";
 * these answer "which".
 *
 * Rows rather than columns, because a stack of ten covers is far taller than
 * a phone and a row of ten at this size is not. Hand-drawn rather than fed
 * through the charting library — once the mark is an image, the library is
 * only in the way.
 */
export function ReadingTimeChart({
  data,
}: {
  data: InsightsSummary["readingTimes"];
}) {
  const [selected, setSelected] = useState<Cover | null>(null);

  if (data.counted === 0) {
    return (
      <ChartFrame
        title="How long books take"
        note="Finish a book with a start date recorded and it appears here."
        height={0}
      >
        <div />
      </ChartFrame>
    );
  }

  const busiest = Math.max(...data.buckets.map((b) => b.books));

  return (
    <section className="rounded-card border border-rule bg-paper-dark/60 px-3 pt-3 pb-2.5">
      <h2 className="label-caps font-sans text-ink">How long books take</h2>
      <p className="mt-1 text-[12px] text-charcoal/60">
        {data.counted} {data.counted === 1 ? "book" : "books"} · half finished
        within {data.median} {data.median === 1 ? "day" : "days"}
      </p>

      <ul className="mt-3 space-y-1">
        {data.buckets.map((bucket) => (
          <li key={bucket.label} className="flex items-center gap-2">
            <span
              className={cx(
                "label-caps tnum w-11 shrink-0 text-right",
                bucket.books === busiest ? "text-ink" : "text-charcoal/50"
              )}
            >
              {bucket.label}
            </span>

            {/* The bar itself. A hairline baseline keeps an empty band
                visible, so the gaps in the distribution still read. */}
            <span className="flex min-h-[34px] flex-1 flex-wrap items-center gap-[3px] border-l border-rule pl-1.5">
              {bucket.covers.length === 0 ? (
                <span aria-hidden="true" className="h-px w-3 bg-rule" />
              ) : (
                bucket.covers.map((cover) => (
                  <button
                    key={cover.id}
                    type="button"
                    onClick={() =>
                      setSelected((current) =>
                        current?.id === cover.id ? null : cover
                      )
                    }
                    aria-label={`${cover.title} by ${cover.author}, ${cover.days} ${cover.days === 1 ? "day" : "days"}`}
                    className={cx(
                      "block w-[22px] shrink-0 rounded-[2px] transition-opacity",
                      selected && selected.id !== cover.id && "opacity-40"
                    )}
                  >
                    <MiniCover cover={cover} />
                  </button>
                ))
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Reserved whether or not anything is selected, so tapping a cover
          does not shift the rows underneath it. */}
      <p className="mt-2 min-h-[30px] border-t border-rule pt-2 text-[12px] leading-snug">
        {selected ? (
          <>
            <span className="text-ink">{selected.title}</span>
            <span className="text-charcoal/55">
              {" "}
              · {selected.author} · {selected.days}{" "}
              {selected.days === 1 ? "day" : "days"}
            </span>
          </>
        ) : (
          <span className="text-charcoal/45">Tap a cover to see which book.</span>
        )}
      </p>
    </section>
  );
}

/**
 * A cover at bar-unit size.
 *
 * At 22px a jacket is a colour and a shape rather than a readable design,
 * which is enough to tell one book from its neighbours; the title is a tap
 * away. Books with no cover get their initial, so a gap never reads as a
 * missing book.
 */
function MiniCover({ cover }: { cover: Cover }) {
  const url = cover.thumbnailUrl?.replace(/&edge=curl/g, "");

  if (!url) {
    return (
      <span className="flex aspect-[2/3] w-full items-center justify-center rounded-[2px] border border-rule bg-paper text-[9px] text-charcoal/60">
        {cover.title.slice(0, 1)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      className="aspect-[2/3] w-full rounded-[2px] border border-rule object-cover"
    />
  );
}
