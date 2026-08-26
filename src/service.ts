import type { Context } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { BackfillMeta } from "./backfill.ts";
import type { DailyUsageMap } from "./usage.ts";
import type { UsageStore } from "./usage-store.ts";

export interface UsagePayload {
  version: number;
  days: DailyUsageMap;
}

/** Host Remote service under key/namespace 'tokenHeatmap' (SRC-marker discovery by the API gateway). */
export class TokenHeatmapService extends TypertRemoteService {
  private readonly store: UsageStore;
  private readonly backfillMeta: () => BackfillMeta;

  constructor(ctx: Context, store: UsageStore, backfillMeta: () => BackfillMeta) {
    super(ctx, "tokenHeatmap");
    this.store = store;
    this.backfillMeta = backfillMeta;
  }

  @Remote
  async getGlobalUsage(): Promise<UsagePayload> {
    return { version: this.store.getVersion(), days: this.store.snapshotGlobal() };
  }

  @Remote
  async getSessionUsage(sessionId: string): Promise<UsagePayload> {
    return { version: this.store.getVersion(), days: this.store.snapshotSession(sessionId) };
  }

  @Remote
  async getBackfillStatus(): Promise<BackfillMeta> {
    return this.backfillMeta();
  }
}
