# AXTree Tool

Headless Accessibility Tree Visualization Tool.

This tool allows developers to connect to a running Chrome instance, capture the accessibility tree, and visualize it in a web interface.

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- pnpm
- A running instance of Google Chrome with the remote debugging port open.

To start Chrome with a remote debugging port, you can run the following command (on Windows):
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
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
