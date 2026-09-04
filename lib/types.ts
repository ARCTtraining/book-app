/**
 * Domain types for Reading Log.
 *
 * These are deliberately transport-agnostic: nothing here knows whether a
 * book came from the mock catalog or Google Books, or whether shelf state lives in
 * localStorage or Postgres.
 */

/** A book as returned by a catalog source (mock now, Google Books later). */
export interface CatalogBook {
  /** Stable catalog identifier. Will be the Google Books volume id. */
  id: string;
  isbn13?: string;
  title: string;
  author: string;
  pageCount: number;
  /**
   * Free text, not an enum: Google Books `categories` are uncontrolled
   * strings ("Fiction", "Biography & Autobiography", …), so anything that
   * consumes a genre must cope with a value it has never seen.
   */
  genre: string;
  year?: number;
  /** One-line blurb shown in search results. */
  blurb?: string;
  /** Google Books `imageLinks.thumbnail`, once there is a real catalog. */
  thumbnailUrl?: string;
}

export type ShelfStatus = "want" | "reading" | "finished";

/**
 * A book on the user's shelf.
 *
 * `book` is a denormalized snapshot rather than a catalog reference, so shelf
 * entries survive the catalog swap and stay readable offline.
 */
export interface ShelfEntry {
  /** Local entry id, unrelated to the catalog id. */
  id: string;
  book: CatalogBook;
  status: ShelfStatus;
  /** Last recorded page. 0 for want-to-read, pageCount when finished. */
  currentPage: number;
  /** ISO date-time the book was added to the shelf. */
  addedAt: string;
  startedAt?: string;
  finishedAt?: string;
  /**
   * When this entry last changed. Sync merges per entry on this, so a device
   * that has been offline cannot clobber newer edits made elsewhere.
   */
  updatedAt: string;
}

/**
 * A deleted entry, remembered so the deletion can propagate.
 *
 * Without tombstones a book removed on one device is simply absent from that
 * device's next sync, and the other device's copy puts it straight back.
 */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

/**
 * One page-progress update. Drives the streak counter and the pages-by-month
 * chart, so it records both the delta and the resulting absolute page.
 */
export interface ProgressLog {
  id: string;
  entryId: string;
  /** Local calendar day, YYYY-MM-DD. The unit the streak counts. */
  day: string;
  /** Pages advanced by this update. Can be 0 but never negative. */
  pagesRead: number;
  /** Absolute page after the update. */
  page: number;
  at: string;
}

/** The entire persisted state. One object, one storage key, one version. */
export interface LibraryState {
  version: number;
  entries: ShelfEntry[];
  logs: ProgressLog[];
  /** Removed entry ids, kept so sync can propagate the removal. */
  tombstones: Tombstone[];
  /** Prototype-only UI preferences (the placeholder Reminders section). */
  settings: Settings;
}

export interface Settings {
  remindersEnabled: boolean;
  reminderTime: string;
  weeklyDigest: boolean;
  dailyPageGoal: number;
}

export interface StreakSummary {
  /** Consecutive days ending today, or ending yesterday if today is unlogged. */
  current: number;
  longest: number;
  /** True when today already has a logged update. */
  loggedToday: boolean;
  /** Last seven days, oldest first, for the streak strip. */
  recentDays: { day: string; logged: boolean }[];
}

export interface InsightsSummary {
  totalPagesRead: number;
  booksFinished: number;
  /** Mean pages/day across the trailing window, rounded. */
  avgPagesPerDay: number;
  paceWindowDays: number;
  /** Mean pages/day across the calendar year to date. */
  avgPagesPerDayThisYear: number;
  /** The calendar year the year-to-date figures cover. */
  year: number;
  booksOnShelf: number;
  pagesByMonth: { month: string; label: string; pages: number }[];
}
