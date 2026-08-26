// Test-infra helper: esbuild transform hook for the node:test runner.
//
// Root cause: Node >=26 type-strips TypeScript with amaro, which rejects
// standard (TC39) decorators such as @Remote in src/service.ts, so the suite
// cannot load TS sources directly. This hook transpiles the project's .ts/.tsx
// sources with esbuild (loader: 'ts'), whose TS transform lowers decorators.
//
// esbuild is imported by bare specifier, resolved relative to this file up to
// the project's node_modules (test/helpers -> <project root>/node_modules).
//
// NOTE: the hook must be fully synchronous: node:test loads test files through
// the sync module path, which inspects the hook result directly (a Promise
// result has no shortCircuit and is rejected).

import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// Project root: <root>/test/helpers/ts-decorators-hook.mjs -> <root>/
const ROOT = new URL("../..", import.meta.url).pathname;

export function load(url, context, nextLoad) {
  const filePath = url.startsWith("file://") ? new URL(url).pathname : null;
  const isProjectTs =
    filePath !== null &&
    filePath.startsWith(ROOT) &&
    !filePath.includes("/node_modules/") &&
    /.tsx?$/.test(filePath);

  if (isProjectTs) {
    const result = transformSync(readFileSync(filePath, "utf8"), {
      loader: filePath.endsWith(".tsx") ? "tsx" : "ts",
      format: "esm",
      target: "node20",
      sourcefile: filePath,
    });
    return { format: "module", source: result.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
