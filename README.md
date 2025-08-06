# AXTree Tool

Headless Accessibility Tree Visualization Tool.

This tool allows developers to connect to a running Chrome instance, capture the accessibility tree, and visualize it in a web interface.

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- pnpm
- A running instance of Google Chrome with the remote debugging port open.

To start Chrome with a remote debugging port, you can run one of the following commands:

**Windows (PowerShell):**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Windows (CMD):**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Alternative Windows paths:**
```powershell
# If Chrome is installed in Program Files (x86)
& "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# Or if you have Chrome in your user directory
& "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222
```

### Installation

1. Clone the repository.
2. Install dependencies using pnpm:
   ```bash
   pnpm install
   ```

### Usage

The primary command is `connect`, which starts the tool and connects to the specified Chrome instance.

1. **Build the packages:**
   ```bash
   pnpm build
   ```

2. **Run the `connect` command:**
   ```bash
   pnpm cli connect --port 9222
   ```
   * Replace `9222` with the port you used when starting Chrome.
   * This command will:
     1. Start the AXTree bridge server.
     2. Launch the UI development server (by default on `http://localhost:5173`).

3. **Open the UI:**
   Open your web browser and navigate to `http://localhost:5173` to see the accessibility tree.

## Features

*   **Live AXTree Inspector**: Connect to a running Chrome instance and view the accessibility tree in real-time.
*   **Incremental Updates**: The UI efficiently updates using delta payloads as the tree changes.
*   **Rich Node Details**: Inspect detailed properties, attributes, and states for each accessibility node.
*   **Fuzzy Search**: Quickly find nodes by their name, role, or value.
*   **Direct WebSocket URL Connection**: Use the `--ws-url` flag to bypass discovery and connect directly to a Chrome tab.
*   **Dynamic Port Configuration**: Use `--bridge-port` and `--skip-ui` for seamless integration with E2E testing frameworks.

## Current Status

✅ **Phase 1 Complete**: Core & Bridge MVP with connect command
- `@ax/core` package for accessibility tree parsing and manipulation
- `@ax/bridge` package for Chrome DevTools Protocol communication
- `@ax/cli` with connect command to start the bridge and UI

✅ **Phase 2 Complete**: UI Minimum Feature  
- React-based UI with Vite
- WebSocket connection to bridge
- TreeView component using react-arborist
- Node selection and highlighting functionality
- Responsive design with modern styling

✅ **Phase 3 Complete**: Incremental updates & enhanced experience

## Development

- **Run all tests:**
  ```bash
  pnpm test
  ```
- **Run tests in a single run (no watch mode):**
  ```bash
  pnpm test -- --run
  ```
- **Lint all packages:**
  ```bash
  pnpm lint
  ```
