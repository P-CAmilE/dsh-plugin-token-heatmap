import type { Context } from "@deepseek-ai/cordis";
import type { SessionRuntime } from "@deepseek-ai/dsh-client-runtime/client";
import { TokenHeatmapOverlay } from "./TokenHeatmapOverlay.tsx";
import { mountTokenHeatmapRemote, type TokenHeatmapRemote } from "./remote.ts";

export const name = "token-heatmap";
export const inject = ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-api-gateway"];

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
