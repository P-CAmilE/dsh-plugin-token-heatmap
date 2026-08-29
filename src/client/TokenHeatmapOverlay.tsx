import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SessionRuntime } from "@deepseek-ai/dsh-client-runtime/client";
import { dayKeyOf } from "../day.ts"; // [controller fix]
import type { DailyUsageMap } from "../usage.ts"; // [controller fix]
import { levelsFor } from "./palette.ts";
import { HeatmapGrid } from "./HeatmapGrid.tsx";
import { ICON_MARGIN, ICON_SIZE, ToggleIcon, type IconPosition } from "./ToggleIcon.tsx";
import type { BackfillStatusPayload, TokenHeatmapRemote, UsagePayload } from "./remote.ts";

const LS_VISIBLE = "dsh.tokenHeatmap.visible";
const LS_POSITION = "dsh.tokenHeatmap.position";
const LS_VIEW = "dsh.tokenHeatmap.view";
const POLL_MS = 3000;
/** 失败重试退避：起始与上限。 */
const RETRY_MIN_MS = 300;
const RETRY_MAX_MS = 10000;
const WINDOW_W = 230; // 仅用于弹出位置钳位；实际宽度由内容决定（max-content）
const WINDOW_H = 200;
/** 窗口默认弹出位置与图标之间的间距。 */
const WINDOW_ICON_GAP = 12;
const LS_ICON_POSITION = "dsh.tokenHeatmap.iconPosition";

type View = "global" | "session";

function readVisible(): boolean {
  try { return localStorage.getItem(LS_VISIBLE) === "1"; } catch { return false; }
}

function readPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(LS_POSITION);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { x: number; y: number };
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch { /* ignore */ }
  return null;
}

function readIconPosition(): IconPosition | null {
  try {
    const raw = localStorage.getItem(LS_ICON_POSITION);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { x: number; y: number };
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return { x: parsed.x, y: parsed.y };
  } catch { /* ignore */ }
  return null;
}

function readView(): View {
  try { return localStorage.getItem(LS_VIEW) === "session" ? "session" : "global"; } catch { return "global"; }
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  cursor: "grab",
  userSelect: "none",
  fontSize: 13,
  fontWeight: 600,
};

// 窗口自带面板外壳：所有内容态（网格/加载/错误/空态/回填提示）都在同一面板内渲染。
// 宽度 max-content：窗口贴合最宽内容行，避免与热力图范围差距过大。
const windowStyle: CSSProperties = {
  position: "fixed",
  width: "max-content",
  zIndex: 9990,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  background: "var(--dsw-alias-bg-overlay)",
  border: "1px solid var(--dsw-alias-border-l)",
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  color: "var(--dsw-alias-label-primary)",
  fontSize: 12,
};

// 显隐动画：窗口常驻挂载，仅切换透明度/位移/可见性（隐藏态对无障碍树与指针事件不可见）。
const windowShownStyle: CSSProperties = {
  opacity: 1,
  transform: "none",
  visibility: "visible",
  pointerEvents: "auto",
  transition: "opacity 160ms ease, transform 160ms ease, visibility 0s",
};

const windowHiddenStyle: CSSProperties = {
  opacity: 0,
  transform: "translateY(6px) scale(0.96)",
  visibility: "hidden",
  pointerEvents: "none",
  transition: "opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms",
};

const segmentedStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  border: "1px solid var(--dsw-alias-border-l)",
  borderRadius: 8,
  padding: 2,
};

function segButtonStyle(active: boolean): CSSProperties {
  return {
    border: "none",
    background: active ? "var(--dsw-alias-bg-skeleton)" : "transparent",
    color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
    fontWeight: active ? 700 : 400,
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 11,
    cursor: "pointer",
  };
}

const retryButtonStyle: CSSProperties = {
  border: "1px solid var(--dsw-alias-border-l)",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary)",
  borderRadius: 999,
  padding: "2px 10px",
  fontSize: 11,
  cursor: "pointer",
};

const stateStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 2px",
  fontSize: 12,
  color: "var(--dsw-alias-label-secondary)",
};

