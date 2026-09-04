import type {
  CatalogBook,
  LibraryState,
  ProgressLog,
  Settings,
  ShelfEntry,
  ShelfStatus,
} from "./types";
import { dayOf, isoFromDay, todayKey, type DayKey } from "./dates";

/**
 * Domain operations over `LibraryState`.
 *
 * All pure: state in, new state out. Keeping the rules here (rather than in
 * components or in the storage layer) is what lets the persistence swap
 * happen without touching behaviour.
 */

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function findEntryByBook(
  state: LibraryState,
  bookId: string
): ShelfEntry | undefined {
  return state.entries.find((entry) => entry.book.id === bookId);
}

/**
 * Puts a book on the shelf, or moves an existing entry into `status`.
 *
 * Searching for a book already on the shelf and hitting "Start reading" is a
 * normal path, so this is idempotent rather than an error.
 */
export function addToShelf(
  state: LibraryState,
  book: CatalogBook,
  status: ShelfStatus
): LibraryState {
  const existing = findEntryByBook(state, book.id);
  if (existing) {
    return status === "reading" && existing.status !== "reading"
      ? startReading(state, existing.id)
      : state;
  }

  const now = new Date().toISOString();
  const entry: ShelfEntry = {
    id: newId(),
    book,
    status,
    currentPage: 0,
    addedAt: now,
    startedAt: status === "reading" ? now : undefined,
    updatedAt: now,
  };
  return { ...state, entries: [entry, ...state.entries] };
}

export function startReading(state: LibraryState, entryId: string): LibraryState {
  return mapEntry(state, entryId, (entry) => ({
    ...entry,
    status: "reading",
    startedAt: entry.startedAt ?? new Date().toISOString(),
    finishedAt: undefined,
  }));
}

export function moveToWantToRead(
  state: LibraryState,
  entryId: string
): LibraryState {
  return mapEntry(state, entryId, (entry) => ({
    ...entry,
    status: "want",
    currentPage: 0,
    startedAt: undefined,
    finishedAt: undefined,
  }));
}

/**
 * Records a new absolute page for a book.
 *
 * The slider fires continuously, and a day should count once, so same-day
 * updates for one book collapse into a single log whose `pagesRead` is the
 * day's total advance. Moving the slider backwards corrects `currentPage`
 * but never logs — it is not reading.
 */
export function updateProgress(
  state: LibraryState,
  entryId: string,
  page: number
): LibraryState {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return state;

  const clamped = Math.max(0, Math.min(Math.round(page), entry.book.pageCount));
  const delta = clamped - entry.currentPage;

  let next: LibraryState = mapEntry(state, entryId, (e) => ({
    ...e,
    status: clamped >= e.book.pageCount ? "finished" : "reading",
    currentPage: clamped,
    startedAt: e.startedAt ?? new Date().toISOString(),
    finishedAt:
      clamped >= e.book.pageCount
        ? (e.finishedAt ?? new Date().toISOString())
        : undefined,
  }));

  if (delta > 0) next = recordPages(next, entryId, delta, clamped);
  return next;
}

/** Marks a book finished, crediting whatever pages were left today. */
export function markFinished(state: LibraryState, entryId: string): LibraryState {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return state;
  return updateProgress(state, entryId, entry.book.pageCount);
}

/** Logs pages read today without moving through the slider. */
export function logPagesToday(
  state: LibraryState,
  entryId: string,
  pages: number
): LibraryState {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry || pages <= 0) return state;
  return updateProgress(state, entryId, entry.currentPage + pages);
}

/**
 * Checks a proposed start/finish pair.
 *
 * Returns a message meant to be shown to the reader, or null when the dates
 * are usable. Kept separate from `setEntryDates` so the form can warn while
 * typing without committing anything.
 */
export function validateEntryDates(
  started: DayKey | undefined,
  finished: DayKey | undefined,
  today: DayKey = todayKey()
): string | null {
  if (started && started > today) return "A start date cannot be in the future.";
  if (finished && finished > today) return "A finish date cannot be in the future.";
  if (started && finished && finished < started) {
    return "The finish date is before the start date.";
  }
  return null;
}

/**
 * Rewrites when a book was started and finished.
 *
 * Needed because the app otherwise stamps whatever moment you happened to
 * tap the button — finish a book on Sunday, log it on Wednesday, and the
 * shelf claims Wednesday. Passing null clears a date.
 *
 * Invalid combinations are rejected rather than stored, so the shelf can
 * never hold a book finished before it was started.
 */
