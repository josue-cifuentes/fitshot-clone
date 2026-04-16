import { addDays, format, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const GUATEMALA_TZ = "America/Guatemala";

/** Monday 00:00 through next Monday 00:00 (exclusive end) in Guatemala, as UTC Dates for DB filters. */
export function weekRangeUtcContaining(now: Date): { start: Date; end: Date } {
  const z = toZonedTime(now, GUATEMALA_TZ);
  const monday = startOfWeek(z, { weekStartsOn: 1 });
  monday.setHours(0, 0, 0, 0);
  const nextMonday = addDays(monday, 7);
  return {
    start: fromZonedTime(monday, GUATEMALA_TZ),
    end: fromZonedTime(nextMonday, GUATEMALA_TZ),
  };
}

/** Tab title: "Week of MM/dd" for the Monday of that week (Guatemala). */
export function weekSheetTitleForDate(now: Date): string {
  const z = toZonedTime(now, GUATEMALA_TZ);
  const monday = startOfWeek(z, { weekStartsOn: 1 });
  return `Week of ${format(monday, "MM/dd")}`;
}

/** Calendar day key YYYY-MM-DD in Guatemala for a UTC instant. */
export function guatemalaDateKey(utc: Date): string {
  return format(toZonedTime(utc, GUATEMALA_TZ), "yyyy-MM-dd");
}

/** English weekday name in Guatemala for a UTC instant. */
export function guatemalaDayName(utc: Date): string {
  return format(toZonedTime(utc, GUATEMALA_TZ), "EEEE");
}
