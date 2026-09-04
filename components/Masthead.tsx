"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StampMark } from "./ui";

/**
 * Fixed navy masthead. Sits under the iOS status bar in standalone mode, so
 * it carries the top safe-area inset itself.
 */
export function Masthead() {
  const pathname = usePathname();
  const onSettings = pathname === "/settings";

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-marigold/60 bg-ink pt-safe">
      <div className="mx-auto flex h-12 max-w-md items-center gap-2.5 px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Reading Log home">
          <StampMark />
          <span className="label-caps text-[12px] tracking-[0.2em] text-paper">
            Reading Log
          </span>
        </Link>

        <Link
          href={onSettings ? "/" : "/settings"}
          aria-label={onSettings ? "Close settings" : "Settings"}
          className="ml-auto -mr-1 flex size-9 items-center justify-center"
        >
          {onSettings ? <CloseIcon /> : <GearIcon />}
        </Link>
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#F1ECDF"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#F1ECDF"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
