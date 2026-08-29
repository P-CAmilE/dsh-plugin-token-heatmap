import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cutoffKey, dayKeyOf, DAY_MS, isoWeekday, parseDayKey } from "../day.ts"; // [controller fix]
import { buildWeeks, formatTokens, monthLabels, sumRange, type Cell } from "./grid.ts";
import { LEVEL_COLORS, levelsFor, type Level } from "./palette.ts";
import type { DailyUsageMap } from "../usage.ts"; // [controller fix]

const CELL = 16;
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

// 面板外壳（底色/边框/圆角/阴影/内边距）由悬浮窗（TokenHeatmapOverlay）持有，
// 本组件只负责内容排版，使加载/错误/空态也能出现在同一面板里。
const style = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontSize: 12,
  } as CSSProperties,
  // 网格块拉伸到窗口内容宽（minWidth 保证月份标签有地儿放），格子组在其内精确居中：
  // 月份标签绝对定位在行左缘，脱离流，不再把格子整体推右。
  gridBlock: {
    display: "flex",
    flexDirection: "column",
    gap: GAP,
    alignSelf: "stretch",
    minWidth: 208,
    position: "relative",
  } as CSSProperties,
  scroll: {
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: GAP, // 行与行之间的固定间距（此前块级堆叠导致行间距为 0）
    // 内边距给悬停放大留出空间，避免首末行/左右列的放大被 scrollport 裁剪；
    // maxHeight 相应加上下 padding，可见行数仍为 5。
    padding: 4,
    maxHeight: 5 * STEP - GAP + 8,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  } as CSSProperties,
  row: { display: "flex", alignItems: "center", gap: GAP, height: CELL, justifyContent: "center", position: "relative" } as CSSProperties,
  label: { width: 30, flex: "0 0 30px", fontSize: 10, color: "var(--dsw-alias-label-tertiary)", textAlign: "right", paddingRight: 4 } as CSSProperties,
  cell: { width: CELL, height: CELL, borderRadius: 3, transformOrigin: "center" } as CSSProperties,
  // 与行同规则：星期标注居中于格子列上方（隐藏占位标签绝对定位，不参与居中计算）
  header: { display: "flex", alignItems: "center", gap: GAP, justifyContent: "center", position: "relative" } as CSSProperties,
  footer: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 } as CSSProperties,
  // 两行两列网格：无中点分隔符，列轨道跨行共享（上下对齐）；
  // 窗口宽度稳定性由 gridBlock minWidth 208 兑底（footer 自然宽 ≤ 208，不随数字位数变化）。
  summary: { display: "grid", gridTemplateColumns: "max-content max-content", columnGap: 12, rowGap: 4, fontSize: 11, color: "var(--dsw-alias-label-secondary)" } as CSSProperties,
  legendBlock: { display: "flex", flexDirection: "column", gap: 3 } as CSSProperties,
  swatches: { display: "flex", gap: 3 } as CSSProperties,
  legendLabels: { display: "flex", justifyContent: "space-between", width: 62, fontSize: 10, color: "var(--dsw-alias-label-tertiary)" } as CSSProperties,
  chip: {
    position: "absolute",
    right: 0,
    bottom: 6,
    border: "1px solid var(--dsw-alias-border-l)",
    background: "var(--dsw-alias-bg-overlay)",
    color: "var(--dsw-alias-label-secondary)",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 10,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  } as CSSProperties,
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

  const backToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: 0, behavior: "smooth" });
    else el.scrollTop = 0;
  }, []);

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
    <div style={style.root}>
      <style>{`
        [data-th-scroll]::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        [data-th-cell] { transition: transform 120ms ease-out; transform-origin: center; }
        [data-th-cell]:hover { transform: scale(1.3); }
      `}</style>
      <div style={style.gridBlock}>
        <div style={style.header}>
          <div style={{ ...style.label, visibility: "hidden", position: "absolute", left: 0 }}>x</div>
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
              <div style={{ ...style.label, position: "absolute", left: 0 }}>{labels[i] ?? ""}</div>
              {week.map((cell) => (
                <DayCell key={cell.key} cell={cell} days={days} levelOf={levelOf} onHover={setHover} />
              ))}
            </div>
          ))}
        </div>
        {edgeMask.top && (
          <button type="button" data-testid="back-to-latest" style={style.chip} onClick={backToLatest}>
            回到最新
          </button>
        )}
      </div>
      <div style={style.footer}>
        <div data-testid="summary" style={style.summary}>
          <span>今日 <span data-testid="sum-today" style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 600 }}>{formatTokens(totals.today)}</span></span>
          <span>本周 {formatTokens(totals.week)}</span>
          <span>本月 {formatTokens(totals.month)}</span>
          <span>12个月 {formatTokens(totals.year)}</span>
        </div>
        <div data-testid="legend" style={style.legendBlock}>
          <div style={style.swatches}>
            {LEVEL_COLORS.map((color) => (
              <span key={color} style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
            ))}
          </div>
          <div style={style.legendLabels}>
            <span>少</span>
            <span>多</span>
          </div>
        </div>
      </div>
      {hover !== null && (
        <div
          data-testid="cell-tooltip"
          style={{
            position: "fixed",
            left: Math.min(hover.x + 12, Math.max(8, window.innerWidth - 220)),
            top: Math.min(Math.max(8, hover.y - 66), Math.max(8, window.innerHeight - 80)),
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
