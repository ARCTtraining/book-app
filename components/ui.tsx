import type { ReactNode } from "react";

/**
 * Shared primitives for the index-card design system.
 *
 * Flat colour, 1px hairline rules, one 4px radius, serif for titles and sans
 * for chrome and data. Nothing here casts a shadow or uses a gradient.
 */

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export { cx };

/** The stamp-circle logo mark, matching the app icon. */
export function StampMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="20" cy="20" r="18.2" fill="none" stroke="#C98A2B" strokeWidth="1.6" />
      <rect x="9.6" y="12.8" width="20.8" height="14.4" rx="1.5" fill="#F1ECDF" />
      <rect x="9.6" y="12.8" width="2.4" height="14.4" fill="#C98A2B" />
      <rect x="14.4" y="17.2" width="12.6" height="1.7" fill="#1B2A41" />
      <rect x="14.4" y="21" width="8.6" height="1.7" fill="#1B2A41" />
    </svg>
  );
}

/**
 * A book's cover, or a blank in its place.
 *
 * Always renders something so rows stay aligned whether or not the
 * catalogue has an image. Bordered and square-cornered like everything
 * else — no shadow, no floating card.
 */
export function Cover({
  url,
  size = "sm",
}: {
  url?: string;
  size?: "sm" | "md";
}) {
  const box = size === "md" ? "h-[66px] w-[44px]" : "h-[54px] w-9";

  // Google appends a page-curl flourish to its thumbnails, which reads as
  // clutter at this size.
  const src = url?.replace(/&edge=curl/g, "");

  return (
    <div
      className={cx(
        "shrink-0 overflow-hidden rounded-card border border-rule bg-paper-dark",
        box
      )}
    >
      {src && (
        // Decorative: the title sits alongside, so a screen reader gains
        // nothing from a second copy of it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="size-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * The core motif: a hairline-bordered card with a coloured spine strip down
 * the left edge, like a book on a shelf or a tab on a catalogue card.
 */
export function IndexCard({
  spine,
  tone = "paper",
  children,
  className,
}: {
  spine: string;
  /** `alt` is the darker stock, used for cards that are the screen's subject. */
  tone?: "paper" | "alt";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex overflow-hidden rounded-card border border-rule",
        tone === "alt" ? "bg-paper-dark" : "bg-paper",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="w-1.5 shrink-0"
        style={{ backgroundColor: spine }}
      />
      <div className="min-w-0 flex-1 px-3.5 py-3">{children}</div>
    </div>
  );
}

/** Section head: small caps label with a hairline rule running off to the right. */
export function SectionHeading({
  children,
  count,
}: {
  children: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <h2 className="label-caps font-sans text-ink">{children}</h2>
      {count !== undefined && (
        <span className="tnum label-caps text-charcoal/45">{count}</span>
      )}
      <span aria-hidden="true" className="h-px flex-1 bg-rule" />
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-paper active:bg-ink/85",
  secondary: "border-rule bg-paper text-ink active:bg-paper-dark",
  quiet: "border-transparent bg-transparent text-charcoal/70 active:text-ink",
  danger: "border-rule bg-paper text-[#8A3A2B] active:bg-paper-dark",
};

/** Shared so links can be dressed as buttons without a polymorphic wrapper. */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  full?: boolean,
  className?: string
): string {
  return cx(
    "label-caps inline-flex min-h-9 items-center justify-center gap-1.5",
    "rounded-card border px-3 py-2 transition-colors",
    "disabled:opacity-40",
    BUTTON_STYLES[variant],
    full && "w-full",
    className
  );
}

export function Button({
  variant = "secondary",
  full,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  full?: boolean;
}) {
  return (
    <button type="button" className={buttonClass(variant, full, className)} {...props} />
  );
}

/** Flat teal progress bar on the darker paper stock. */
export function ProgressBar({
  ratio,
  label,
}: {
  ratio: number;
  label?: string;
}) {
  const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Reading progress"}
      className="h-1.5 w-full border border-rule bg-paper"
    >
      <div className="h-full bg-teal" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Rotated circular stamp used to date finished books — the one piece of
 * deliberate imprecision in the layout.
 */
export function DateStamp({ month, year }: { month: string; year: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex size-14 shrink-0 -rotate-6 flex-col items-center justify-center rounded-full border-2 border-marigold/70 text-marigold"
    >
      <span className="label-caps text-[8px] tracking-[0.18em]">read</span>
      <span className="font-serif text-[13px] leading-tight">{month}</span>
      <span className="tnum text-[9px] leading-none opacity-80">{year}</span>
    </div>
  );
}

/** Key/value line in the small-caps data style used across cards. */
export function MetaLine({ items }: { items: (string | null | undefined)[] }) {
  const shown = items.filter(Boolean) as string[];
  return (
    <p className="label-caps tnum mt-1.5 text-charcoal/55">
      {shown.map((item, i) => (
        <span key={item + i}>
          {i > 0 && <span className="mx-1.5 text-rule">·</span>}
          {item}
        </span>
      ))}
    </p>
  );
}

/** Empty states are invitations, never reprimands. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-rule bg-paper-dark/50 px-4 py-6 text-center">
      <h3 className="font-serif text-[15px] text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-charcoal/70">
        {body}
      </p>
      {action && <div className="mt-3.5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Stands in for content while localStorage is being read.
 *
 * The shelf cannot be known during the server render, so the app shell paints
 * first and the content follows a frame later. Ruled blanks rather than a
 * spinner: it is the shape of what is coming.
 */
export function LoadingRules({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex overflow-hidden rounded-card border border-rule bg-paper"
        >
          <div className="w-1.5 shrink-0 bg-rule" />
          <div className="flex-1 space-y-2 px-3.5 py-4">
            <div className="h-3 w-2/5 bg-paper-dark" />
            <div className="h-2.5 w-1/4 bg-paper-dark" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Serif page title with a sans caption and a closing hairline. */
export function PageTitle({
  title,
  caption,
}: {
  title: string;
  caption?: string;
}) {
  return (
    <header className="hairline-b px-4 pt-4 pb-3">
      <h1 className="font-serif text-2xl leading-none text-ink">{title}</h1>
      {caption && (
        <p className="tnum mt-1.5 text-[12.5px] text-charcoal/60">{caption}</p>
      )}
    </header>
  );
}
