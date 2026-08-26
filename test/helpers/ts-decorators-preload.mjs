// Test-infra helper: --import entry for the node:test runner.
//
// Registers the esbuild transform hook (see ts-decorators-hook.mjs) so tests
// can import TS sources that use standard decorators (amaro rejects them).
// Usage: node --import ./test/helpers/ts-decorators-preload.mjs --test "test/**/*.test.ts"

import { load } from "./ts-decorators-hook.mjs";
import { registerHooks } from "node:module";

registerHooks({ load });
