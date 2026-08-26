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
});
