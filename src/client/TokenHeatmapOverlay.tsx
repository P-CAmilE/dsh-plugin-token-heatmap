import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SessionRuntime } from "@deepseek-ai/dsh-client-runtime/client";
import { dayKeyOf } from "../day.ts"; // [controller fix]
import type { DailyUsageMap } from "../usage.ts"; // [controller fix]
import { levelsFor } from "./palette.ts";
import { HeatmapGrid } from "./HeatmapGrid.tsx";
import { ICON_MARGIN, ICON_SIZE, ToggleIcon } from "./ToggleIcon.tsx";
import type { BackfillStatusPayload, TokenHeatmapRemote, UsagePayload } from "./remote.ts";

const LS_VISIBLE = "dsh.tokenHeatmap.visible";
const LS_POSITION = "dsh.tokenHeatmap.position";
const LS_VIEW = "dsh.tokenHeatmap.view";
const POLL_MS = 3000;
/** 失败重试退避：起始与上限。 */
const RETRY_MIN_MS = 300;
const RETRY_MAX_MS = 10000;
const WINDOW_W = 190;
const WINDOW_H = 220;
/** 窗口默认弹出位置相对右下角图标的偏移（左右/上下对称）。 */
const WINDOW_OFFSET = ICON_MARGIN + ICON_SIZE + 12;

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

const windowStyle: CSSProperties = {
  position: "fixed",
  width: WINDOW_W,
  zIndex: 9990,
};

const viewButtonStyle: CSSProperties = {
  border: "1px solid var(--dsw-alias-border-l)",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary)",
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: 11,
  cursor: "pointer",
};

export function TokenHeatmapOverlay({ api, sessions }: { api: TokenHeatmapRemote; sessions: SessionRuntime }) {
  const [visible, setVisible] = useState(readVisible);
  const [view, setView] = useState<View>(readView);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(readPosition);
  const [data, setData] = useState<UsagePayload>({ version: -1, days: {} });
  const [backfill, setBackfill] = useState<BackfillStatusPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
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
        setData((previous) => (previous.version === payload.version ? previous : payload));
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

  const defaultPosition = useCallback(() => ({
    x: Math.max(8, window.innerWidth - WINDOW_W - WINDOW_OFFSET),
    y: Math.max(8, window.innerHeight - WINDOW_H - WINDOW_OFFSET),
  }), []);

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
      <ToggleIcon level={levelOf(todayTotal)} todayTokens={todayTotal} onClick={toggle} />
      {visible && (
        <div style={{ ...windowStyle, left: winPos.x, top: winPos.y }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={headerStyle} onPointerDown={onPointerDown}>
              <span>Token 热力图</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" style={{ ...viewButtonStyle, fontWeight: view === "global" ? 700 : 400 }} onClick={() => switchView("global")}>全局</button>
                <button type="button" style={{ ...viewButtonStyle, fontWeight: view === "session" ? 700 : 400 }} onClick={() => switchView("session")}>会话</button>
                <button type="button" style={viewButtonStyle} onClick={toggle}>×</button>
              </div>
            </div>
            {error ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>
                <span>数据加载失败</span>
                <button type="button" style={viewButtonStyle} onClick={() => { setError(false); setLoading(true); }}>重试</button>
              </div>
            ) : loading ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>数据加载中…</div>
            ) : view === "session" && currentId === undefined ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>当前没有打开的会话</div>
            ) : Object.keys(days).length === 0 && backfill !== null && !backfill.done ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>正在回填历史数据…</div>
            ) : (
              <HeatmapGrid days={days} />
            )}
            {backfill !== null && backfill.done && backfill.skipped > 0 && (
              <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>回填完成，跳过 {backfill.skipped} 条记录</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
