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
    entries: candidate.entries,
    logs: candidate.logs,
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
      return raw ? migrate(JSON.parse(raw)) : null;
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
