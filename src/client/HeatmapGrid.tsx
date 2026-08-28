import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cutoffKey, dayKeyOf, DAY_MS, isoWeekday, parseDayKey } from "../day.ts"; // [controller fix]
import { buildWeeks, formatTokens, monthLabels, sumRange, type Cell } from "./grid.ts";
import { LEVEL_COLORS, levelsFor, type Level } from "./palette.ts";
import type { DailyUsageMap } from "../usage.ts"; // [controller fix]

const CELL = 12;
const GAP = 4; // 节点上下左右间距一致
const STEP = CELL + GAP;
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const FADE_PX = 10;

interface CellHover {
  key: string;
  total: number;
  input: number;
  output: number;
  cache: number;
  x: number;
  y: number;
}

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
  scroll: {
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: GAP, // 行与行之间的固定间距（此前块级堆叠导致行间距为 0）
    maxHeight: 5 * STEP - GAP,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  } as CSSProperties,
  row: { display: "flex", alignItems: "center", gap: GAP, height: CELL } as CSSProperties,
  label: { width: 30, flex: "0 0 30px", fontSize: 10, color: "var(--dsw-alias-label-tertiary)", textAlign: "right", paddingRight: 4 } as CSSProperties,
  cell: { width: CELL, height: CELL, borderRadius: 3, transformOrigin: "center" } as CSSProperties,
  header: { display: "flex", alignItems: "center", gap: GAP } as CSSProperties,
  summary: { display: "flex", gap: 10, fontSize: 11, color: "var(--dsw-alias-label-secondary)" } as CSSProperties,
  legend: { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--dsw-alias-label-tertiary)" } as CSSProperties,
};

/** 边缘渐隐只在中间滚动位置出现：到顶时顶部无遮罩，到底时底部无遮罩，未溢出则完全无遮罩。 */
function maskOf(topFade: boolean, bottomFade: boolean): string {
  const head = topFade ? `transparent 0, black ${FADE_PX}px` : `black 0`;
  const tail = bottomFade ? `black calc(100% - ${FADE_PX}px), transparent 100%` : `black 100%`;
  return `linear-gradient(to bottom, ${head}, black, ${tail})`;
}

export function HeatmapGrid({ days, endKey }: { days: DailyUsageMap; endKey?: string }) {
  const end = endKey ?? dayKeyOf(Date.now());
  const weeks = useMemo(() => buildWeeks(end), [end]);
  const levelOf = useMemo(() => levelsFor(Object.values(days).map((d) => d.total)), [days]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edgeMask, setEdgeMask] = useState<{ top: boolean; bottom: boolean }>({ top: false, bottom: true });
  const [hover, setHover] = useState<CellHover | null>(null);

  const updateMask = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdgeMask({
      top: el.scrollTop > 0,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);
  useEffect(() => {
    updateMask();
    const el = scrollRef.current;
    el?.addEventListener("scroll", updateMask, { passive: true });
    return () => el?.removeEventListener("scroll", updateMask);
  }, [updateMask]);

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

  const maskImage = maskOf(edgeMask.top, edgeMask.bottom);

  return (
    <div style={style.panel}>
      <style>{`
        [data-th-scroll]::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        [data-th-cell] { transition: transform 120ms ease-out; transform-origin: center; }
        [data-th-cell]:hover { transform: scale(1.4); }
      `}</style>
      <div style={style.header}>
        <div style={{ ...style.label, visibility: "hidden" }}>x</div>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ width: CELL, textAlign: "center", fontSize: 10, color: "var(--dsw-alias-label-tertiary)" }}>{w}</div>
        ))}
      </div>
      <div
        ref={scrollRef}
        data-th-scroll
        style={{ ...style.scroll, maskImage, WebkitMaskImage: maskImage }}
      >
        {weeks.map((week, i) => (
          <div key={week[0].key} data-testid="week-row" style={style.row}>
            <div style={style.label}>{labels[i] ?? ""}</div>
            {week.map((cell) => (
              <DayCell key={cell.key} cell={cell} days={days} levelOf={levelOf} onHover={setHover} />
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
      {hover !== null && (
        <div
          data-testid="cell-tooltip"
          style={{
            position: "fixed",
            left: Math.min(hover.x + 12, Math.max(8, window.innerWidth - 220)),
            top: Math.max(8, hover.y - 66),
            zIndex: 9999,
            pointerEvents: "none",
            background: "var(--dsw-alias-bg-overlay)",
            border: "1px solid var(--dsw-alias-border-l)",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 11,
            color: "var(--dsw-alias-label-primary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600 }}>{hover.key}</div>
          <div>
            {formatTokens(hover.total)} tokens（输入 {formatTokens(hover.input)} / 输出 {formatTokens(hover.output)} / 缓存 {formatTokens(hover.cache)}）
          </div>
        </div>
      )}
    </div>
  );
}

function DayCell({
  cell,
  days,
  levelOf,
  onHover,
}: {
  cell: Cell;
  days: DailyUsageMap;
  levelOf: (v: number) => Level;
  onHover: (info: CellHover | null) => void;
}) {
  const entry = days[cell.key];
  const total = entry?.total ?? 0;
  const level = cell.future ? 0 : levelOf(total);
  return (
    <div
      data-testid="day-cell"
      data-day={cell.key}
      data-level={level}
      data-th-cell
      onMouseEnter={(e) => {
        if (entry !== undefined && !cell.future) {
          onHover({
            key: cell.key,
            total: entry.total,
            input: entry.input,
            output: entry.output,
            cache: entry.cacheRead + entry.cacheWrite,
            x: e.clientX,
            y: e.clientY,
          });
        }
      }}
      onMouseLeave={() => onHover(null)}
      style={{ ...style.cell, background: LEVEL_COLORS[level], opacity: cell.future ? 0.25 : 1 }}
    />
  );
}