export function TokenHeatmapOverlay({ api, sessions }: { api: TokenHeatmapRemote; sessions: SessionRuntime }) {
  const [visible, setVisible] = useState(readVisible);
  const [view, setView] = useState<View>(readView);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(readPosition);
  const [iconPos, setIconPos] = useState<IconPosition | null>(readIconPosition);
  const [data, setData] = useState<UsagePayload>({ version: -1, days: {} });
  const [backfill, setBackfill] = useState<BackfillStatusPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  /** 数据身份 = 视图 + 宿主版本号：全局/会话共享同一版本计数，切换视图时不能沿用另一视图的旧数据。 */
  const dataKeyRef = useRef<string>("");
  const [currentId, setCurrentId] = useState<string | undefined>(() => sessions.list.getSnapshot().current);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    return sessions.list.subscribe(() => setCurrentId(sessions.list.getSnapshot().current));
  }, [sessions]);

  // 可见时轮询（全局或当前会话 + 回填状态合并）；隐藏即停；失败指数退避重试。
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 0; // 0 = 立即首拉
    const schedule = () => { timer = setTimeout(run, delay); };
    const run = async () => {
      if (cancelled) return;
      try {
        const [payload, status] = await Promise.all([
          view === "global" ? api.getGlobalUsage() : currentId !== undefined ? api.getSessionUsage(currentId) : Promise.resolve({ version: -1, days: {} }),
          api.getBackfillStatus(),
        ]);
        if (cancelled) return;
        const key = view + ":" + payload.version;
        if (dataKeyRef.current !== key) {
          dataKeyRef.current = key;
          setData(payload);
        }
        setBackfill(status);
        setError(false);
        setLoading(false);
        delay = POLL_MS;
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[token-heatmap] poll failed:", message);
        setError(true);
        setLoading(false);
        delay = Math.min(Math.max(delay * 2, RETRY_MIN_MS), RETRY_MAX_MS);
      }
      if (!cancelled) schedule();
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [visible, view, currentId, api]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      const next = !v;
      try { localStorage.setItem(LS_VISIBLE, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const switchView = useCallback((next: View) => {
    setView(next);
    try { localStorage.setItem(LS_VIEW, next); } catch { /* ignore */ }
  }, []);

  const defaultPosition = useCallback(() => {
    // 窗口始终位于图标正上方（水平居中）；图标贴近顶部放不下时落到图标下方。
    const iconX = iconPos?.x ?? window.innerWidth - ICON_MARGIN - ICON_SIZE;
    const iconY = iconPos?.y ?? window.innerHeight - ICON_MARGIN - ICON_SIZE;
    const x = Math.min(Math.max(8, iconX + (ICON_SIZE - WINDOW_W) / 2), Math.max(8, window.innerWidth - WINDOW_W - 8));
    const above = iconY - WINDOW_H - WINDOW_ICON_GAP;
    const y = above >= 8
      ? above
      : Math.min(Math.max(8, iconY + ICON_SIZE + WINDOW_ICON_GAP), Math.max(8, window.innerHeight - WINDOW_H - 8));
    return { x, y };
  }, [iconPos]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = positionRef.current ?? defaultPosition();
    const origin = { x: event.clientX, y: event.clientY };
    const onMove = (e: PointerEvent) => {
      const x = Math.min(Math.max(0, start.x + e.clientX - origin.x), window.innerWidth - 60);
      const y = Math.min(Math.max(0, start.y + e.clientY - origin.y), window.innerHeight - 60);
      setPosition({ x, y });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try { localStorage.setItem(LS_POSITION, JSON.stringify(positionRef.current)); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [defaultPosition]);

  const days: DailyUsageMap = data.days;
  const todayKey = dayKeyOf(Date.now());
  const todayTotal = days[todayKey]?.total ?? 0;
  const levelOf = useMemo(() => levelsFor(Object.values(days).map((d) => d.total)), [days]);

  const winPos = position ?? defaultPosition();

  return (
    <>
      <style>{`@media (prefers-reduced-motion: reduce) { [data-th-window] { transition: none !important; } }`}</style>
      <ToggleIcon
        level={levelOf(todayTotal)}
        todayTokens={todayTotal}
        onClick={toggle}
        position={iconPos}
        onPositionChange={(pos, committed) => {
          setIconPos(pos);
          if (committed) {
            try { localStorage.setItem(LS_ICON_POSITION, JSON.stringify(pos)); } catch { /* ignore */ }
            // 拖动过程中窗口实时跟随（winPos = defaultPosition 依赖 iconPos）；
            // 松手后把窗口吸附回图标正上方，清除手动摆放位置。
            setPosition(null);
          }
        }}
      />
      <div
        data-th-window
        style={{ ...windowStyle, left: winPos.x, top: winPos.y, ...(visible ? windowShownStyle : windowHiddenStyle) }}
      >
        <div style={headerStyle} onPointerDown={onPointerDown}>
          <span>Token 热力图</span>
          <div style={segmentedStyle}>
            <button type="button" style={segButtonStyle(view === "global")} aria-pressed={view === "global"} onClick={() => switchView("global")}>全局</button>
            <button type="button" style={segButtonStyle(view === "session")} aria-pressed={view === "session"} onClick={() => switchView("session")}>会话</button>
          </div>
        </div>
        {error ? (
          <div style={stateStyle}>
            <span>数据加载失败</span>
            <button type="button" style={retryButtonStyle} onClick={() => { setError(false); setLoading(true); }}>重试</button>
          </div>
        ) : loading ? (
          <div style={stateStyle}>数据加载中…</div>
        ) : view === "session" && currentId === undefined ? (
          <div style={stateStyle}>当前没有打开的会话</div>
        ) : Object.keys(days).length === 0 && backfill !== null && !backfill.done ? (
          <div style={stateStyle}>正在回填历史数据…</div>
        ) : (
          <HeatmapGrid days={days} />
        )}
        {backfill !== null && backfill.done && backfill.skipped > 0 && (
          <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>回填完成，跳过 {backfill.skipped} 条记录</div>
        )}
      </div>
    </>
  );
}
