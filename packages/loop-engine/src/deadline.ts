/**
 * A small, isolated temporal-phrase resolver, deliberately not a general
 * natural-language date engine (per the Phase 1A brief). Recognizes a
 * fixed set of common relative/absolute phrases and resolves them against
 * a reference instant (`now`) **in a specific IANA time zone** — calendar
 * phrases like "today"/"tomorrow"/"by end of day" mean the *local*
 * calendar day where the conversation happened, not the UTC calendar day,
 * which can differ near local-midnight boundaries. Uses only built-in
 * `Intl`/`Date` — no new dependency — see the offset-computation trick in
 * `getTimeZoneOffsetMinutes` below.
 *
 * This module never invents a date: an unresolved phrase always yields
 * `dueAt: null`, and an absolute calendar date that doesn't actually
 * exist (e.g. "September 31") is rejected rather than silently rolled
 * into the next valid date by JS `Date`'s normalization.
 */
export interface DeadlineExtraction {
  /** The raw phrase as it appeared in the source text. */
  phrase: string;
  /** Resolved ISO 8601 instant, or null if the phrase was recognized but not confidently/validly resolvable. */
  dueAt: string | null;
}

interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

type Resolution = { date: CalendarDate; endOfDay?: boolean } | null;
type Resolver = (today: CalendarDate, match: RegExpMatchArray) => Resolution;

const PATTERNS: Array<{ pattern: RegExp; resolve: Resolver }> = [
  { pattern: /\bby\s+end\s+of\s+day\b/i, resolve: (today) => ({ date: today, endOfDay: true }) },
  { pattern: /\btomorrow\b/i, resolve: (today) => ({ date: addCalendarDays(today, 1) }) },
  { pattern: /\btoday\b/i, resolve: (today) => ({ date: today }) },
  { pattern: /\bnext\s+week\b/i, resolve: (today) => ({ date: addCalendarDays(today, 7) }) },
  {
    pattern: /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
    resolve: (today, match) => {
      const date = nextWeekdayDate(today, match[2] ?? "", Boolean(match[1]));
      return date ? { date } : null;
    },
  },
  {
    pattern:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
    resolve: (today, match) => {
      const date = absoluteMonthDayDate(today, match[1] ?? "", match[2] ?? "");
      return date ? { date } : null;
    },
  },
];

/**
 * Scans `text` for the first recognized temporal phrase and attempts to
 * resolve it to an absolute instant, treating `now` as occurring in
 * `timeZone` for the purpose of determining "today". Always returns the
 * matched `phrase` when one is recognized, even when `dueAt` ends up
 * null (unresolvable relative reference, e.g. an unrecognized weekday, or
 * an invalid calendar date).
 */
export function extractDeadline(text: string, now: string, timeZone: string): DeadlineExtraction | null {
  const nowInstant = new Date(now);
  const today = localDateInZone(nowInstant, timeZone);

  for (const { pattern, resolve } of PATTERNS) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }
    const resolution = resolve(today, match);
    if (!resolution) {
      return { phrase: match[0], dueAt: null };
    }
    const instant = resolution.endOfDay ? zonedEndOfDayUTC(resolution.date, timeZone) : zonedMidnightUTC(resolution.date, timeZone);
    return { phrase: match[0], dueAt: instant.toISOString() };
  }

  return null;
}

// --- Time zone conversion -------------------------------------------------
// Standard dependency-free technique: format an instant's wall-clock
// components *as observed in* `timeZone`, then re-interpret those same
// numbers as if they were UTC. The difference between that reinterpreted
// timestamp and the real instant is the zone's UTC offset at that moment
// (correctly reflecting DST, since it's derived from the specific instant
// being formatted, not a fixed offset table).

function getTimeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** The local calendar date (in `timeZone`) that `instant` falls on. */
function localDateInZone(instant: Date, timeZone: string): CalendarDate {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** The UTC instant corresponding to local midnight (00:00:00.000) on `date` in `timeZone`. */
function zonedMidnightUTC(date: CalendarDate, timeZone: string): Date {
  const naiveUtcGuess = new Date(Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(naiveUtcGuess, timeZone);
  return new Date(naiveUtcGuess.getTime() - offsetMinutes * 60_000);
}

/** The UTC instant corresponding to local end-of-day (23:59:59.999) on `date` in `timeZone`. */
function zonedEndOfDayUTC(date: CalendarDate, timeZone: string): Date {
  // A local day can be 23 or 25 hours at a DST boundary. Calculate the
  // next *calendar* midnight in the zone rather than adding 24 hours.
  const nextMidnight = zonedMidnightUTC(addCalendarDays(date, 1), timeZone);
  return new Date(nextMidnight.getTime() - 1);
}

// --- Calendar-date arithmetic (timezone-independent once given Y/M/D) ----

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
}

function isValidCalendarDate(date: CalendarDate): boolean {
  const constructed = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return (
    constructed.getUTCFullYear() === date.year &&
    constructed.getUTCMonth() === date.month - 1 &&
    constructed.getUTCDate() === date.day
  );
}

/**
 * A bare weekday name resolves to its nearest occurrence on or after
 * `today` (so "Friday" said on a Friday means today). A "next <weekday>"
 * phrase always skips today's occurrence even if today matches, pushing
 * to the following week — a deliberate simplification of a genuinely
 * ambiguous English phrase; see docs/LOOP-DETECTION.md ("Limitations").
 */
function nextWeekdayDate(today: CalendarDate, weekdayName: string, isNext: boolean): CalendarDate | null {
  const targetIndex = WEEKDAYS.indexOf(weekdayName.toLowerCase());
  if (targetIndex === -1) {
    return null;
  }
  const currentIndex = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  let diff = (targetIndex - currentIndex + 7) % 7;
  if (diff === 0 && isNext) {
    diff = 7;
  }
  return addCalendarDays(today, diff);
}

/**
 * Resolves to the given month/day in the current year, or next year if
 * that date has already passed — but only if the resulting calendar date
 * actually exists (see `isValidCalendarDate`). "September 31" and
 * "February 30" are always rejected (`null`); "February 29" resolves only
 * in an actual leap year.
 */
function absoluteMonthDayDate(today: CalendarDate, monthName: string, day: string): CalendarDate | null {
  const monthIndex = MONTHS.indexOf(monthName.toLowerCase());
  const dayNumber = Number.parseInt(day, 10);
  if (monthIndex === -1 || !Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > 31) {
    return null;
  }

  let candidate: CalendarDate = { year: today.year, month: monthIndex + 1, day: dayNumber };
  // Validate before comparing/rolling over. Date.UTC normalizes invalid
  // dates (notably 2027-02-29) and would otherwise make a non-leap-year
  // request appear to be a passed March date that can roll into 2028.
  if (!isValidCalendarDate(candidate)) {
    return null;
  }
  if (compareCalendarDates(candidate, today) < 0) {
    candidate = { ...candidate, year: today.year + 1 };
  }

  return isValidCalendarDate(candidate) ? candidate : null;
}
