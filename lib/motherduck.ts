import { Client } from "pg";
import { sameLibrary, type Mergeable } from "./merge";
import type { ProgressLog, ShelfEntry, Tombstone } from "./types";

/**
 * MotherDuck access, server-side only.
 *
 * Connects over MotherDuck's Postgres wire endpoint rather than the DuckDB
 * client, so no native binaries are bundled into the function. The dialect
 * on the far side is still DuckDB SQL, not Postgres.
 *
 * localStorage remains the source of truth for the app; this is a sync
 * target, so every failure here is recoverable and never blocks reading.
 */

/** The endpoint is region-scoped, so the host has to be configured. */
const DEFAULT_HOST = "pg.us-east-1-aws.motherduck.com";

export function motherduckConfigured(): boolean {
  return Boolean(process.env.MOTHERDUCK_TOKEN);
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    host: process.env.MOTHERDUCK_HOST || DEFAULT_HOST,
    port: 5432,
    user: "postgres",
    password: process.env.MOTHERDUCK_TOKEN,
    database: process.env.MOTHERDUCK_DATABASE || "book_app",
    ssl: { rejectUnauthorized: true },
    // A sync that hangs must not hold the function open to its own timeout.
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {
      // Nothing useful to do if teardown fails.
    });
  }
}

/* Reading ------------------------------------------------------------------ */

interface EntryRow {
  id: string;
  book_id: string;
  status: string;
  current_page: number;
  added_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  updated_at: Date;
  isbn13: string | null;
  title: string;
  author: string;
  page_count: number;
  genre: string;
  year: number | null;
  blurb: string | null;
  thumbnail_url: string | null;
}

const iso = (value: Date | null): string | undefined =>
  value ? new Date(value).toISOString() : undefined;

function toEntry(row: EntryRow): ShelfEntry {
  return {
    id: row.id,
    book: {
      id: row.book_id,
      isbn13: row.isbn13 ?? undefined,
      title: row.title,
      author: row.author,
      pageCount: Number(row.page_count),
      genre: row.genre,
      year: row.year ?? undefined,
      blurb: row.blurb ?? undefined,
      thumbnailUrl: row.thumbnail_url ?? undefined,
    },
    status: row.status as ShelfEntry["status"],
    currentPage: Number(row.current_page),
    addedAt: iso(row.added_at)!,
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
    updatedAt: iso(row.updated_at)!,
  };
}

/** A DATE column as a local calendar day; `toISOString` would shift it. */
function dayFrom(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function readOn(client: Client): Promise<Mergeable> {
  {
    const entries = await client.query<EntryRow>(`
      SELECT e.id, e.book_id, e.status, e.current_page, e.added_at,
             e.started_at, e.finished_at, e.updated_at,
             b.isbn13, b.title, b.author, b.page_count, b.genre, b.year,
             b.blurb, b.thumbnail_url
      FROM shelf_entries e
      JOIN books b ON b.id = e.book_id
    `);

    const logs = await client.query<{
      id: string;
      entry_id: string;
      day: Date;
      pages_read: number;
      page: number;
      logged_at: Date;
    }>(`SELECT id, entry_id, day, pages_read, page, logged_at FROM progress_logs`);

    const stones = await client.query<{ id: string; deleted_at: Date }>(
      `SELECT id, deleted_at FROM deleted_entries`
    );

    return {
      entries: entries.rows.map(toEntry),
      logs: logs.rows.map(
        (row): ProgressLog => ({
          id: row.id,
          entryId: row.entry_id,
          day: dayFrom(row.day),
          pagesRead: Number(row.pages_read),
          page: Number(row.page),
          at: iso(row.logged_at)!,
        })
      ),
      tombstones: stones.rows.map(
        (row): Tombstone => ({ id: row.id, deletedAt: iso(row.deleted_at)! })
      ),
    };
  }
}

/* Writing ------------------------------------------------------------------ */

/**
 * Inserts many rows in one statement.
 *
 * A row-at-a-time loop is a separate round trip to a remote database each
 * time; a seventeen-book shelf took sixty of them and twenty-three seconds.
 * Chunked so the parameter count stays sane on a large shelf.
 */
async function insertRows(
  client: Client,
  table: string,
  columns: string[],
  rows: unknown[][]
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map(
      (row) => `(${row.map((value) => `$${params.push(value)}`).join(",")})`
    );
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`,
      params
    );
  }
}

/**
 * Replaces the stored shelf with `state`.
 *
 * The caller has already merged, so this is a straight overwrite rather than
 * an upsert dance — simpler to reason about, and the volumes are tiny.
 */
async function writeOn(client: Client, state: Mergeable): Promise<void> {
  // Two entries can share a book; the books table takes each one once.
  const books = new Map(state.entries.map((entry) => [entry.book.id, entry.book]));

  {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM progress_logs");
      await client.query("DELETE FROM shelf_entries");
      await client.query("DELETE FROM deleted_entries");
      await client.query("DELETE FROM books");

      await insertRows(
        client,
        "books",
        ["id", "isbn13", "title", "author", "page_count", "genre", "year", "blurb", "thumbnail_url"],
        [...books.values()].map((b) => [
          b.id, b.isbn13 ?? null, b.title, b.author, b.pageCount,
          b.genre, b.year ?? null, b.blurb ?? null, b.thumbnailUrl ?? null,
        ])
      );

      await insertRows(
        client,
        "shelf_entries",
        ["id", "book_id", "status", "current_page", "added_at", "started_at", "finished_at", "updated_at"],
        state.entries.map((e) => [
          e.id, e.book.id, e.status, e.currentPage, e.addedAt,
          e.startedAt ?? null, e.finishedAt ?? null, e.updatedAt,
        ])
      );

      // Last guard before the unique index on (entry_id, day). The merge
      // already collapses a day to one record; this makes a malformed
      // payload a lost duplicate rather than a failed sync.
      const oneLogPerDay = new Map(
        state.logs.map((l) => [`${l.entryId}|${l.day.slice(0, 10)}`, l])
      );
      await insertRows(
        client,
        "progress_logs",
        ["id", "entry_id", "day", "pages_read", "page", "logged_at"],
        [...oneLogPerDay.values()].map((l) => [
          l.id, l.entryId, l.day.slice(0, 10), l.pagesRead, l.page, l.at,
        ])
      );

      await insertRows(
        client,
        "deleted_entries",
        ["id", "deleted_at"],
        state.tombstones.map((t) => [t.id, t.deletedAt])
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
}

/**
 * One connection, one sync.
 *
 * Reading and writing used to open a connection each, and connecting to
 * MotherDuck costs about two seconds — half of every sync was handshakes.
 * `prepare` merges the caller's shelf with what is stored; the write is
 * skipped when the result is identical to what is already there.
 */
export async function syncShelf(
  prepare: (theirs: Mergeable) => Mergeable
): Promise<Mergeable> {
  return withClient(async (client) => {
    const theirs = await readOn(client);
    const merged = prepare(theirs);
    if (!sameLibrary(merged, theirs)) await writeOn(client, merged);
    return merged;
  });
}
