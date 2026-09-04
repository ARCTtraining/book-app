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
  logPagesToday: (entryId: string, pages: number) => void;
  removeEntry: (entryId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  loadSampleData: () => void;
  clearAll: () => void;
  shelfStatusOf: (bookId: string) => ShelfStatus | null;
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
      logPagesToday,
      removeEntry,
      updateSettings,
      loadSampleData,
      clearAll,
      shelfStatusOf,
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
      logPagesToday,
      removeEntry,
      updateSettings,
      loadSampleData,
      clearAll,
      shelfStatusOf,
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
