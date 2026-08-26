// build.mjs — 双入口构建：宿主 ESM + 客户端 __ModuleLoader__ 包装 bundle
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

// 宿主端：Node ESM，@deepseek-ai/* 全部外部化
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@deepseek-ai/*"],
  outfile: "lib/index.js",
});

// 客户端：CJS 打包（react 与 react/jsx-runtime 外部化，由模块表提供）
const client = await build({
  entryPoints: ["src/client/index.tsx"],
  bundle: true,
  platform: "browser",
  format: "cjs",
  jsx: "automatic",
  target: "es2022",
  external: ["react", "react/jsx-runtime", "@deepseek-ai/*"],
  write: false,
});
const body = client.outputFiles[0].text;
mkdirSync("lib", { recursive: true });
const wrapped = [
  "window.__ModuleLoader__.load({",
  "\tid: \"dsh-plugin-token-heatmap\",",
  "\tfactory: (require) => {",
  "\t\tvar module = { exports: {} };",
  "\t\tvar exports = module.exports;",
  "\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: \"Module\" });",
  body,
  "\t\treturn module.exports;",
  "\t},",
  "});",
  "",
].join("\n");
writeFileSync("lib/client.js", wrapped);
console.log("built lib/index.js and lib/client.js");
