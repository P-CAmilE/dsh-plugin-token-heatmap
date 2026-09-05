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

  it("labels footer totals and hides back-to-latest while at top", () => {
    // 2026-08-24 为周一：本周 = 08-24(10) + 08-25(100) = 110；本月/12个月同窗口亦 110
    render(<HeatmapGrid days={days} endKey="2026-08-25" />);
    const summaryText = screen.getByTestId("summary").textContent ?? "";
    expect(summaryText).toContain("本周 110");
    expect(summaryText).toContain("本月 110");
    expect(summaryText).toContain("12个月 110");
    // 汇总两行两列：无中点分隔符，列轨道跨行共享（上下对齐）
    const summary = screen.getByTestId("summary");
    expect(summary.style.gridTemplateColumns).toBe("max-content max-content");
    expect(summary.style.columnGap).toBe("12px");
    expect(screen.queryAllByText("·").length).toBe(0);
    // 图例两行：色块行在上，少/多标注行在下
    expect(screen.getByText("少")).toBeTruthy();
    expect(screen.getByText("多")).toBeTruthy();
    expect(screen.queryByTestId("back-to-latest")).toBeNull();
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

  it("shows date tooltip on zero-token cells too", () => {
    render(<HeatmapGrid days={days} endKey="2026-08-25" />);
    const cell = document.querySelector('[data-day="2026-08-20"]'); // 无数据非未来日
    expect(cell).toBeTruthy();
    fireEvent.mouseEnter(cell as Element);
    const tooltip = screen.getByTestId("cell-tooltip");
    expect(tooltip.textContent).toContain("2026-08-20");
    expect(tooltip.textContent).toContain("0 tokens");
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

function makeSwitchableSessions(initial: string): SessionRuntime & { switchTo(id: string): void } {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    list: {
      getSnapshot: () => ({ current, ids: [current], byId: {}, phase: "ready", subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    },
    switchTo: (id: string) => { current = id; listeners.forEach((fn) => fn()); },
  } as unknown as SessionRuntime & { switchTo(id: string): void };
}

describe("TokenHeatmapOverlay", () => {
  it("refreshes data when the active session switches even if host version collides", async () => {
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
    ls.set("dsh.tokenHeatmap.view", "session");
    // s1 只有 08-24 非零；s2 只有 08-28 非零；两会话共用宿主版本号 5（全局限源）
    const perSession = {
      s1: { "2026-08-24": { total: 5, input: 5, output: 0, cacheRead: 0, cacheWrite: 0 } },
      s2: { "2026-08-28": { total: 40, input: 40, output: 0, cacheRead: 0, cacheWrite: 0 } },
    } as const;
    const getSessionUsage = vi.fn(async (id: string) => ({ version: 5, days: (perSession as Record<string, unknown>)[id] ?? {} }));
    const api = { getGlobalUsage: async () => ({ version: 5, days: {} }), getSessionUsage, getBackfillStatus: async () => ({ done: true, scanned: 0, skipped: 0, startedAt: null, finishedAt: null }) } as unknown as TokenHeatmapRemote & { getSessionUsage: typeof getSessionUsage };
    const sessions = makeSwitchableSessions("s1");
    render(<TokenHeatmapOverlay api={api} sessions={sessions} />);
    await waitFor(() => expect(document.querySelector("[data-day='2026-08-24']")?.getAttribute("data-level")).toBe("3"));
    sessions.switchTo("s2");
    await waitFor(() => expect(getSessionUsage).toHaveBeenCalledWith("s2"));
    await waitFor(() => {
      expect(document.querySelector("[data-day='2026-08-28']")?.getAttribute("data-level")).toBe("3");
      expect(document.querySelector("[data-day='2026-08-24']")?.getAttribute("data-level")).toBe("0");
    });
  });

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
    // 窗口宽度贴合内容（max-content），不再硬编码 300px 宽
    expect((document.querySelector("[data-th-window]") as HTMLElement).style.width).toBe("max-content");
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
