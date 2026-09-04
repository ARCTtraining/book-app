import { Client } from "pg";
import type { Mergeable } from "./merge";
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

export async function readLibrary(): Promise<Mergeable> {
  return withClient(async (client) => {
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
          // `day` is a calendar date; take its own components, not UTC's.
          day: new Date(row.day).toISOString().slice(0, 10),
          pagesRead: Number(row.pages_read),
          page: Number(row.page),
          at: iso(row.logged_at)!,
        })
      ),
      tombstones: stones.rows.map(
        (row): Tombstone => ({ id: row.id, deletedAt: iso(row.deleted_at)! })
      ),
    };
  });
}

/* Writing ------------------------------------------------------------------ */

/**
 * Replaces the stored shelf with `state`.
 *
 * The caller has already merged, so this is a straight overwrite rather than
 * an upsert dance — simpler to reason about, and the volumes are tiny.
 */
export async function writeLibrary(state: Mergeable): Promise<void> {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM progress_logs");
      await client.query("DELETE FROM shelf_entries");
      await client.query("DELETE FROM deleted_entries");

      // Books are shared across entries and worth keeping, so they are
      // upserted rather than cleared.
      for (const entry of state.entries) {
        const b = entry.book;
        await client.query(
          `INSERT INTO books (id, isbn13, title, author, page_count, genre, year, blurb, thumbnail_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET
             isbn13 = excluded.isbn13, title = excluded.title,
             author = excluded.author, page_count = excluded.page_count,
             genre = excluded.genre, year = excluded.year,
             blurb = excluded.blurb, thumbnail_url = excluded.thumbnail_url`,
          [b.id, b.isbn13 ?? null, b.title, b.author, b.pageCount, b.genre,
           b.year ?? null, b.blurb ?? null, b.thumbnailUrl ?? null]
        );

        await client.query(
          `INSERT INTO shelf_entries
             (id, book_id, status, current_page, added_at, started_at, finished_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [entry.id, b.id, entry.status, entry.currentPage, entry.addedAt,
           entry.startedAt ?? null, entry.finishedAt ?? null, entry.updatedAt]
        );
      }

      for (const log of state.logs) {
        await client.query(
          `INSERT INTO progress_logs (id, entry_id, day, pages_read, page, logged_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [log.id, log.entryId, log.day, log.pagesRead, log.page, log.at]
        );
      }

      for (const stone of state.tombstones) {
        await client.query(
          `INSERT INTO deleted_entries (id, deleted_at) VALUES ($1,$2)`,
          [stone.id, stone.deletedAt]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}
