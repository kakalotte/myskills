# mySkills

[English](./README.en.md) | 中文

> 本地管理个人 Skills，快捷部署到每个 Agent

**mySkills** 是一款支持 **Windows / macOS / Linux** 的桌面应用，用于在本地创作与统一管理个人 AI Agent Skills，并将它们快捷分发到不同 Agent 的工作区。你可以把个人经验和工作流沉淀为可复用的 Skill，在不同 Agent 与项目中复用，提升工作效率。应用基于 Tauri 2 + React 构建，所有数据仅存储在本机；唯一的可选联网行为是版本检查，不依赖任何账号或云服务。

## 功能特性

- **个人 Skill 创作与编辑**：支持新建、编辑与预览个人 Skill（`SKILL.md`，提供表单/源码视图），帮助你将个人经验与工作方法沉淀为可复用的 Skill，提升日常工作效率。
- **中央技能库**：以 `~/.myskills/store/` 作为唯一可写来源，集中管理本地技能。
- **多 Agent 分发**：将技能安装到已支持的 Agent 工作区，优先使用符号链接（symlink），在系统不支持时自动回退为复制（copy），并明确显示当前挂载方式。
- **全局 / 项目双作用域**：支持全局技能管理与按项目管理；项目作用域独立扫描与安装，便于在不同项目间隔离技能配置。
- **外部技能导入**：支持导入外部技能到中央库后再统一管理与分发；编辑时可保留未知 frontmatter 字段。
- **技能组合（Bundles）**：创建、编辑与分发技能组合，按目标 Agent 批量安装。
- **备份与迁移**：支持将中央库与元数据导出为 ZIP 备份，并从备份包导入恢复（导入时对同名技能确认后覆盖）。
- **冲突与安全保护**：安装前检测同名冲突，避免静默覆盖；外部技能只读，需先纳入中央库后再分发；破坏性操作需确认。
- **版本提醒**：启动时可自动检查新版本（24 小时内不超过一次），也可随时在「设置 → 关于」手动检查并前往下载页。
- **本地优先**：技能与配置只存在本机，无遥测、无上传；唯一的联网行为是可关闭的版本检查，只读取 GitHub 公开版本信息，不发送个人数据。

## 技术栈

- **前端**：React 19、TypeScript、Vite、Tailwind CSS 4、Zustand、Radix UI
- **桌面端**：Tauri 2、Rust
- **平台**：Windows 10+ / macOS / Linux（桌面端）

## 快速开始

### 环境要求

- Node.js 22.12+
- Rust 1.90+（建议通过 [rustup](https://rustup.rs/) 安装稳定工具链）
- 平台依赖：
  - **Windows**：Microsoft Visual C++ Build Tools、WebView2（Windows 10+ 通常已内置）
  - **macOS**：Xcode Command Line Tools（`xcode-select --install`）
  - **Linux**：Tauri 所需系统依赖（如 `webkit2gtk`、`libappindicator`/`libayatana-appindicator`、`librsvg`、`patchelf` 等，具体以发行版和 [Tauri 文档](https://v2.tauri.app/start/prerequisites/) 为准）

### 安装依赖与运行

```bash
npm install
npm run tauri:dev
```

### 构建安装包

```bash
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

### 开发检查

```bash
npm run verify
```

> 说明：`npm run dev` 仅启动前端页面，脱离 Tauri WebView 时无法调用本地文件系统命令。  
> 如需仅预览界面，可在 Vite 地址后附加 `?demo=1` 使用内存演示数据（不读写真实文件）。

### Linux / 树莓派排障

- ARM Linux（包括 Raspberry Pi OS Bookworm 的 Wayland 会话）启动时会自动设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1`，避开 WebKitGTK 的 DMA-BUF 缓冲在 V3D 驱动上导致的首帧花屏。
- 如需恢复硬件加速路径：`WEBKIT_DISABLE_DMABUF_RENDERER=0 ./mySkills`
- 若仍有残影或条纹，可强制关闭合成加速：`WEBKIT_DISABLE_COMPOSITING_MODE=1 ./mySkills`

## 本地数据

应用数据默认存储在 `~/.myskills/`（可通过环境变量 `MYSKILLS_HOME` 覆盖应用数据根目录；Agent 工作区路径仍位于用户目录下）：

| 路径 | 说明 |
| --- | --- |
| `store/` | 中央技能库（唯一可写来源） |
| `manifest.json` | 技能、安装记录、组合等元数据 |
| `settings.json` | 目录授权、项目等设置 |
| `trash/` | 强制卸载等场景的回收数据 |

## 项目结构

```text
.
├─ src/                 # 前端代码（React + TypeScript）
├─ src-tauri/           # Rust 后端、Tauri 配置与资源
├─ public/              # 静态资源
├─ package.json
└─ README.md
```

## 开发说明

- 在本目录（`code/`）下运行 `npm` / `cargo` 相关命令。

## License

当前仓库未包含 License 文件；如需开源发布，请根据实际情况补充许可证声明。
