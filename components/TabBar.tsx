"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

/**
 * Fixed bottom tab bar. Carries the iOS home-indicator inset so the tabs
 * stay tappable once installed to the home screen.
 */

const TABS = [
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/", label: "Shelf", Icon: ShelfIcon },
  { href: "/insights", label: "Insights", Icon: InsightsIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-marigold/50 bg-ink pb-safe"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex h-14 flex-col items-center justify-center gap-1",
                  active ? "text-marigold" : "text-paper/55"
                )}
              >
                {/* The active tab is stamped with a marigold rule, not a pill. */}
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute inset-x-0 top-0 h-0.5",
                    active ? "bg-marigold" : "bg-transparent"
                  )}
                />
                <Icon />
                <span className="label-caps text-[10px]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function SearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  );
}

/** Three books standing on a shelf — one leaning, like a real shelf. */
function ShelfIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="4" height="14" rx="1" />
      <rect x="9.5" y="5" width="4" height="14" rx="1" />
      <path d="m16.4 6.6 3.6 1-3 12-3.6-1z" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7.5 15 3.5-4.5 3 2.5L20 7" />
    </svg>
  );
}