export function setEntryDates(
  state: LibraryState,
  entryId: string,
  dates: { startedAt?: DayKey | null; finishedAt?: DayKey | null }
): LibraryState {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return state;

  const nextStarted =
    dates.startedAt === undefined ? dayOf(entry.startedAt) : (dates.startedAt ?? undefined);
  const nextFinished =
    dates.finishedAt === undefined
      ? dayOf(entry.finishedAt)
      : (dates.finishedAt ?? undefined);

  if (validateEntryDates(nextStarted, nextFinished)) return state;

  return mapEntry(state, entryId, (e) => ({
    ...e,
    startedAt: nextStarted ? isoFromDay(nextStarted) : undefined,
    finishedAt: nextFinished ? isoFromDay(nextFinished) : undefined,
  }));
}

/**
 * Puts a book straight onto the finished shelf.
 *
 * For books read before the app existed. One progress log is written on the
 * finish date so the pages land in the right month on the chart — without
 * it, Insights would count the book in its totals but show nothing in the
 * pages-by-month line.
 */
export function addFinishedBook(
  state: LibraryState,
  book: CatalogBook,
  dates: { startedAt?: DayKey; finishedAt: DayKey }
): LibraryState {
  if (validateEntryDates(dates.startedAt, dates.finishedAt)) return state;

  const existing = findEntryByBook(state, book.id);
  const id = existing?.id ?? newId();

  const entry: ShelfEntry = {
    id,
    book,
    status: "finished",
    currentPage: book.pageCount,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    startedAt: dates.startedAt ? isoFromDay(dates.startedAt) : undefined,
    finishedAt: isoFromDay(dates.finishedAt),
    updatedAt: new Date().toISOString(),
  };

  const log: ProgressLog = {
    id: newId(),
    entryId: id,
    day: dates.finishedAt,
    pagesRead: book.pageCount,
    page: book.pageCount,
    at: isoFromDay(dates.finishedAt),
  };

  return {
    ...state,
    entries: existing
      ? state.entries.map((e) => (e.id === id ? entry : e))
      : [entry, ...state.entries],
    // Replace any earlier logs for this book so re-adding cannot double-count.
    logs: [...state.logs.filter((l) => l.entryId !== id), log],
  };
}

/**
 * Takes a book off the shelf, along with its logs.
 *
 * Records a tombstone so the removal survives a sync: without one, the book
 * is merely absent from this device's next upload, and another device's copy
 * puts it straight back.
 */
export function removeEntry(state: LibraryState, entryId: string): LibraryState {
  if (!state.entries.some((entry) => entry.id === entryId)) return state;

  return {
    ...state,
    entries: state.entries.filter((entry) => entry.id !== entryId),
    logs: state.logs.filter((log) => log.entryId !== entryId),
    tombstones: [
      ...state.tombstones.filter((t) => t.id !== entryId),
      { id: entryId, deletedAt: new Date().toISOString() },
    ],
  };
}

export function updateSettings(
  state: LibraryState,
  patch: Partial<Settings>
): LibraryState {
  return { ...state, settings: { ...state.settings, ...patch } };
}

/* -------------------------------------------------------------------------- */

/**
 * Applies a change to one entry and stamps it.
 *
 * The single choke point for entry edits, so `updatedAt` cannot be forgotten
 * — sync merges on it, and a stale stamp silently loses the change.
 */
function mapEntry(
  state: LibraryState,
  entryId: string,
  fn: (entry: ShelfEntry) => ShelfEntry
): LibraryState {
  const now = new Date().toISOString();
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.id === entryId ? { ...fn(entry), updatedAt: now } : entry
    ),
  };
}

/** Appends to — or folds into — today's log for this book. */
function recordPages(
  state: LibraryState,
  entryId: string,
  pagesRead: number,
  page: number
): LibraryState {
  const day = todayKey();
  const at = new Date().toISOString();
  const index = state.logs.findIndex(
    (log) => log.entryId === entryId && log.day === day
  );

  if (index === -1) {
    const log: ProgressLog = { id: newId(), entryId, day, pagesRead, page, at };
    return { ...state, logs: [...state.logs, log] };
  }

  const logs = [...state.logs];
  logs[index] = {
    ...logs[index],
    pagesRead: logs[index].pagesRead + pagesRead,
    page,
    at,
  };
  return { ...state, logs };
}

/* Selectors ---------------------------------------------------------------- */

export function entriesByStatus(
  state: LibraryState,
  status: ShelfStatus
): ShelfEntry[] {
  const entries = state.entries.filter((entry) => entry.status === status);

  if (status === "finished") {
    // Most recently finished first.
    return entries.sort((a, b) =>
      (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "")
    );
  }
  if (status === "reading") {
    // Furthest along first, so the book you are actually in sits on top.
    return entries.sort((a, b) => progressRatio(b) - progressRatio(a));
  }
  return entries.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function progressRatio(entry: ShelfEntry): number {
  if (!entry.book.pageCount) return 0;
  return Math.min(1, entry.currentPage / entry.book.pageCount);
}

export function progressPercent(entry: ShelfEntry): number {
  return Math.round(progressRatio(entry) * 100);
}
