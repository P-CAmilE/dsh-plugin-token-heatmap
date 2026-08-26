import type { Context } from "@deepseek-ai/cordis";
import type {
  InvocationDescriptor,
  TypertClientRemote,
  TypertRemoteContribution,
  TypertSchema,
} from "@deepseek-ai/dsh-typert-protocol";
import type { DailyUsageMap } from "../usage.ts"; // [controller fix] src/client/ 下应为 ../usage.ts

export interface UsagePayload {
  version: number;
  days: DailyUsageMap;
}

export interface BackfillStatusPayload {
  done: boolean;
  scanned: number;
  skipped: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/** Typert 网关 RPC 信封：命名空间方法返回 { ok, value } 或 { ok:false, error }（见 dsh-api-gateway client.invoke）。 */
export interface RemoteOk<T> {
  ok: true;
  value: T;
}

export interface RemoteFailure {
  ok: false;
  error: { code: string; message: string; details: Record<string, unknown> };
}

export type RemoteResult<T> = RemoteOk<T> | RemoteFailure;

/** ctx.get('remote.tokenHeatmap') 返回的命名空间服务（信封形态）。 */
export interface TokenHeatmapNamespace {
  getGlobalUsage(): Promise<RemoteResult<UsagePayload>>;
  getSessionUsage(sessionId: string): Promise<RemoteResult<UsagePayload>>;
  getBackfillStatus(): Promise<RemoteResult<BackfillStatusPayload>>;
}

/** UI 消费的业务接口：已解包的信封 value，RPC 失败时 reject（带 code/message）。 */
export interface TokenHeatmapRemote {
  getGlobalUsage(): Promise<UsagePayload>;
  getSessionUsage(sessionId: string): Promise<UsagePayload>;
  getBackfillStatus(): Promise<BackfillStatusPayload>;
}

/** 把命名空间信封适配为业务接口（与出厂消费者模式一致：先查 result.ok，再取 result.value）。 */
export function createTokenHeatmapRemote(ns: TokenHeatmapNamespace): TokenHeatmapRemote {
  const call = async <T,>(pending: Promise<RemoteResult<T>>, method: string): Promise<T> => {
    const result = await pending;
    if (!result.ok) {
      throw new Error(`tokenHeatmap.${method} failed: ${result.error.code}: ${result.error.message}`);
    }
    return result.value;
  };
  return {
    getGlobalUsage: () => call(ns.getGlobalUsage(), "getGlobalUsage"),
    getSessionUsage: (sessionId: string) => call(ns.getSessionUsage(sessionId), "getSessionUsage"),
    getBackfillStatus: () => call(ns.getBackfillStatus(), "getBackfillStatus"),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const daysSchema: TypertSchema<DailyUsageMap> = {
  parse(value: unknown): DailyUsageMap {
    if (!isRecord(value)) throw new Error("usage days must be an object");
    const out: DailyUsageMap = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!isRecord(entry)) throw new Error(`usage day ${key} must be an object`);
      const num = (field: string): number => {
        const n = entry[field];
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
          throw new Error(`usage day ${key}.${field} invalid`);
        }
        return n;
      };
      out[key] = {
        total: num("total"),
        input: num("input"),
        output: num("output"),
        cacheRead: num("cacheRead"),
        cacheWrite: num("cacheWrite"),
      };
    }
    return out;
  },
};

export const usageSchema: TypertSchema<UsagePayload> = {
  parse(value: unknown): UsagePayload {
    if (!isRecord(value)) throw new Error("usage payload must be an object");
    if (typeof value.version !== "number") throw new Error("usage version invalid");
    return { version: value.version, days: daysSchema.parse(value.days) };
  },
};

export const backfillSchema: TypertSchema<BackfillStatusPayload> = {
  parse(value: unknown): BackfillStatusPayload {
    if (!isRecord(value)) throw new Error("backfill status must be an object");
    const num = (field: string): number => {
      const n = value[field];
      return typeof n === "number" ? n : 0;
    };
    return {
      done: value.done === true,
      scanned: num("scanned"),
      skipped: num("skipped"),
      startedAt: typeof value.startedAt === "number" ? value.startedAt : null,
      finishedAt: typeof value.finishedAt === "number" ? value.finishedAt : null,
    };
  },
};

const jsonSchema: TypertSchema<string> = {
  parse(value: unknown): string {
    if (typeof value !== "string") throw new Error("expected string");
    return value;
  },
};

function descriptor(
  method: string,
  parameters: { name: string; wire: string }[],
  result: TypertSchema<unknown>,
): InvocationDescriptor {
  return {
    id: `tokenHeatmap/${method}`,
    service: "tokenHeatmap",
    namespace: "tokenHeatmap",
    method,
    invocation: { kind: "direct" },
    parameters: parameters.map((p) => ({
      name: p.name,
      wire: p.wire,
      source: "json",
      codec: { mode: "strict", typeSymbol: "string", schema: jsonSchema },
    })),
    result: { mode: "strict", typeSymbol: "tokenHeatmap", schema: result },
  };
}

/** 挂载 tokenHeatmap Remote 命名空间；返回 disposer（$mount 完成后才有效）。 */
export function mountTokenHeatmapRemote(ctx: Context, remote: TypertClientRemote): () => void {
  const contribution: TypertRemoteContribution = {
    package: "dsh-plugin-token-heatmap",
    descriptors: [
      descriptor("getGlobalUsage", [], usageSchema),
      descriptor("getSessionUsage", [{ name: "sessionId", wire: "sessionId" }], usageSchema),
      descriptor("getBackfillStatus", [], backfillSchema),
    ],
  };
  let dispose: () => void = () => {};
  void remote.$mount(contribution).then(
    (disposer) => {
      dispose = disposer;
    },
    (error) => {
      console.error("[token-heatmap] remote mount failed:", error);
    },
  );
  // 注: cordis 4 无 "dispose" 事件(类型与运行时均无, 见 src/index.ts), 用 fiber effect 挂卸载清理。
  ctx.effect(() => () => dispose());
  return () => dispose();
}
