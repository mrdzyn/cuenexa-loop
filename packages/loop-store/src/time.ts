const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

/** Strictly parses a real ISO-8601 absolute instant without using local timezone interpretation. */
export function parseIsoInstant(value: string): number | null {
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millisecond = "000", , , offsetHour = "00", offsetMinute = "00"] = match;
  const components = [year, month, day, hour, minute, second, millisecond].map(Number);
  const [y, mo, d, h, mi, s, ms] = components as [number, number, number, number, number, number, number];
  const calendar = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
  const validCalendar =
    calendar.getUTCFullYear() === y && calendar.getUTCMonth() === mo - 1 && calendar.getUTCDate() === d &&
    calendar.getUTCHours() === h && calendar.getUTCMinutes() === mi && calendar.getUTCSeconds() === s &&
    calendar.getUTCMilliseconds() === ms;
  const validOffset = Number(offsetHour) <= 14 && Number(offsetMinute) <= 59 && (Number(offsetHour) < 14 || Number(offsetMinute) === 0);
  const parsed = Date.parse(value);
  return validCalendar && validOffset && Number.isFinite(parsed) ? parsed : null;
}
