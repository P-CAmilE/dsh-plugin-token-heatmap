import { DAY_MS, dayKeyOf, isoWeekday, parseDayKey } from "../day.ts";
import type { DailyUsageMap } from "../usage.ts";

export interface Cell {
  key: string;
  /** 1=Monday … 7=Sunday */
  weekday: number;
  /** 0-11 */
  month: number;
  /** 晚于 endKey 的未来日期（不渲染颜色） */
  future: boolean;
}

/**
 * 生成 count 个 ISO 周（周一起始），下标 0 = 含 endKey 的最新一周，依次向过去。
 */
export function buildWeeks(endKey: string, count = 53): Cell[][] {
  const end = parseDayKey(endKey);
  const endMonday = end - (isoWeekday(end) - 1) * DAY_MS;
  const weeks: Cell[][] = [];
  for (let w = 0; w < count; w += 1) {
    const monday = endMonday - w * 7 * DAY_MS;
    const week: Cell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const t = monday + d * DAY_MS;
      week.push({
        key: dayKeyOf(t),
        weekday: d + 1,
        month: new Date(t).getMonth(),
        future: t > end,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** 每周一个标签：月份取该周（仅计非未来日）占多数的月，与上一行不同时给 'N月'，否则 null；多数持平选最新日所属月。 */
export function monthLabels(weeks: Cell[][]): (string | null)[] {
  let previous: number | null = null;
  return weeks.map((week) => {
    const present = week.filter((c) => !c.future);
    if (present.length === 0) return null;
    const counts = new Map<number, number>();
    for (const c of present) counts.set(c.month, (counts.get(c.month) ?? 0) + 1);
    let anchor = present[0].month;
    let freq = 0;
    for (const c of present) {
      const n = counts.get(c.month) ?? 0;
      if (n > freq) { freq = n; anchor = c.month; }
    }
    const last = present[present.length - 1].month;
    if ((counts.get(last) ?? 0) === freq) anchor = last;
    if (previous === anchor) return null;
    previous = anchor;
    return anchor + 1 + "月";
  });
}

/** 闭区间 [fromKey, toKey] 内的 total 合计。 */
export function sumRange(days: DailyUsageMap, fromKey: string, toKey: string): number {
  let sum = 0;
  for (const [key, value] of Object.entries(days)) {
    if (key >= fromKey && key <= toKey) sum += value.total;
  }
  return sum;
}

/** 紧凑格式化：≥1000 用 K、≥1000000 用 M，换算后小数直接截断（不四舍五入）。 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return Math.floor(n / 1_000_000) + "M";
  if (n >= 1_000) return Math.floor(n / 1_000) + "K";
  return String(Math.floor(n));
}
