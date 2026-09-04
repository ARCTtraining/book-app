import type { LibraryState, ProgressLog, ShelfEntry, Tombstone } from "./types";

/**
 * Merging two copies of a shelf.
 *
 * Pure and symmetric, so the awkward cases — a book edited on both devices,
 * a book deleted on one and edited on the other — are settled by tested
 * rules rather than by whichever device happened to sync last.
 *
 * The rules, in order:
 *  - entries merge per book on `updatedAt`; the newer edit wins outright
 *  - a tombstone removes an entry only if the deletion is newer than the
 *    surviving edit, so deleting a book you then kept reading does not
 *    discard the reading
 *  - logs merge per (entry, day) taking the larger `pagesRead`, matching how
 *    the app folds a day's updates into one record
 */

/** Later of two ISO instants; a missing one always loses. */
function newer(a: string | undefined, b: string | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

export function mergeEntries(
  mine: ShelfEntry[],
  theirs: ShelfEntry[]
): ShelfEntry[] {
  const merged = new Map<string, ShelfEntry>();
  for (const entry of [...theirs, ...mine]) {
    const held = merged.get(entry.id);
    if (!held || newer(entry.updatedAt, held.updatedAt)) merged.set(entry.id, entry);
  }
  return [...merged.values()];
}

export function mergeTombstones(
  mine: Tombstone[],
  theirs: Tombstone[]
): Tombstone[] {
  const merged = new Map<string, Tombstone>();
  for (const stone of [...theirs, ...mine]) {
    const held = merged.get(stone.id);
    if (!held || newer(stone.deletedAt, held.deletedAt)) merged.set(stone.id, stone);
  }
  return [...merged.values()];
}

/**
 * Same-day updates for one book are a single record in this app, so two
 * devices that both read that day are reconciled by keeping the further
 * progress rather than by adding the two together.
 */
export function mergeLogs(mine: ProgressLog[], theirs: ProgressLog[]): ProgressLog[] {
  const merged = new Map<string, ProgressLog>();
  for (const log of [...theirs, ...mine]) {
    // A day is the first ten characters, whatever the client sent. An older
    // build could store a full timestamp here, and "2026-08-22" alongside
    // "2026-08-22T00:00:00.000Z" is two keys that are one calendar day —
    // they survived the merge and then collided in the database.
    const day = log.day.slice(0, 10);
    const key = `${log.entryId}|${day}`;
    const held = merged.get(key);
    if (!held || log.pagesRead > held.pagesRead) merged.set(key, { ...log, day });
  }
  return [...merged.values()];
}

/** Applies tombstones, keeping any entry edited after it was deleted. */
export function applyTombstones(
  entries: ShelfEntry[],
  tombstones: Tombstone[]
): { entries: ShelfEntry[]; tombstones: Tombstone[] } {
  const byId = new Map(tombstones.map((t) => [t.id, t]));

  const surviving = entries.filter((entry) => {
    const stone = byId.get(entry.id);
    // A deletion only wins if nothing newer happened to the book.
    return !stone || newer(entry.updatedAt, stone.deletedAt);
  });

  const survivingIds = new Set(surviving.map((e) => e.id));
  return {
    entries: surviving,
    // Drop tombstones the shelf outgrew, so they do not accumulate forever.
    tombstones: tombstones.filter((t) => !survivingIds.has(t.id)),
  };
}

/** The shelf-shaped part of a state — everything sync exchanges. */
export type Mergeable = Pick<LibraryState, "entries" | "logs" | "tombstones">;

/**
 * Whether two shelves hold the same thing, order aside.
 *
 * Lets a sync that changed nothing skip the write entirely — opening the app
 * on a second device is a read, and a write to an analytical store is by far
 * the expensive half.
 */
export function sameLibrary(a: Mergeable, b: Mergeable): boolean {
  const key = (state: Mergeable) =>
    JSON.stringify({
      entries: [...state.entries].sort((x, y) => x.id.localeCompare(y.id)),
      logs: [...state.logs].sort((x, y) =>
        `${x.entryId}|${x.day}`.localeCompare(`${y.entryId}|${y.day}`)
      ),
      tombstones: [...state.tombstones].sort((x, y) => x.id.localeCompare(y.id)),
    });
  return key(a) === key(b);
}

export function mergeLibraries(mine: Mergeable, theirs: Mergeable): Mergeable {
  const tombstones = mergeTombstones(mine.tombstones, theirs.tombstones);
  const settled = applyTombstones(
    mergeEntries(mine.entries, theirs.entries),
    tombstones
  );

  const liveIds = new Set(settled.entries.map((e) => e.id));
  return {
    entries: settled.entries,
    // Logs belonging to a removed book go with it.
    logs: mergeLogs(mine.logs, theirs.logs).filter((log) => liveIds.has(log.entryId)),
    tombstones: settled.tombstones,
  };
}
