import type { LibraryState, Settings } from "./types";

/**
 * Persistence layer.
 *
 * The rest of the app only ever talks to a `LibraryRepository`, and every
 * method is async. Replacing `localStorageRepository` with one backed by
 * `fetch("/api/library")` is the entire migration to a real database.
 */

export const STORAGE_KEY = "reading-log/library";
export const STATE_VERSION = 1;

/**
 * Marks that the one-time clear-out of the auto-seeded demo shelf has run.
 *
 * Earlier builds seeded a sample library on first launch. That no longer
 * happens, but a code change cannot reach data already saved on a device, so
 * returning readers would keep seeing books they never added.
 */
const DEMO_CLEARED_KEY = "reading-log/demo-cleared";

/**
 * True when every entry came from the seed generator.
 *
 * `seed.ts` issues ids prefixed `seed-`; anything a reader adds gets a UUID.
 * A single self-added book is therefore enough to make this false, so a real
 * shelf is never mistaken for demo data.
 */
export function isSeededDemoShelf(state: LibraryState): boolean {
  return (
    state.entries.length > 0 &&
    state.entries.every((entry) => entry.id.startsWith("seed-"))
  );
}

export const DEFAULT_SETTINGS: Settings = {
  remindersEnabled: false,
  reminderTime: "21:00",
  weeklyDigest: false,
  dailyPageGoal: 30,
};

export function emptyState(): LibraryState {
  return {
    version: STATE_VERSION,
    entries: [],
    logs: [],
    tombstones: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export interface LibraryRepository {
  load(): Promise<LibraryState | null>;
  save(state: LibraryState): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Coerces whatever came out of storage into a usable state.
 *
 * Prototype data gets hand-edited and schema-drifted, so a bad payload
 * degrades to a clean slate instead of throwing on boot.
 */
function migrate(raw: unknown): LibraryState | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<LibraryState>;
  if (!Array.isArray(candidate.entries) || !Array.isArray(candidate.logs)) {
    return null;
  }
  return {
    version: STATE_VERSION,
    // Shelves saved before sync existed carry no change stamp. Backdating
    // them to when the book was added means a genuine edit on any device
    // always wins over an unstamped copy.
    entries: candidate.entries.map((entry) => ({
      ...entry,
      updatedAt: entry.updatedAt ?? entry.addedAt ?? new Date(0).toISOString(),
    })),
    logs: candidate.logs,
    tombstones: Array.isArray(candidate.tombstones) ? candidate.tombstones : [],
    settings: { ...DEFAULT_SETTINGS, ...(candidate.settings ?? {}) },
  };
}

export const localStorageRepository: LibraryRepository = {
  async load() {
    // Guard for the server render pass and for Safari private mode, where
    // touching localStorage can throw outright.
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const state = raw ? migrate(JSON.parse(raw)) : null;
      if (!state) return null;

      // Runs at most once per device: a shelf left over from when the demo
      // library was seeded automatically is cleared, so the reader starts
      // with their own books. Loading the sample from Settings afterwards
      // sticks, because the flag is already set.
      const alreadyRun = window.localStorage.getItem(DEMO_CLEARED_KEY);
      window.localStorage.setItem(DEMO_CLEARED_KEY, "1");
      if (!alreadyRun && isSeededDemoShelf(state)) {
        return { ...state, entries: [], logs: [] };
      }
      return state;
    } catch {
      return null;
    }
  },

  async save(state) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota or private mode. The in-memory state stays authoritative for
      // the session; nothing the prototype does warrants interrupting the UI.
    }
  },

  async clear() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do.
    }
  },
};
