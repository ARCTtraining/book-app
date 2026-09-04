import { describe, expect, it } from "vitest";
import { SAMPLE_CATALOG, filterSampleCatalog, getCatalogBook, spineColor } from "./catalog";
import { dayKey, formatDayRange, parseDay, shiftDay } from "./dates";

describe("filterSampleCatalog", () => {
  it("returns the whole catalogue for an empty query", async () => {
    expect(filterSampleCatalog("")).toHaveLength(SAMPLE_CATALOG.length);
    expect(filterSampleCatalog("   ")).toHaveLength(SAMPLE_CATALOG.length);
  });

  it("matches on title, author, genre and year", async () => {
    expect((filterSampleCatalog("piranesi"))[0].title).toBe("Piranesi");
    expect((filterSampleCatalog("DIDION"))[0].author).toBe("Joan Didion");
    expect((filterSampleCatalog("poetry"))[0].genre).toBe("Poetry");
    expect((filterSampleCatalog("1945"))[0].title).toBe("The Long Ships");
  });

  it("requires every term to match, in any order", async () => {
    const found = filterSampleCatalog("weir hail");
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("Project Hail Mary");
  });

  it("returns nothing for a miss", async () => {
    expect(filterSampleCatalog("zzzzz")).toEqual([]);
  });

  it("ignores accents, ready for real catalogue data", async () => {
    expect((filterSampleCatalog("Ishigúro"))[0].title).toBe("Klara and the Sun");
  });
});

describe("getCatalogBook", () => {
  it("finds by id and returns null otherwise", async () => {
    expect((await getCatalogBook(SAMPLE_CATALOG[0].id))?.title).toBe(
      SAMPLE_CATALOG[0].title
    );
    expect(await getCatalogBook("nope")).toBeNull();
  });
});

describe("spineColor", () => {
  it("uses the fixed colour for a known genre", () => {
    expect(spineColor("Poetry")).toBe("#5A4A6B");
  });

  it("gives unknown genres a stable colour", () => {
    // Colour follows the entity, so a Google Books category must draw the
    // same on the shelf and in the chart, today and tomorrow.
    const messy = "Biography & Autobiography / Personal Memoirs";
    expect(spineColor(messy)).toBe(spineColor(messy));
    expect(spineColor(messy)).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("never returns undefined, whatever the input", () => {
    expect(spineColor("")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("dates", () => {
  it("builds day keys from local components, not UTC", () => {
    // toISOString() would roll the day over at UTC midnight and mis-assign
    // late-evening reading in western time zones.
    const lateEvening = new Date(2026, 2, 14, 23, 30);
    expect(dayKey(lateEvening)).toBe("2026-03-14");
  });

  it("round-trips a day key", () => {
    expect(dayKey(parseDay("2026-03-14"))).toBe("2026-03-14");
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("formats a range compactly within one month", () => {
    expect(formatDayRange("2026-03-12", "2026-03-28")).toBe("12–28 Mar 2026");
  });

  it("spells out both ends across months and years", () => {
    expect(formatDayRange("2026-02-28", "2026-03-04")).toBe("28 Feb – 4 Mar 2026");
    expect(formatDayRange("2025-12-30", "2026-01-04")).toBe(
      "30 Dec 2025 – 4 Jan 2026"
    );
  });
});
