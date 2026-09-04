/**
 * Date helpers.
 *
 * Everything the app counts — streaks, pace, months — is measured in *local*
 * calendar days, so day keys are built from local components rather than
 * `toISOString()`, which would roll over at UTC midnight.
 */

/** A local calendar day, YYYY-MM-DD. The unit streaks are counted in. */
export type DayKey = string;

export function dayKey(date: Date): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(): DayKey {
  return dayKey(new Date());
}

export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function shiftDay(key: DayKey, days: number): DayKey {
  return dayKey(addDays(parseDay(key), days));
}

/** Whole days from `from` to `to`, positive when `to` is later. */
export function daysBetween(from: DayKey, to: DayKey): number {
  const ms = parseDay(to).getTime() - parseDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Stores a calendar day as an instant that reads back as the same day
 * everywhere.
 *
 * Midday local is the safe choice: local midnight converted to UTC lands on
 * the previous day east of Greenwich, so a book finished on the 1st would
 * display as the 31st. Paired with `dayOf`, which reads local components
 * back out.
 */
export function isoFromDay(day: DayKey): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

/** The local calendar day an instant falls on. */
export function dayOf(iso: string | undefined): DayKey | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : dayKey(date);
}

/** YYYY-MM, used to bucket the pages-by-month chart. */
export function monthKey(key: DayKey): string {
  return key.slice(0, 7);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Mar" — the chart axis is tight, so no year unless it is ambiguous. */
export function monthLabel(month: string): string {
  const [, m] = month.split("-").map(Number);
  return MONTHS[m - 1] ?? month;
}

/** "12 Mar 2025" — used for finished-date ranges on shelf cards. */
export function formatDay(key: DayKey | undefined): string {
  if (!key) return "—";
  const date = parseDay(key.slice(0, 10));
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12–28 Mar" or "28 Feb – 4 Mar" for a start/finish range. */
export function formatDayRange(
  from: DayKey | undefined,
  to: DayKey | undefined
): string {
  if (!from || !to) return formatDay(to ?? from);
  const a = parseDay(from.slice(0, 10));
  const b = parseDay(to.slice(0, 10));
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  const left = `${a.getDate()} ${MONTHS[a.getMonth()]}${sameYear ? "" : ` ${a.getFullYear()}`}`;
  return `${left} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/** "Today", "Yesterday", "4 days ago" — for the streak line. */
export function relativeDay(key: DayKey): string {
  const delta = daysBetween(key, todayKey());
  if (delta === 0) return "today";
  if (delta === 1) return "yesterday";
  return `${delta} days ago`;
}

/** Single-letter weekday initials for the 7-day streak strip. */
export function weekdayInitial(key: DayKey): string {
  return ["S", "M", "T", "W", "T", "F", "S"][parseDay(key).getDay()];
}
