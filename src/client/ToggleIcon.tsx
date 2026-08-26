import type { CSSProperties } from "react";
import { formatTokens } from "./grid.ts";
import { LEVEL_COLORS, type Level } from "./palette.ts";

const iconStyle: CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  width: 40,
  height: 40,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
  zIndex: 9990,
};

export function ToggleIcon({ level, todayTokens, onClick }: { level: Level; todayTokens: number; onClick: () => void }) {
  return (
    <button
      data-testid="toggle-icon"
      type="button"
      onClick={onClick}
      title={"今日 token：" + formatTokens(todayTokens)}
      style={{ ...iconStyle, background: LEVEL_COLORS[level] }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="1" y="10" width="4" height="7" rx="1" fill="rgba(255,255,255,0.95)" />
        <rect x="7" y="5" width="4" height="12" rx="1" fill="rgba(255,255,255,0.95)" />
        <rect x="13" y="1" width="4" height="16" rx="1" fill="rgba(255,255,255,0.95)" />
      </svg>
    </button>
  );
}
