import type { Mergeable } from "./merge";
import type { LibraryState } from "./types";

/**
 * Client half of shelf sync.
 *
 * Sends the local shelf, receives the merged one. localStorage stays the
 * source of truth, so a failure here is reported and nothing else changes —
 * the app keeps working offline exactly as before.
 */

export const PASSPHRASE_KEY = "reading-log/sync-passphrase";
export const LAST_SYNCED_KEY = "reading-log/last-synced";

export type SyncOutcome =
  | { ok: true; merged: Mergeable; syncedAt: string }
  | { ok: false; reason: SyncFailure; message: string };

export type SyncFailure = "passphrase" | "unconfigured" | "offline" | "server";

const MESSAGES: Record<SyncFailure, string> = {
  passphrase: "That passphrase was not accepted.",
  unconfigured: "Sync is not set up on the server yet.",
  offline: "No connection — your shelf is safe on this device.",
  server: "The sync service could not be reached.",
};

function fail(reason: SyncFailure): SyncOutcome {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** Only the shelf travels; settings stay per-device. */
function payload(state: LibraryState): Mergeable {
  return {
    entries: state.entries,
    logs: state.logs,
    tombstones: state.tombstones,
  };
}

export async function syncLibrary(
  state: LibraryState,
  passphrase: string
): Promise<SyncOutcome> {
  if (!passphrase) return fail("passphrase");

  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-passphrase": passphrase,
      },
      body: JSON.stringify(payload(state)),
    });
  } catch {
    return fail("offline");
  }

  if (response.status === 401) return fail("passphrase");
  if (response.status === 503) return fail("unconfigured");
  if (!response.ok) return fail("server");

  try {
    const body = (await response.json()) as Mergeable & { syncedAt: string };
    return {
      ok: true,
      merged: {
        entries: body.entries ?? [],
        logs: body.logs ?? [],
        tombstones: body.tombstones ?? [],
      },
      syncedAt: body.syncedAt,
    };
  } catch {
    return fail("server");
  }
}

/* The passphrase is a per-device convenience, kept out of the shelf state so
   it is never uploaded. */

export function readPassphrase(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PASSPHRASE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writePassphrase(value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(PASSPHRASE_KEY, value);
    else window.localStorage.removeItem(PASSPHRASE_KEY);
  } catch {
    // Private mode; the reader can re-enter it next time.
  }
}

export function readLastSynced(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_SYNCED_KEY);
  } catch {
    return null;
  }
}

export function writeLastSynced(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SYNCED_KEY, value);
  } catch {
    // Not worth surfacing.
  }
}
