# dsh-plugin-token-heatmap

该插件为每日 Token 用量热力图插件，面向 DeepSeek Harness Web GUI（dsh web profile）。

以 53 周 × 7 天的网格展示每日 token 消耗，右下角常驻一个按当日消耗着色的方形图标，点击展开可拖动的悬浮窗。数据权威在宿主端：安装后自动回填历史会话日志，之后实时累计。

## 功能

- **双数据视图**：「全局」（所有会话合计）与「当前会话」，悬浮窗内切换
- **历史回填**：首次安装自动扫描全部会话日志，把过去的 token 消耗计入热力图
- **实时更新**：窗口可见时每 3 秒轮询，数据带版本号，仅变化时更新
- **5 级蓝色色阶**：12 个月窗口内非零天数按四分位分档，最深色 `#396BE2`
- **竖向网格**：最新一周在顶部，向下滚动回看 12 个月，带「回到最新」浮层
- **悬浮窗交互**：头部拖动、位置 clamp 在视口内、显隐/位置/视图记忆于 localStorage
- **汇总统计**：今日 / 本周 / 本月 / 12 个月合计，tooltip 展示输入 / 输出 / 缓存读写分项
- **主题适配**：深浅主题均正常显示（DSH 主题 token）

## 环境要求

- Node.js ≥ 20，pnpm
- DeepSeek Harness web profile（宿主需提供 `@deepseek-ai/*` 运行时，见 `peerDependencies`）
- 依赖 `@deepseek-ai/*` 为内部私有包，仅能在 DSH 环境内安装

## 构建

```bash
pnpm install
pnpm build          # 产出 lib/index.js（宿主）+ lib/client.js（客户端 bundle）
```

## 验证

```bash
pnpm typecheck      # tsc --noEmit
pnpm test           # node --test，宿主端单元测试
pnpm test:ui        # vitest，客户端组件测试
```

## 安装

```bash
dsh plugin --profile web add dsh-plugin-token-heatmap
```

重启dsh web，右下角出现方形图标即安装成功。首次启动后台执行回填，期间界面可用。

## 数据存储

宿主端持久化在 `$DSH_HOME/token-heatmap/`（即 `~/.dsh/token-heatmap/`）：

| 文件 | 内容 |
|---|---|
| `global.json` | 全局每日用量（近 13 个月） |
| `sessions.json` | 按会话每日用量 |
| `meta.json` | 回填状态（done / scanned / skipped） |

写入策略：内存合并 → 5 秒节流 → 原子写（临时文件 + rename）。文件损坏时从空状态启动并告警，不阻断插件。

## localStorage 键（客户端）

| 键 | 说明 |
|---|---|
| `dsh.tokenHeatmap.visible` | 悬浮窗显隐 |
| `dsh.tokenHeatmap.position` | 悬浮窗位置 |
| `dsh.tokenHeatmap.iconPosition` | 图标位置 |
| `dsh.tokenHeatmap.view` | 视图（global / session） |

## 架构

一个 npm 包、双半区（宿主 + 客户端）：

```
src/
├── index.ts                  # 宿主端入口：实时累计 + 一次性回填
├── usage-store.ts            # 每日聚合存储（节流原子写、13 个月裁剪）
├── backfill.ts               # 会话日志扫描回填
├── service.ts                # TypertRemoteService：tokenHeatmap Remote 服务
├── day.ts                    # 本地时区自然日工具
├── usage.ts                  # 聚合/合并/裁剪纯函数
└── client/
    ├── index.tsx             # 客户端入口：挂载 Remote + shell.overlay
    ├── remote.ts             # 手工 Typert Remote 描述符 + strict 校验器
    ├── TokenHeatmapOverlay.tsx  # 悬浮窗 + 右下角图标
    ├── HeatmapGrid.tsx       # 周×天网格（竖向滚动）
    ├── ToggleIcon.tsx        # 右下角方形图标
    └── palette.ts            # 5 级色阶与四分位映射
```

- **数据通道**：客户端 ↔ 宿主走 Typert Remote 机制（`@Remote` 方法暴露为 `<namespace>/<method>` 端点）；方法有 `getGlobalUsage` / `getSessionUsage` / `getBackfillStatus`
- **UI 注册**：`ctx.slots.inject('shell.overlay', ...)` 挂到根级浮动层
- **用量口径**：input + output + cacheRead + cacheWrite 合并为每日 total 用于着色

## License

[MIT](LICENSE)
