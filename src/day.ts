/** Local-timezone day utilities. All dates use the host/browser local timezone. */
export const DAY_MS = 86_400_000;

/** Format an epoch-ms timestamp as a local 'YYYY-MM-DD' key. */
export function dayKeyOf(time: number): string {
  const d = new Date(time);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

/** Local midnight epoch-ms of the day containing `time`. */
export function startOfLocalDay(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Parse 'YYYY-MM-DD' back to local midnight epoch-ms. */
export function parseDayKey(key: string): number {
  const parts = key.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
}

/** ISO weekday of a local day: 1=Monday … 7=Sunday. */
export function isoWeekday(time: number): number {
  const wd = new Date(time).getDay(); // 0=Sunday
  return wd === 0 ? 7 : wd;
}

/** Cutoff key: the 1st of the month 12 months before `now`'s month (keeps 13 months). */
export function cutoffKey(now: number): string {
  const d = new Date(now);
  return dayKeyOf(new Date(d.getFullYear(), d.getMonth() - 12, 1).getTime());
}
