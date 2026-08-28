import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeatmapGrid } from "../src/client/HeatmapGrid.tsx";
import { ToggleIcon } from "../src/client/ToggleIcon.tsx";

const days = {
  "2026-08-25": { total: 100, input: 40, output: 50, cacheRead: 5, cacheWrite: 5 },
  "2026-08-24": { total: 10, input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
};

describe("HeatmapGrid", () => {
  it("renders 53 week rows, newest first", () => {
    const { container } = render(<HeatmapGrid days={days} endKey="2026-08-25" />);
    const rows = container.querySelectorAll("[data-testid='week-row']");
    expect(rows.length).toBe(53);
    const firstCell = rows[0].querySelector("[data-testid='day-cell']");
    expect(firstCell?.getAttribute("data-day")).toBe("2026-08-24");
  });

  it("colors cells by quartile level", () => {
    const { container } = render(<HeatmapGrid days={days} endKey="2026-08-25" />);
    const cells = Array.from(container.querySelectorAll("[data-testid='day-cell']"));
    const high = cells.find((c) => c.getAttribute("data-day") === "2026-08-25");
    const low = cells.find((c) => c.getAttribute("data-day") === "2026-08-24");
    expect(high?.getAttribute("data-level")).toBe("3");
    expect(low?.getAttribute("data-level")).toBe("3"); // 两个非零值无差异 → 中间档
    const empty = cells.find((c) => c.getAttribute("data-day") === "2026-07-01");
    expect(empty?.getAttribute("data-level")).toBe("0");
  });

  it("renders summary numbers and legend", () => {
    render(<HeatmapGrid days={days} endKey="2026-08-25" />);
    expect(screen.getByTestId("sum-today").textContent).toBe("100");
    expect(screen.getByTestId("legend")).toBeTruthy();
  });
});

describe("ToggleIcon", () => {
  it("colors background by level and fires click", () => {
    const onClick = vi.fn();
    render(<ToggleIcon level={4} todayTokens={123} onClick={onClick} />);
    const button = screen.getByTestId("toggle-icon");
    expect(button.style.background).toBe("rgb(57, 107, 226)"); // jsdom 把 #396BE2 归一化为 rgb
    expect(button.title).toContain("123");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reports drag movement and commits on release", () => {
    const onPositionChange = vi.fn();
    // 显式起始位置 (0,0)：拖动位移即位置增量（视口 1024x768，40px 图标，clamp 不触发）
    render(<ToggleIcon level={0} todayTokens={0} onClick={vi.fn()} position={{ x: 0, y: 0 }} onPositionChange={onPositionChange} />);
    const icon = screen.getByTestId("toggle-icon");
    fireEvent.pointerDown(icon, { clientX: 100, clientY: 100 });
    // 起始位置 (0,0)，起点指针 (100,100)：移动量即新位置
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130 });
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 60, y: 30 }, false);
    fireEvent.pointerMove(window, { clientX: 200, clientY: 170 });
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 100, y: 70 }, false);
    fireEvent.pointerUp(window, { clientX: 200, clientY: 170 });
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 100, y: 70 }, true);
  });
});

describe("HeatmapGrid formatting", () => {
  it("formats large totals with K/M suffix", () => {
    const big = { "2026-08-25": { total: 2500000, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    render(<HeatmapGrid days={big} endKey="2026-08-25" />);
    expect(screen.getByTestId("sum-today").textContent).toBe("2M");
  });

  it("hides scrollbar on the week list", () => {
    const { container } = render(<HeatmapGrid days={{}} endKey="2026-08-25" />);
    const scroller = container.querySelector("[data-th-scroll]");
    expect(scroller).toBeTruthy();
    expect((scroller as HTMLElement).style.scrollbarWidth).toBe("none");
    // webkit 滚动条隐藏规则（jsdom 不解析 maskImage 内联样式，渐变遮罩为真实浏览器行为）
    expect(container.querySelector("style")?.textContent).toContain("-webkit-scrollbar");
  });

  it("shows day tooltip on hover with totals", () => {
    render(<HeatmapGrid days={days} endKey="2026-08-25" />);
    const cell = document.querySelector('[data-day="2026-08-25"]');
    expect(cell).toBeTruthy();
    fireEvent.mouseEnter(cell as Element);
    const tooltip = screen.getByTestId("cell-tooltip");
    expect(tooltip.textContent).toContain("2026-08-25");
    expect(tooltip.textContent).toContain("100"); // 当日 total（K/M 无变化）
    fireEvent.mouseLeave(cell as Element);
    expect(screen.queryByTestId("cell-tooltip")).toBeNull();
  });
});
import { TokenHeatmapOverlay } from "../src/client/TokenHeatmapOverlay.tsx";
import type { SessionRuntime } from "@deepseek-ai/dsh-client-runtime/client";
import type { TokenHeatmapRemote } from "../src/client/remote.ts";
import { waitFor } from "@testing-library/react";

function makeFakeApi(): TokenHeatmapRemote & { getSessionUsage: ReturnType<typeof vi.fn> } {
  const globalDays = { "2026-08-25": { total: 100, input: 50, output: 50, cacheRead: 0, cacheWrite: 0 } };
  const sessionDays = {
    "2026-08-25": { total: 10, input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
    "2026-08-24": { total: 5, input: 2, output: 3, cacheRead: 0, cacheWrite: 0 },
  };
  return {
    getGlobalUsage: async () => ({ version: 5, days: globalDays }), // 与会话视图同版本号（宿主全局计数器）
    getSessionUsage: vi.fn(async () => ({ version: 5, days: sessionDays })),
    getBackfillStatus: async () => ({ done: true, scanned: 0, skipped: 0, startedAt: null, finishedAt: null }),
  } as unknown as TokenHeatmapRemote & { getSessionUsage: ReturnType<typeof vi.fn> };
}

function makeFakeSessions(): SessionRuntime {
  const listeners = new Set<() => void>();
  return {
    list: {
      getSnapshot: () => ({ current: "s1", ids: ["s1"], byId: {}, phase: "ready", subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    },
  } as unknown as SessionRuntime;
}

describe("TokenHeatmapOverlay", () => {
  it("refreshes data when switching views even if host version collides", async () => {
    // jsdom 未挂载 localStorage：注入内存 stub（与组件内 try/catch 防御一致）
    const ls = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => ls.get(k) ?? null,
        setItem: (k: string, v: string) => { ls.set(k, v); },
        removeItem: (k: string) => { ls.delete(k); },
        clear: () => ls.clear(),
      },
    });
    ls.set("dsh.tokenHeatmap.visible", "1");
    ls.delete("dsh.tokenHeatmap.view");
    const api = makeFakeApi();
    render(<TokenHeatmapOverlay api={api} sessions={makeFakeSessions()} />);
    // 全局视图渲染（有 2026-08-25）
    await waitFor(() => expect(document.querySelector("[data-day='2026-08-25']")).toBeTruthy());
    // 08-24 全局无数据：单元格存在但 level 0
    expect(document.querySelector("[data-day='2026-08-24']")?.getAttribute("data-level")).toBe("0");
    // 切换到会话视图：版本号相同（5）——若沿用旧视图数据，08-24 仍为 level 0
    fireEvent.click(screen.getByRole("button", { name: "会话" }));
    await waitFor(() => expect(api.getSessionUsage).toHaveBeenCalledWith("s1"));
    await waitFor(() => {
      // 会话数据里 08-24 total=5（唯一非零）→ 中间档 level 3
      expect(document.querySelector("[data-day='2026-08-24']")?.getAttribute("data-level")).toBe("3");
    });
  });
});

