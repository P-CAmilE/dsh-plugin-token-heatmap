import { useMemo, type CSSProperties } from "react";
import { cutoffKey, dayKeyOf, DAY_MS, isoWeekday, parseDayKey } from "../day.ts"; // [controller fix]
import { buildWeeks, formatTokens, monthLabels, sumRange, type Cell } from "./grid.ts";
import { LEVEL_COLORS, levelsFor, type Level } from "./palette.ts";
import type { DailyUsageMap } from "../usage.ts"; // [controller fix]

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const style = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 12,
    background: "var(--dsw-alias-bg-overlay)",
    border: "1px solid var(--dsw-alias-border-l)",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
    color: "var(--dsw-alias-label-primary)",
    fontSize: 12,
  } as CSSProperties,
  scroll: { overflowY: "auto", maxHeight: 5 * STEP + 2 } as CSSProperties,
  row: { display: "flex", alignItems: "center", gap: GAP, height: CELL } as CSSProperties,
  label: { width: 30, flex: "0 0 30px", fontSize: 10, color: "var(--dsw-alias-label-tertiary)", textAlign: "right", paddingRight: 4 } as CSSProperties,
  cell: { width: CELL, height: CELL, borderRadius: 3 } as CSSProperties,
  header: { display: "flex", alignItems: "center", gap: GAP } as CSSProperties,
  summary: { display: "flex", gap: 10, fontSize: 11, color: "var(--dsw-alias-label-secondary)" } as CSSProperties,
  legend: { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--dsw-alias-label-tertiary)" } as CSSProperties,
};

export function HeatmapGrid({ days, endKey }: { days: DailyUsageMap; endKey?: string }) {
  const end = endKey ?? dayKeyOf(Date.now());
  const weeks = useMemo(() => buildWeeks(end), [end]);
  const levelOf = useMemo(() => levelsFor(Object.values(days).map((d) => d.total)), [days]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);

  const endTime = parseDayKey(end);
  const todayKey = dayKeyOf(endTime);
  const weekMonday = endTime - (isoWeekday(endTime) - 1) * DAY_MS;
  const monthFirst = dayKeyOf(new Date(endTime).setDate(1));
  const cutoff = cutoffKey(endTime);

  const totals = {
    today: sumRange(days, todayKey, todayKey),
    week: sumRange(days, dayKeyOf(weekMonday), todayKey),
    month: sumRange(days, monthFirst, todayKey),
    year: sumRange(days, cutoff, todayKey),
  };

  return (
    <div style={style.panel}>
      <div style={style.header}>
        <div style={{ ...style.label, visibility: "hidden" }}>x</div>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ width: CELL, textAlign: "center", fontSize: 10, color: "var(--dsw-alias-label-tertiary)" }}>{w}</div>
        ))}
      </div>
      <div style={style.scroll}>
        {weeks.map((week, i) => (
          <div key={week[0].key} data-testid="week-row" style={style.row}>
            <div style={style.label}>{labels[i] ?? ""}</div>
            {week.map((cell) => (
              <DayCell key={cell.key} cell={cell} days={days} levelOf={levelOf} />
            ))}
          </div>
        ))}
      </div>
      <div style={style.summary}>
        <span data-testid="sum-today">{formatTokens(totals.today)}</span>
        <span>本周 {formatTokens(totals.week)}</span>
        <span>本月 {formatTokens(totals.month)}</span>
        <span>12 个月 {formatTokens(totals.year)}</span>
      </div>
      <div data-testid="legend" style={style.legend}>
        <span>少</span>
        {LEVEL_COLORS.map((color) => (
          <span key={color} style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

function DayCell({ cell, days, levelOf }: { cell: Cell; days: DailyUsageMap; levelOf: (v: number) => Level }) {
  const entry = days[cell.key];
  const total = entry?.total ?? 0;
  const level = cell.future ? 0 : levelOf(total);
  const title =
    entry !== undefined && !cell.future
      ? cell.key + " · " + formatTokens(total) + " tokens（输入 " + formatTokens(entry.input) + " / 输出 " + formatTokens(entry.output) + " / 缓存 " + formatTokens(entry.cacheRead + entry.cacheWrite) + "）"
      : cell.key;
  return (
    <div
      data-testid="day-cell"
      data-day={cell.key}
      data-level={level}
      title={title}
      style={{ ...style.cell, background: LEVEL_COLORS[level], opacity: cell.future ? 0.25 : 1 }}
    />
  );
}
