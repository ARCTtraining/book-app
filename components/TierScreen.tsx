"use client";

import { useRef, useState } from "react";
import type { ShelfEntry, Tier } from "@/lib/types";
import { buildTierBoard, TIER_COLORS, TIER_LABELS, TIERS } from "@/lib/tiers";
import { useLibrary } from "./LibraryProvider";
import { EmptyState, LoadingRules, PageTitle, SectionHeading, cx } from "./ui";

/**
 * Tier list.
 *
 * Drag is hand-rolled on pointer events rather than pulled from a library:
 * the drop targets here are seven full-width rows, which is the forgiving
 * case, and a drag library's real value is sortable lists with small targets
 * between items. Tapping a book opens the same assignment by menu, so the
 * page works by keyboard and screen reader, and on any device where a drag
 * goes wrong.
 */
export function TierScreen() {
  const { state, ready, setTier } = useLibrary();
  const board = buildTierBoard(state);

  const [drag, setDrag] = useState<{
    entry: ShelfEntry;
    x: number;
    y: number;
  } | null>(null);
  const [over, setOver] = useState<Tier | "unranked" | null>(null);
  const [picking, setPicking] = useState<ShelfEntry | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  /** Which drop zone sits under the pointer, if any. */
  const zoneAt = (x: number, y: number): Tier | "unranked" | null => {
    const el = document
      .elementsFromPoint(x, y)
      .find((node) => node instanceof HTMLElement && node.dataset.zone);
    const zone = (el as HTMLElement | undefined)?.dataset.zone;
    if (!zone) return null;
    return zone === "unranked" ? "unranked" : (zone as Tier);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    origin.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (entry: ShelfEntry) => (e: React.PointerEvent) => {
    if (!origin.current) return;
    const moved =
      Math.abs(e.clientX - origin.current.x) + Math.abs(e.clientY - origin.current.y);
    // A few pixels of slop, so a tap is never mistaken for a drag.
    if (!drag && moved < 8) return;

    setDrag({ entry, x: e.clientX, y: e.clientY });
    setOver(zoneAt(e.clientX, e.clientY));
  };

  const onPointerUp = (entry: ShelfEntry) => (e: React.PointerEvent) => {
    const wasDragging = drag !== null;
    const zone = wasDragging ? zoneAt(e.clientX, e.clientY) : null;

    origin.current = null;
    setDrag(null);
    setOver(null);

    if (!wasDragging) {
      setPicking(entry);
      return;
    }
    if (zone === "unranked") setTier(entry.id, null);
    else if (zone) setTier(entry.id, zone);
  };

  if (!ready) {
    return (
      <>
        <PageTitle title="Tiers" caption="Loading your shelf…" />
        <div className="px-4 py-4">
          <LoadingRules rows={3} />
        </div>
      </>
    );
  }

  if (board.total === 0) {
    return (
      <>
        <PageTitle title="Tiers" caption="Rank the books you have finished" />
        <div className="px-4 py-4">
          <EmptyState
            title="Nothing to rank yet"
            body="Finish a book and it appears here, waiting to be placed in a tier."
          />
        </div>
      </>
    );
  }

  const tile = (entry: ShelfEntry) => (
    <BookTile
      key={entry.id}
      entry={entry}
      dragging={drag?.entry.id === entry.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove(entry)}
      onPointerUp={onPointerUp(entry)}
    />
  );

  return (
    <>
      <PageTitle
        title="Tiers"
        caption={`${board.placed} of ${board.total} books placed`}
      />

      <div className="space-y-6 px-4 py-4">
        <div className="overflow-hidden rounded-card border border-rule">
          {board.rows.map(({ tier, entries }) => (
            <div key={tier} className="flex border-b border-rule last:border-b-0">
              <div
                className="flex w-14 shrink-0 flex-col items-center justify-center px-1 py-2 text-center"
                style={{ backgroundColor: TIER_COLORS[tier] }}
              >
                <span className="font-serif text-[22px] leading-none text-paper">
                  {tier}
                </span>
                <span className="label-caps mt-1 text-[7px] leading-tight text-paper/75">
                  {TIER_LABELS[tier]}
                </span>
              </div>

              <div
                data-zone={tier}
                className={cx(
                  "flex min-h-[68px] flex-1 flex-wrap content-start gap-1.5 p-1.5 transition-colors",
                  over === tier ? "bg-marigold/20" : "bg-paper-dark/50"
                )}
              >
                {entries.map(tile)}
              </div>
            </div>
          ))}
        </div>

        <section>
          <SectionHeading count={board.unranked.length}>Not yet placed</SectionHeading>
          <div
            data-zone="unranked"
            className={cx(
              "flex min-h-[76px] flex-wrap content-start gap-1.5 rounded-card border border-dashed border-rule p-2 transition-colors",
              over === "unranked" ? "bg-marigold/20" : "bg-paper-dark/40"
            )}
          >
            {board.unranked.length > 0 ? (
              board.unranked.map(tile)
            ) : (
              <p className="px-1 py-4 text-center text-[13px] text-charcoal/55">
                Every finished book has a tier.
              </p>
            )}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-charcoal/55">
            Drag a book into a row, or tap it to choose a tier.
          </p>
        </section>

        <TierTable board={board} />
      </div>

      {/* The dragged book, following the finger. */}
      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-90"
          style={{ left: drag.x, top: drag.y }}
        >
          <TileCover entry={drag.entry} className="w-11 ring-2 ring-marigold" />
        </div>
      )}

      {picking && (
        <TierPicker
          entry={picking}
          onPick={(tier) => {
            setTier(picking.id, tier);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

/** A book as a cover tile: draggable, and tappable as the accessible path. */
function BookTile({
  entry,
  dragging,
  ...handlers
}: {
  entry: ShelfEntry;
  dragging: boolean;
} & Pick<
  React.HTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp"
>) {
  return (
    <button
      type="button"
      // Without this the page scrolls instead of the book moving.
      style={{ touchAction: "none" }}
      className={cx(
        "block w-11 shrink-0 rounded-[3px] transition-opacity",
        dragging && "opacity-30"
      )}
      aria-label={`${entry.book.title} by ${entry.book.author}${
        entry.tier ? `, tier ${entry.tier}` : ", no tier"
      }. Activate to choose a tier.`}
      {...handlers}
    >
      <TileCover entry={entry} />
    </button>
  );
}

/**
 * A cover sized to the tile grid.
 *
 * Distinct from the shared `Cover`, which is a fixed size for list rows. This
 * one fills its tile and falls back to the title in small type — a tier board
 * of blank rectangles would be unusable, and books added from the bundled
 * catalogue have no cover at all.
 */
function TileCover({ entry, className }: { entry: ShelfEntry; className?: string }) {
  const url = entry.book.thumbnailUrl?.replace("&edge=curl", "");

  if (!url) {
    // Books added from the bundled catalogue have no cover.
    return (
      <span
        className={cx(
          "flex aspect-[2/3] w-full items-center justify-center overflow-hidden",
          "rounded-[3px] border border-rule bg-paper px-0.5 text-center",
          className
        )}
      >
        <span className="line-clamp-3 text-[7px] leading-tight text-charcoal/70">
          {entry.book.title}
        </span>
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
      className={cx(
        "aspect-[2/3] w-full rounded-[3px] border border-rule object-cover",
        className
      )}
    />
  );
}

/** Tap-to-assign: the path that works without a working drag. */
function TierPicker({
  entry,
  onPick,
  onClose,
}: {
  entry: ShelfEntry;
  onPick: (tier: Tier | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 pb-safe"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Choose a tier for ${entry.book.title}`}
        className="m-3 w-full max-w-md rounded-card border border-rule bg-paper p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-[16px] leading-snug text-ink">
          {entry.book.title}
        </h2>
        <p className="mt-0.5 text-[13px] text-charcoal/70">{entry.book.author}</p>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => onPick(tier)}
              className={cx(
                "flex flex-col items-center justify-center rounded-card py-2",
                entry.tier === tier && "ring-2 ring-ink"
              )}
              style={{ backgroundColor: TIER_COLORS[tier] }}
            >
              <span className="font-serif text-[18px] leading-none text-paper">
                {tier}
              </span>
              <span className="label-caps mt-1 text-[7px] text-paper/75">
                {TIER_LABELS[tier]}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPick(null)}
            className="label-caps rounded-card border border-rule bg-paper-dark px-1 py-2 text-charcoal/70"
          >
            None
          </button>
        </div>
      </div>
    </div>
  );
}

/** The ranking, read as a list rather than a board. */
function TierTable({ board }: { board: ReturnType<typeof buildTierBoard> }) {
  const filled = board.rows.filter((row) => row.entries.length > 0);
  if (filled.length === 0) return null;

  return (
    <section>
      <SectionHeading>The ranking</SectionHeading>
      <ol className="divide-y divide-rule rounded-card border border-rule bg-paper">
        {filled.map(({ tier, entries }) => (
          <li key={tier} className="flex gap-3 px-3 py-2.5">
            <span
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[3px] font-serif text-[13px] leading-none text-paper"
              style={{ backgroundColor: TIER_COLORS[tier] }}
            >
              {tier}
            </span>
            <ul className="min-w-0 flex-1 space-y-1">
              {entries.map((entry) => (
                <li key={entry.id} className="text-[13px] leading-snug">
                  <span className="text-ink">{entry.book.title}</span>
                  <span className="text-charcoal/55"> · {entry.book.author}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
