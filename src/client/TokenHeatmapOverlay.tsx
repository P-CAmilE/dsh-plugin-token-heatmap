import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SessionRuntime } from "@deepseek-ai/dsh-client-runtime/client";
import { dayKeyOf } from "../day.ts"; // [controller fix]
import type { DailyUsageMap } from "../usage.ts"; // [controller fix]
import { levelsFor } from "./palette.ts";
import { HeatmapGrid } from "./HeatmapGrid.tsx";
import { ToggleIcon } from "./ToggleIcon.tsx";
import type { BackfillStatusPayload, TokenHeatmapRemote, UsagePayload } from "./remote.ts";

const LS_VISIBLE = "dsh.tokenHeatmap.visible";
const LS_POSITION = "dsh.tokenHeatmap.position";
const LS_VIEW = "dsh.tokenHeatmap.view";
const POLL_MS = 3000;
const WINDOW_W = 190;
const WINDOW_H = 220;

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
  const [currentId, setCurrentId] = useState<string | undefined>(() => sessions.list.getSnapshot().current);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    return sessions.list.subscribe(() => setCurrentId(sessions.list.getSnapshot().current));
  }, [sessions]);

  // 可见时轮询（全局或当前会话）；隐藏即停。
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const payload = view === "global" ? await api.getGlobalUsage() : currentId !== undefined ? await api.getSessionUsage(currentId) : { version: -1, days: {} };
        if (!cancelled) {
          setData((previous) => (previous.version === payload.version ? previous : payload));
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible, view, currentId, api]);

  // 回填状态（打开窗口时拉取，直到 done 为止）。
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await api.getBackfillStatus();
        if (!cancelled) setBackfill(status);
      } catch { /* 忽略 */ }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [visible, api]);

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
    x: Math.max(8, window.innerWidth - WINDOW_W - 76),
    y: Math.max(8, window.innerHeight - WINDOW_H - 68),
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
                <button type="button" style={viewButtonStyle} onClick={() => setError(false)}>重试</button>
              </div>
            ) : view === "session" && currentId === undefined ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>当前没有打开的会话</div>
            ) : (
              <HeatmapGrid days={days} />
            )}
            {backfill !== null && !backfill.done && (
              <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>正在回填历史…</div>
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
