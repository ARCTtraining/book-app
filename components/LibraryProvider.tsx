"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DayKey } from "@/lib/dates";
import type {
  CatalogBook,
  InsightsSummary,
  LibraryState,
  Settings,
  ShelfStatus,
  StreakSummary,
} from "@/lib/types";
import * as library from "@/lib/library";
import { computeInsights } from "@/lib/insights";
import { computeStreak } from "@/lib/streaks";
import { buildSampleLibrary } from "@/lib/seed";
import {
  readLastSynced,
  syncLibrary,
  writeLastSynced,
  type SyncOutcome,
} from "@/lib/sync";
import {
  emptyState,
  localStorageRepository,
  type LibraryRepository,
} from "@/lib/storage";

/**
 * Single source of truth for shelf state.
 *
 * The provider owns the state, derives streak and insights from it, and
 * writes through to a `LibraryRepository`. Components never touch storage.
 */

interface LibraryContextValue {
  state: LibraryState;
  /** False until localStorage has been read, so nothing flashes empty. */
  ready: boolean;
  streak: StreakSummary;
  insights: InsightsSummary;
  addToShelf: (book: CatalogBook, status: ShelfStatus) => void;
  startReading: (entryId: string) => void;
  moveToWantToRead: (entryId: string) => void;
  updateProgress: (entryId: string, page: number) => void;
  markFinished: (entryId: string) => void;
  setEntryDates: (
    entryId: string,
    dates: { startedAt?: DayKey | null; finishedAt?: DayKey | null }
  ) => void;
  addFinishedBook: (
    book: CatalogBook,
    dates: { startedAt?: DayKey; finishedAt: DayKey }
  ) => void;
  logPagesToday: (entryId: string, pages: number) => void;
  removeEntry: (entryId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  loadSampleData: () => void;
  clearAll: () => void;
  shelfStatusOf: (bookId: string) => ShelfStatus | null;
  /** Pushes the shelf to MotherDuck and adopts the merged result. */
  sync: (passphrase: string) => Promise<SyncOutcome>;
  syncing: boolean;
  lastSyncedAt: string | null;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({
  children,
  repository = localStorageRepository,
}: {
  children: React.ReactNode;
  repository?: LibraryRepository;
}) {
  // Starts empty, and stays empty until the reader adds something. The demo
  // shelf is no longer seeded automatically — it is opt-in from Settings, so
  // a new reader's first books are their own.
  const [state, setState] = useState<LibraryState>(emptyState);
  const [ready, setReady] = useState(false);
  const repo = useRef(repository);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await repo.current.load();
      if (cancelled) return;
      if (stored) setState(stored);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Write through on every change, but not before the initial read has
  // landed — that would persist the sample shelf over real data.
  useEffect(() => {
    if (!ready) return;
    void repo.current.save(state);
  }, [state, ready]);

  const streak = useMemo(() => computeStreak(state.logs), [state.logs]);
  const insights = useMemo(() => computeInsights(state), [state]);

  const addToShelf = useCallback((book: CatalogBook, status: ShelfStatus) => {
    setState((current) => library.addToShelf(current, book, status));
  }, []);

  const startReading = useCallback((entryId: string) => {
    setState((current) => library.startReading(current, entryId));
  }, []);

  const moveToWantToRead = useCallback((entryId: string) => {
    setState((current) => library.moveToWantToRead(current, entryId));
  }, []);

  const updateProgress = useCallback((entryId: string, page: number) => {
    setState((current) => library.updateProgress(current, entryId, page));
  }, []);

  const markFinished = useCallback((entryId: string) => {
    setState((current) => library.markFinished(current, entryId));
  }, []);

  const setEntryDates = useCallback<LibraryContextValue["setEntryDates"]>(
    (entryId, dates) => {
      setState((current) => library.setEntryDates(current, entryId, dates));
    },
    []
  );

  const addFinishedBook = useCallback<LibraryContextValue["addFinishedBook"]>(
    (book, dates) => {
      setState((current) => library.addFinishedBook(current, book, dates));
    },
    []
  );

  const logPagesToday = useCallback((entryId: string, pages: number) => {
    setState((current) => library.logPagesToday(current, entryId, pages));
  }, []);

  const removeEntry = useCallback((entryId: string) => {
    setState((current) => library.removeEntry(current, entryId));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((current) => library.updateSettings(current, patch));
  }, []);

  const loadSampleData = useCallback(() => {
    setState(buildSampleLibrary());
  }, []);

  const clearAll = useCallback(() => {
    setState((current) => ({
      ...current,
      entries: [],
      logs: [],
    }));
  }, []);

  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    readLastSynced()
  );

  // Mirrors state for the async sync, which must upload whatever is current
  // when it runs rather than whatever was captured when `sync` was created.
  // Written in an effect rather than during render, which React forbids.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const sync = useCallback<LibraryContextValue["sync"]>(
    async (passphrase) => {
      setSyncing(true);
      try {
        const outcome = await syncLibrary(stateRef.current, passphrase);

        if (outcome.ok) {
          // Merge in, rather than replace: settings are per-device and do
          // not travel, and edits made mid-flight must not be dropped.
          setState((latest) => ({ ...latest, ...outcome.merged }));
          writeLastSynced(outcome.syncedAt);
          setLastSyncedAt(outcome.syncedAt);
        }
        return outcome;
      } finally {
        setSyncing(false);
      }
    },
    []
  );

  const shelfStatusOf = useCallback(
    (bookId: string) => library.findEntryByBook(state, bookId)?.status ?? null,
    [state]
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      state,
      ready,
      streak,
      insights,
      addToShelf,
      startReading,
      moveToWantToRead,
      updateProgress,
      markFinished,
      setEntryDates,
      addFinishedBook,
      logPagesToday,
      removeEntry,
      updateSettings,
      loadSampleData,
      clearAll,
      shelfStatusOf,
      sync,
      syncing,
      lastSyncedAt,
    }),
    [
      state,
      ready,
      streak,
      insights,
      addToShelf,
      startReading,
      moveToWantToRead,
      updateProgress,
      markFinished,
      setEntryDates,
      addFinishedBook,
      logPagesToday,
      removeEntry,
      updateSettings,
      loadSampleData,
      clearAll,
      shelfStatusOf,
      sync,
      syncing,
      lastSyncedAt,
    ]
  );

  return <LibraryContext value={value}>{children}</LibraryContext>;
}

export function useLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) {
    throw new Error("useLibrary must be used inside <LibraryProvider>");
  }
  return value;
}
