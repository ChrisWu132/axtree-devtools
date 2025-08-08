# AXTree Tool

Headless Accessibility-Tree inspector and timeline debugger for Chromium.

## Quick Start

1. Launch Chrome (or any Chromium-based browser) with the DevTools protocol exposed, e.g.
   ```bash
   chrome --remote-debugging-port=9222  # or edge / brave / chromium
   ```
2. From the project root run
   ```bash
   pnpm cli connect --port 9222        # optional: --output session.json
   ```
   * Live AX Tree view opens at http://localhost:5173
   * Recording starts automatically. Click ⏹️ in the UI header to stop and switch to Timeline playback.

## Everyday Workflow

| Step | Command | What happens |
|------|---------|--------------|
| 1 | `pnpm cli connect --port 9222` | Starts bridge → UI. Live inspector + background recording. |
| 2 | Interact with the page | Tree diffs stream to the UI in real-time. |
| 3 | Click ⏹️ Stop Recording | UI switches to Timeline mode and lets you scrub every frame. |
| 4 | (optional) Save file | Pass `--output my-run.json` to `connect`, or download from the UI. |

## Features

* **Live AXTree Inspector** – inspect the accessibility tree of any running page, even in headless / CI / Docker environments.
* **Incremental Recording** – initial snapshot + JSON-Patch deltas keep session files tiny.
* **Timeline Debugger** – pause, step and scrub through every AX change and user event.
* **Search & Highlight** – fuzzy search nodes; bidirectional highlight between UI and page.
* **Flexible connection** – attach via `--port`, or `--ws-url` to a specific tab.
* **Scriptable** – bridge exposes a stable WebSocket API for automation.

## Development

```bash
pnpm install           # install all packages
pnpm build             # type-check & build all workspaces
pnpm test              # run unit + e2e tests
```

---
MIT License
