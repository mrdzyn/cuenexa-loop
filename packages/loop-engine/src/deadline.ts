/**
 * A small, isolated temporal-phrase resolver, deliberately not a general
 * natural-language date engine (per the Phase 1A brief). Recognizes a
 * fixed set of common relative/absolute phrases and resolves them against
 * a reference instant (`now`). Anything it doesn't recognize is left
 * unresolved — the phrase is still returned so it can be preserved
 * (`dueAtPhrase`) even when `dueAt` stays null. This module never invents
 * a date: an unresolved phrase always yields `dueAt: null`.
 */
export interface DeadlineExtraction {
  /** The raw phrase as it appeared in the source text. */
  phrase: string;
  /** Resolved ISO 8601 instant, or null if the phrase was recognized but not confidently resolvable. */
  dueAt: string | null;
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

type Resolver = (now: Date, match: RegExpMatchArray) => Date | null;

const PATTERNS: Array<{ pattern: RegExp; resolve: Resolver }> = [
  { pattern: /\bby\s+end\s+of\s+day\b/i, resolve: (now) => endOfUtcDay(now) },
  { pattern: /\btomorrow\b/i, resolve: (now) => startOfUtcDay(addDays(now, 1)) },
  { pattern: /\btoday\b/i, resolve: (now) => startOfUtcDay(now) },
  { pattern: /\bnext\s+week\b/i, resolve: (now) => startOfUtcDay(addDays(now, 7)) },
  {
    pattern: /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
    resolve: (now, match) => nextWeekday(now, match[2] ?? "", Boolean(match[1])),
  },
  {
    pattern:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
    resolve: (now, match) => absoluteMonthDay(now, match[1] ?? "", match[2] ?? ""),
  },
];

/** Scans `text` for the first recognized temporal phrase and attempts to resolve it against `now` (ISO 8601). */
export function extractDeadline(text: string, now: string): DeadlineExtraction | null {
  const reference = new Date(now);
  for (const { pattern, resolve } of PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const resolved = resolve(reference, match);
      return { phrase: match[0], dueAt: resolved ? resolved.toISOString() : null };
    }
  }
  return null;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfUtcDay(date: Date): Date {
  const result = new Date(date.getTime());
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function endOfUtcDay(date: Date): Date {
  const result = new Date(date.getTime());
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

/**
 * A bare weekday name resolves to its nearest occurrence on or after
 * `now` (so "Friday" said on a Friday means today). A "next <weekday>"
 * phrase always skips today's occurrence even if today matches, pushing
 * to the following week — a deliberate simplification of a genuinely
 * ambiguous English phrase; see docs/LOOP-DETECTION.md ("Limitations").
 */
function nextWeekday(now: Date, weekdayName: string, isNext: boolean): Date | null {
  const targetIndex = WEEKDAYS.indexOf(weekdayName.toLowerCase());
  if (targetIndex === -1) {
    return null;
  }
  const today = startOfUtcDay(now);
  const currentIndex = today.getUTCDay();
  let diff = (targetIndex - currentIndex + 7) % 7;
  if (diff === 0 && isNext) {
    diff = 7;
  }
  return addDays(today, diff);
}

/** Resolves to the given month/day in the current year, or next year if that date has already passed. */
function absoluteMonthDay(now: Date, monthName: string, day: string): Date | null {
  const monthIndex = MONTHS.indexOf(monthName.toLowerCase());
  const dayNumber = Number.parseInt(day, 10);
  if (monthIndex === -1 || !Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > 31) {
    return null;
  }
  const year = now.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, monthIndex, dayNumber, 0, 0, 0, 0));
  if (candidate.getTime() < startOfUtcDay(now).getTime()) {
    candidate = new Date(Date.UTC(year + 1, monthIndex, dayNumber, 0, 0, 0, 0));
  }
  return candidate;
}
