# mySkills

[English](./README.en.md) | [中文](./README.md)

> Manage your personal Skills locally. Deploy them to every Agent.

**mySkills** is a desktop application for **Windows / macOS / Linux** that lets you create and manage personal AI Agent Skills locally, then distribute them to different Agent workspaces. Turn your experience and workflows into reusable Skills and use them across Agents and projects to work faster. Built on Tauri 2 + React, all data stays on your machine; the only optional network request is a version check against GitHub Releases, with no account or cloud service required.

## Features

- **Create and edit personal Skills**: create, edit and preview Skills (`SKILL.md`, with form and source views), turning personal experience and working methods into reusable Skills for everyday efficiency.
- **Central skill library**: uses `~/.myskills/store/` as the only writable source for all local skills.
- **Multi-Agent distribution**: install skills into supported Agent workspaces, preferring symbolic links (symlink) and automatically falling back to copies (copy) when links are not allowed — always showing the active mount mode.
- **Global / project scopes**: supports global skill management as well as per-project management; project scopes are scanned and installed independently, keeping skill configuration isolated between projects.
- **Import external skills**: bring external skills into the central library before managing and distributing them; unknown frontmatter fields are preserved when editing.
- **Bundles**: create, edit and distribute skill bundles, installing them to target Agents in bulk.
- **Backup and migration**: export the central library and metadata to a ZIP backup, and restore from it (same-name skills are confirmed before overwriting during import).
- **Conflict and safety protection**: detects same-name conflicts before installation to avoid silent overwrites; external skills are read-only until imported into the central library; destructive actions require confirmation.
- **Update reminders**: check for new versions on launch (at most once every 24 hours) or manually in Settings → About, where you can open the download page.
- **Local-first**: your skills and settings stay on your machine, with no telemetry or uploads; the only network request is the optional, disableable version check, which reads public release data from GitHub and sends no personal information.

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Radix UI
- **Desktop**: Tauri 2, Rust
- **Platforms**: Windows 10+ / macOS / Linux (desktop)

## Quick start

### Requirements

- Node.js 22.12+
- Rust 1.90+ (a stable toolchain via [rustup](https://rustup.rs/) is recommended)
- Platform dependencies:
  - **Windows**: Microsoft Visual C++ Build Tools, WebView2 (usually preinstalled on Windows 10+)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: Tauri system dependencies such as `webkit2gtk`, `libappindicator` / `libayatana-appindicator`, `librsvg`, `patchelf`, etc. Refer to your distribution and the [Tauri documentation](https://v2.tauri.app/start/prerequisites/) for details.

### Install dependencies and run

```bash
npm install
npm run tauri:dev
```

### Build an installer

```bash
npm run tauri:build
```

The built bundles are written to `src-tauri/target/release/bundle/`.

### Development checks

```bash
npm run verify
```

> Note: `npm run dev` only starts the frontend; outside the Tauri WebView it cannot call local filesystem commands.
> To preview the UI only, append `?demo=1` to the Vite URL to use in-memory demo data (no real files are read or written).

### Linux / Raspberry Pi troubleshooting

- On ARM Linux (including Raspberry Pi OS Bookworm with Wayland), the app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` at startup to avoid garbled first frames when WebKitGTK's DMA-BUF buffers meet the V3D driver.
- To restore the hardware-accelerated path: `WEBKIT_DISABLE_DMABUF_RENDERER=0 ./mySkills`
- If artifacts remain, disable compositing entirely: `WEBKIT_DISABLE_COMPOSITING_MODE=1 ./mySkills`

## Local data

Application data is stored in `~/.myskills/` by default (the environment variable `MYSKILLS_HOME` overrides the app data root; Agent workspace paths remain under the user's home directory):

| Path | Description |
| --- | --- |
| `store/` | Central skill library (the only writable source) |
| `manifest.json` | Metadata for skills, installations, bundles, etc. |
| `settings.json` | Directory authorization, projects and other settings |
| `trash/` | Recovered data from forced removals and similar cases |

## Project structure

```text
.
├─ src/                 # Frontend code (React + TypeScript)
├─ src-tauri/           # Rust backend, Tauri config and resources
├─ public/              # Static assets
├─ package.json
└─ README.md
```

## Development notes

- Run all `npm` / `cargo` commands from this directory (`code/`).

## License

This repository does not include a License file yet; if you plan to release it as open source, add an appropriate license statement.
