import type { Context } from "@deepseek-ai/cordis";
import type { SessionRuntime } from "@deepseek-ai/dsh-client-runtime/client";
import { TokenHeatmapOverlay } from "./TokenHeatmapOverlay.tsx";
import { mountTokenHeatmapRemote, type TokenHeatmapRemote } from "./remote.ts";

export const name = "token-heatmap";
// 客户端 Cordis 声明的 inject 是「服务名」，不是包名（包名写在 package.json 的
// dsh.client.inject 里，由模块系统用于加载顺序）。服务名错误会导致条目永远
// pending（waiting for services）并阻断整个 web boot。
// 对应提供方：slots / sessions ← @deepseek-ai/dsh-client-runtime，remote ← @deepseek-ai/dsh-api-gateway。
export const inject = ["slots", "remote", "sessions"];

export function apply(ctx: Context): void {
  ctx.inject(["slots", "remote", "sessions"], (baseCtx) => {
    const slots = baseCtx.get("slots");
    const remote = baseCtx.get("remote");
    const sessions = baseCtx.get("sessions") as SessionRuntime | undefined;
    if (slots === undefined || remote === undefined || sessions === undefined) return;
    mountTokenHeatmapRemote(baseCtx, remote);
    baseCtx.inject(["remote.tokenHeatmap"], (nsCtx) => {
      const api = nsCtx.get("remote.tokenHeatmap") as TokenHeatmapRemote | undefined;
      if (api === undefined) return;
      slots.inject("shell.overlay", () =>
        slots.register({ name: "shell.overlay", id: "token-heatmap", inject: () => ({ api, sessions }) }, TokenHeatmapOverlay),
      );
    });
  });
}
