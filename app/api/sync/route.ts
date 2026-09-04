import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { mergeLibraries, type Mergeable } from "@/lib/merge";
import { motherduckConfigured, readLibrary, writeLibrary } from "@/lib/motherduck";

/**
 * Two-way shelf sync.
 *
 * The device posts its shelf, this merges it with what MotherDuck holds, and
 * the merged result is written back and returned. localStorage stays the
 * source of truth for reading — sync is additive, so any failure here leaves
 * the app working exactly as before.
 *
 * The deployment is public, so every request must carry the shared
 * passphrase. Without that, anyone with the URL could read or rewrite the
 * shelf.
 */

export const maxDuration = 30;

/** Constant-time compare, so the passphrase cannot be guessed by timing. */
function passphraseMatches(supplied: string | null): boolean {
  const expected = process.env.SYNC_PASSPHRASE;
  if (!expected || !supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function unauthorized() {
  return NextResponse.json({ error: "Wrong or missing passphrase" }, { status: 401 });
}

/** Rejects anything that is not a shelf, so a bad body cannot wipe the store. */
function readBody(body: unknown): Mergeable | null {
  if (!body || typeof body !== "object") return null;
  const candidate = body as Partial<Mergeable>;
  if (!Array.isArray(candidate.entries)) return null;
  if (!Array.isArray(candidate.logs)) return null;
  return {
    entries: candidate.entries,
    logs: candidate.logs,
    tombstones: Array.isArray(candidate.tombstones) ? candidate.tombstones : [],
  };
}

export async function POST(request: Request) {
  if (!passphraseMatches(request.headers.get("x-sync-passphrase"))) {
    return unauthorized();
  }

  if (!motherduckConfigured()) {
    return NextResponse.json(
      { error: "MOTHERDUCK_TOKEN is not set on the server" },
      { status: 503 }
    );
  }

  const mine = readBody(await request.json().catch(() => null));
  if (!mine) {
    return NextResponse.json({ error: "Malformed shelf" }, { status: 400 });
  }

  try {
    const theirs = await readLibrary();
    const merged = mergeLibraries(mine, theirs);
    await writeLibrary(merged);

    return NextResponse.json({
      ...merged,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    // Never surface the driver's message: it can carry the host and token.
    console.error("[api/sync]", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
