import type { Context } from "@deepseek-ai/cordis";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import type { Session, SessionEvent } from "@deepseek-ai/dsh-session";
import type { SessionPersistence } from "@deepseek-ai/dsh-session-persistence";
import { dayKeyOf } from "./day.ts";
import { BackfillRunner } from "./backfill.ts";
import { TokenHeatmapService } from "./service.ts";
import { UsageStore } from "./usage-store.ts";

export const name = "token-heatmap";
export const inject: string[] = [];

export function apply(ctx: Context): void {
  const dir = dshHomePath("token-heatmap");
  const store = new UsageStore(dir);
  store.load();

  const persistence = ctx.get("sessionPersistence") as SessionPersistence | undefined;
  const runner = new BackfillRunner(dir, persistence);
  new TokenHeatmapService(ctx, store, () => runner.meta());

  // 实时累计：用量只出现在 assistant/message 事件上（桶互斥）。
  ctx.on("session/event", (session: Session, event: SessionEvent) => {
    if (event.type !== "assistant/message") return;
    const usage = event.data.usage;
    if (usage === undefined) return;
    store.addUsage(
      session.id,
      dayKeyOf(event.time),
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens ?? 0,
      usage.cacheWriteTokens ?? 0,
    );
  });

  // 一次性回填（异步，与实时累计同 map 合并）；done 短路时不得 prune（会清空按会话数据）。
  void runner.run().then((result) => {
    store.applyBackfill(result);
  });

  // 插件卸载时把未落盘的数据写盘（防御节流定时器未触发）。
  // 注：cordis 4 没有 "dispose" 事件（类型与运行时均无），用 fiber effect 挂卸载清理。
  ctx.effect(() => () => store.flush());
}
