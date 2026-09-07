import type { LibraryState, ShelfEntry, Tier } from "./types";

/**
 * Tier-list bands, best first.
 *
 * The conventional tier-list palette is saturated red-to-cyan on black, which
 * would fight everything else in this app. These are the same warm-to-cool
 * progression drawn from the existing genre spines, so rank still reads off
 * the colour without importing a second design language.
 */
export const TIERS: Tier[] = ["S", "A", "B", "C", "D", "E", "F"];

export const TIER_COLORS: Record<Tier, string> = {
  S: "#B0552A",
  A: "#C98A2B",
  B: "#B29A45",
  C: "#8C9A63",
  D: "#5F8C74",
  E: "#3F6F6B",
  F: "#4A5C6B",
};

/**
 * Shown under each letter, so the bands mean something to someone who does
 * not already know the convention. Kept to one short word — the block is
 * 56px wide and "Unforgettable" rendered as "UNFORGETTABL".
 */
export const TIER_LABELS: Record<Tier, string> = {
  S: "Best",
  A: "Great",
  B: "Good",
  C: "Fine",
  D: "Meh",
  E: "Poor",
  F: "Bad",
};

export interface TierBoard {
  /** One row per tier, in order, with the books placed in it. */
  rows: { tier: Tier; entries: ShelfEntry[] }[];
  /** Finished books not yet placed. */
  unranked: ShelfEntry[];
  placed: number;
  total: number;
}

/**
 * Groups finished books into their bands.
 *
 * Only finished books are rankable — a book you have not read has nothing to
 * rank. Within a band, most recently finished first, so a fresh read lands
 * where you will see it.
 */
export function buildTierBoard(state: LibraryState): TierBoard {
  const finished = state.entries
    .filter((entry) => entry.status === "finished")
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));

  const rows = TIERS.map((tier) => ({
    tier,
    entries: finished.filter((entry) => entry.tier === tier),
  }));

  const unranked = finished.filter(
    (entry) => !entry.tier || !TIERS.includes(entry.tier)
  );

  return {
    rows,
    unranked,
    placed: finished.length - unranked.length,
    total: finished.length,
  };
}
