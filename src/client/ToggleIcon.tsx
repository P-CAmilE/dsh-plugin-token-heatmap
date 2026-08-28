import type { CSSProperties } from "react";
import { formatTokens } from "./grid.ts";
import { LEVEL_COLORS, type Level } from "./palette.ts";

/** 图标尺寸与四周边距：与窗口默认弹出位置的偏移共用同一组常量，保证右下角视觉对称。 */
export const ICON_SIZE = 40;
export const ICON_MARGIN = 28;

const iconStyle: CSSProperties = {
  position: "fixed",
  right: ICON_MARGIN,
  bottom: ICON_MARGIN,
  width: ICON_SIZE,
  height: ICON_SIZE,
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
