import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { formatTokens } from "./grid.ts";
import { glyphColorFor, LEVEL_COLORS, type Level } from "./palette.ts";

/** 图标尺寸与默认四周边距：与窗口默认弹出位置的偏移共用同一组常量，保证右下角视觉对称。 */
export const ICON_SIZE = 40;
export const ICON_MARGIN = 28;

export interface IconPosition {
  x: number;
  y: number;
}

/** 拖动位移阈值：小于该值视为点击。 */
const DRAG_THRESHOLD = 5;

const baseIconStyle: CSSProperties = {
  position: "fixed",
  width: ICON_SIZE,
  height: ICON_SIZE,
  borderRadius: 10,
  border: "none",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
  zIndex: 9990,
};

export function ToggleIcon({
  level,
  todayTokens,
  onClick,
  position = null,
  onPositionChange,
}: {
  level: Level;
  todayTokens: number;
  onClick: () => void;
  position?: IconPosition | null;
  onPositionChange?: (pos: IconPosition, committed: boolean) => void;
}) {
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const lastPos = useRef<IconPosition | null>(null);
  const movedRef = useRef(false);

  const cornerPosition = () => ({
    x: window.innerWidth - ICON_MARGIN - ICON_SIZE,
    y: window.innerHeight - ICON_MARGIN - ICON_SIZE,
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const base = position ?? cornerPosition();
    drag.current = { startX: event.clientX, startY: event.clientY, baseX: base.x, baseY: base.y, moved: false };
    movedRef.current = false;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      movedRef.current = true;
      const pos = {
        x: Math.min(Math.max(0, d.baseX + dx), window.innerWidth - ICON_SIZE),
        y: Math.min(Math.max(0, d.baseY + dy), window.innerHeight - ICON_SIZE),
      };
      lastPos.current = pos;
      onPositionChange?.(pos, false);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const d = drag.current;
      drag.current = null;
      if (d?.moved && onPositionChange) {
        const end = lastPos.current ?? cornerPosition();
        onPositionChange(end, true);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleClick = () => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onClick();
  };

  const iconStyle: CSSProperties = position === null
    ? { ...baseIconStyle, background: LEVEL_COLORS[level], right: ICON_MARGIN, bottom: ICON_MARGIN }
    : { ...baseIconStyle, background: LEVEL_COLORS[level], left: position.x, top: position.y };

  return (
    <button
      data-testid="toggle-icon"
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      title={"今日 token：" + formatTokens(todayTokens)}
      style={iconStyle}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ color: glyphColorFor(level) }}>
        <rect x="1" y="10" width="4" height="7" rx="1" fill="currentColor" />
        <rect x="7" y="5" width="4" height="12" rx="1" fill="currentColor" />
        <rect x="13" y="1" width="4" height="16" rx="1" fill="currentColor" />
      </svg>
    </button>
  );
}
