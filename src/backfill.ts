import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { SessionPersistence } from "@deepseek-ai/dsh-session-persistence";
import { cutoffKey, dayKeyOf } from "./day.ts";
import { addUsage, prune, type DailyUsageMap } from "./usage.ts";

export interface BackfillMeta {
  done: boolean;
  scanned: number;
  skipped: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface UsageSample {
  day: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Extract usage samples from one session's event log (pure). */
export function extractSamples(events: readonly SessionEvent[]): UsageSample[] {
  const samples: UsageSample[] = [];
  for (const event of events) {
    if (event.type !== "assistant/message") continue;
    const usage = event.data.usage;
    if (usage === undefined) continue;
    samples.push({
      day: dayKeyOf(event.time),
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cacheReadTokens ?? 0,
      cacheWrite: usage.cacheWriteTokens ?? 0,
    });
  }
  return samples;
}

/** Aggregate one session's samples into both maps (mutates). */
export function aggregateSamples(
  global: DailyUsageMap,
  bySession: Record<string, DailyUsageMap>,
  sessionId: string,
  samples: UsageSample[],
): void {
  const map = bySession[sessionId] ?? (bySession[sessionId] = {});
  for (const sample of samples) {
    addUsage(map, sample.day, sample.input, sample.output, sample.cacheRead, sample.cacheWrite);
    addUsage(global, sample.day, sample.input, sample.output, sample.cacheRead, sample.cacheWrite);
  }
}

export interface BackfillResult {
  global: DailyUsageMap;
  bySession: Record<string, DailyUsageMap>;
  scannedIds: string[];
  scanned: number;
  skipped: number;
}

export class BackfillRunner {
  private readonly dir: string;
  private readonly persistence: SessionPersistence | undefined;

  constructor(dir: string, persistence: SessionPersistence | undefined) {
    this.dir = dir;
    this.persistence = persistence;
  }

  meta(): BackfillMeta {
    try {
      return JSON.parse(readFileSync(join(this.dir, "meta.json"), "utf8")) as BackfillMeta;
    } catch {
      return { done: false, scanned: 0, skipped: 0, startedAt: null, finishedAt: null };
    }
  }

  async run(): Promise<BackfillResult> {
    const prior = this.meta();
    if (prior.done) {
      return { global: {}, bySession: {}, scannedIds: [], scanned: prior.scanned, skipped: prior.skipped };
    }
    if (this.persistence === undefined) {
      this.writeMeta({ done: true, scanned: 0, skipped: 0, startedAt: Date.now(), finishedAt: Date.now() });
      return { global: {}, bySession: {}, scannedIds: [], scanned: 0, skipped: 0 };
    }
    this.writeMeta({ done: false, scanned: 0, skipped: 0, startedAt: Date.now(), finishedAt: null });
    const headers = await this.persistence.list();
    const global: DailyUsageMap = {};
    const bySession: Record<string, DailyUsageMap> = {};
    const scannedIds: string[] = [];
    let skipped = 0;
    for (const header of headers) {
      scannedIds.push(header.id);
      try {
        const { events } = await this.persistence.inspect(header.id);
        aggregateSamples(global, bySession, header.id, extractSamples(events));
      } catch (error) {
        skipped += 1;
        console.error(`[token-heatmap] backfill skipped session ${header.id}:`, error);
      }
    }
    const cutoff = cutoffKey(Date.now());
    prune(global, cutoff);
    for (const map of Object.values(bySession)) prune(map, cutoff);
    this.writeMeta({ done: true, scanned: headers.length, skipped, startedAt: prior.startedAt ?? Date.now(), finishedAt: Date.now() });
    return { global, bySession, scannedIds, scanned: headers.length, skipped };
  }

  private writeMeta(meta: BackfillMeta): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(join(this.dir, "meta.json"), JSON.stringify(meta), "utf8");
    } catch (error) {
      console.error("[token-heatmap] meta write failed:", error);
    }
  }
}
