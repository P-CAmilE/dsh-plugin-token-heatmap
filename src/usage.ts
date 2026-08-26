/** Daily token totals. `total` always equals input + output + cacheRead + cacheWrite. */
export interface DailyTotals {
  total: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type DailyUsageMap = Record<string, DailyTotals>;

export function emptyTotals(): DailyTotals {
  return { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

/** Add one provider usage sample into `map` under `day` (mutates). */
export function addUsage(
  map: DailyUsageMap,
  day: string,
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
): void {
  const entry = map[day] ?? (map[day] = emptyTotals());
  entry.input += input;
  entry.output += output;
  entry.cacheRead += cacheRead;
  entry.cacheWrite += cacheWrite;
  entry.total = entry.input + entry.output + entry.cacheRead + entry.cacheWrite;
}

/** Merge `source` into `target` (mutates target). */
export function mergeMaps(target: DailyUsageMap, source: DailyUsageMap): void {
  for (const [day, t] of Object.entries(source)) {
    addUsage(target, day, t.input, t.output, t.cacheRead, t.cacheWrite);
  }
}

/** Drop days whose key sorts before `cutoff` ('YYYY-MM-DD' compares lexically). */
export function prune(map: DailyUsageMap, cutoff: string): void {
  for (const key of Object.keys(map)) {
    if (key < cutoff) delete map[key];
  }
}
