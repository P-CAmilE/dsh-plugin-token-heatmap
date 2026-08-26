import { defineConfig, defaultExclude } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // node:test 逻辑测试只由 `pnpm test`（node --test）运行；vitest 仅收集 React 组件测试
    // （*.test.tsx）。否则 node:test 文件在 vitest 中报 "No test suite found" 并使退出码非 0。
    exclude: [...defaultExclude, "test/**/*.test.ts"],
  },
});
