import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cutoffKey } from "./day.ts";
import { addUsage, mergeMaps, prune, type DailyUsageMap } from "./usage.ts";
import type { BackfillResult } from "./backfill.ts";

const WRITE_DELAY_MS = 5000;

export class UsageStore {
  private readonly dir: string;
  private global: DailyUsageMap = {};
  private bySession: Record<string, DailyUsageMap> = {};
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;

  constructor(dir: string) {
    this.dir = dir;
  }

  getVersion(): number {
    return this.version;
  }

  load(): void {
    const read = <T,>(name: string): T | undefined => {
      try {
        return JSON.parse(readFileSync(join(this.dir, name), "utf8")) as T;
      } catch (error) {
        console.error(`[token-heatmap] failed to load ${name}, starting empty:`, error);
        return undefined;
      }
    };
    this.global = read<{ days?: DailyUsageMap }>("global.json")?.days ?? {};
    this.bySession = read<{ bySession?: Record<string, DailyUsageMap> }>("sessions.json")?.bySession ?? {};
    this.pruneAll();
  }

  addUsage(sessionId: string | null, day: string, input: number, output: number, cacheRead = 0, cacheWrite = 0): void {
    addUsage(this.global, day, input, output, cacheRead, cacheWrite);
    if (sessionId !== null) {
      const map = this.bySession[sessionId] ?? (this.bySession[sessionId] = {});
      addUsage(map, day, input, output, cacheRead, cacheWrite);
    }
    this.version += 1;
    this.scheduleWrite();
  }

  mergeBackfill(global: DailyUsageMap, bySession: Record<string, DailyUsageMap>): void {
    mergeMaps(this.global, global);
    for (const [id, map] of Object.entries(bySession)) {
      mergeMaps(this.bySession[id] ?? (this.bySession[id] = {}), map);
    }
    this.version += 1;
    this.scheduleWrite();
  }

  pruneSessions(liveIds: Set<string>): void {
    for (const id of Object.keys(this.bySession)) {
      if (!liveIds.has(id)) delete this.bySession[id];
    }
  }

  /** 启动时应用回填结果：只有真正枚举过会话库的结果才有资格 prune，否则会清空全部按会话数据。 */
  applyBackfill(result: BackfillResult): void {
    if (result.enumerated) {
      this.pruneSessions(new Set(result.scannedIds));
    }
    this.mergeBackfill(result.global, result.bySession);
    this.flush();
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.pruneAll();
    try {
      mkdirSync(this.dir, { recursive: true });
      this.atomicWrite("global.json", JSON.stringify({ version: 1, days: this.global }));
      this.atomicWrite("sessions.json", JSON.stringify({ version: 1, bySession: this.bySession }));
    } catch (error) {
      console.error("[token-heatmap] store write failed (degraded to memory):", error);
    }
  }

  snapshotGlobal(): DailyUsageMap {
    return this.deepCopy(this.global);
  }

  snapshotSession(id: string): DailyUsageMap {
    return this.deepCopy(this.bySession[id] ?? {});
  }

  private pruneAll(): void {
    const cutoff = cutoffKey(Date.now());
    prune(this.global, cutoff);
    for (const map of Object.values(this.bySession)) prune(map, cutoff);
  }

  private scheduleWrite(): void {
    this.dirty = true;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, WRITE_DELAY_MS);
  }

  private atomicWrite(name: string, content: string): void {
    const target = join(this.dir, name);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, target);
  }

  private deepCopy(map: DailyUsageMap): DailyUsageMap {
    const out: DailyUsageMap = {};
    for (const [key, value] of Object.entries(map)) out[key] = { ...value };
    return out;
  }
}
