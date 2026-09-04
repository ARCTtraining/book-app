"use client";

import { useState } from "react";
import { useLibrary } from "./LibraryProvider";
import { Button, PageTitle, SectionHeading, cx } from "./ui";

export function SettingsScreen() {
  const { state, updateSettings, loadSampleData, clearAll } = useLibrary();
  const { settings } = state;
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <>
      <PageTitle title="Settings" caption="Prototype build — data stays on this device" />

      <div className="space-y-7 px-4 py-4">
        <section>
          <SectionHeading>Reminders</SectionHeading>
          <div className="divide-y divide-rule rounded-card border border-rule bg-paper">
            <ToggleRow
              label="Daily reading reminder"
              note="A nudge if you have not logged pages by evening."
              checked={settings.remindersEnabled}
              onChange={(remindersEnabled) => updateSettings({ remindersEnabled })}
            />
            <SelectRow
              label="Remind me at"
              value={settings.reminderTime}
              disabled={!settings.remindersEnabled}
              options={["18:00", "20:00", "21:00", "22:00"]}
              onChange={(reminderTime) => updateSettings({ reminderTime })}
            />
            <ToggleRow
              label="Weekly summary"
              note="Sunday recap of pages, books and streak."
              checked={settings.weeklyDigest}
              onChange={(weeklyDigest) => updateSettings({ weeklyDigest })}
            />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-charcoal/55">
            Notifications are not wired up in this prototype — these switches
            record your preference so the flow can be reviewed.
          </p>
        </section>

        <section>
          <SectionHeading>Goals</SectionHeading>
          <div className="rounded-card border border-rule bg-paper px-3.5 py-3">
            <div className="flex items-baseline justify-between">
              <label htmlFor="page-goal" className="text-[14px] text-charcoal">
                Daily page goal
              </label>
              <span className="tnum text-[14px] font-medium text-ink">
                {settings.dailyPageGoal} pp
              </span>
            </div>
            <input
              id="page-goal"
              type="range"
              min={5}
              max={100}
              step={5}
              value={settings.dailyPageGoal}
              onChange={(e) =>
                updateSettings({ dailyPageGoal: Number(e.target.value) })
              }
              className="mt-1"
            />
          </div>
        </section>

        <section>
          <SectionHeading>Data</SectionHeading>
          <div className="space-y-2.5">
            <p className="text-[13px] leading-relaxed text-charcoal/70">
              Your shelf lives in this browser&rsquo;s local storage. Clearing it
              is the quickest way to review the empty states.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={loadSampleData}>Reload sample shelf</Button>
              {confirmingClear ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      clearAll();
                      setConfirmingClear(false);
                    }}
                  >
                    Yes, clear it
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirmingClear(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="danger" onClick={() => setConfirmingClear(true)}>
                  Clear all data
                </Button>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionHeading>About</SectionHeading>
          <dl className="divide-y divide-rule rounded-card border border-rule bg-paper text-[13px]">
            <AboutRow term="Version" detail="0.1 — UI prototype" />
            <AboutRow term="Catalogue" detail="12 sample books (Google Books to follow)" />
            <AboutRow term="Storage" detail="This device only" />
          </dl>
        </section>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[14px] text-charcoal">{label}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-charcoal/55">{note}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-card border p-0.5 transition-colors",
          checked ? "border-ink bg-marigold" : "border-rule bg-paper-dark"
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "block size-4.5 rounded-[2px] border border-ink transition-transform",
            checked ? "translate-x-5 bg-paper" : "translate-x-0 bg-paper"
          )}
        />
      </button>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 px-3.5 py-3 transition-opacity",
        disabled && "opacity-45"
      )}
    >
      <label htmlFor="reminder-time" className="text-[14px] text-charcoal">
        {label}
      </label>
      <select
        id="reminder-time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="tnum rounded-card border border-rule bg-paper-dark px-2 py-1.5 text-[13px] text-ink"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function AboutRow({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="label-caps text-charcoal/55">{term}</dt>
      <dd className="text-charcoal/80">{detail}</dd>
    </div>
  );
}
