"use client";

import { todayKey, type DayKey } from "@/lib/dates";
import { cx } from "./ui";

/**
 * A started/finished date pair.
 *
 * Native date inputs on purpose: on iOS they open the system wheel picker,
 * which is far better than anything hand-rolled here, and they enforce the
 * `max` themselves. Styled to sit inside an index card rather than look like
 * a browser control.
 */
export function DateFields({
  started,
  finished,
  onChange,
  error,
  startLabel = "Started",
  finishLabel = "Finished",
  showStart = true,
}: {
  started: DayKey | "";
  finished: DayKey | "";
  onChange: (next: { started: DayKey | ""; finished: DayKey | "" }) => void;
  error?: string | null;
  startLabel?: string;
  finishLabel?: string;
  showStart?: boolean;
}) {
  const today = todayKey();

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {showStart && (
          <Field
            label={startLabel}
            value={started}
            max={finished || today}
            onChange={(started) => onChange({ started, finished })}
          />
        )}
        <Field
          label={finishLabel}
          value={finished}
          min={started || undefined}
          max={today}
          onChange={(finished) => onChange({ started, finished })}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12px] leading-snug text-[#8A3A2B]">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: DayKey | "") => void;
}) {
  return (
    <label className="min-w-[8.5rem] flex-1">
      <span className="label-caps block text-charcoal/55">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value as DayKey | "")}
        className={cx(
          "tnum mt-1 w-full rounded-card border border-rule bg-paper px-2 py-1.5",
          "text-[13px] text-ink focus:border-ink focus:outline-none"
        )}
      />
    </label>
  );
}
