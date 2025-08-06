import { test, expect, Browser, Page } from '@playwright/test';
import { chromium } from 'playwright';
import fetch from 'node-fetch';
import { exec, ChildProcess } from 'child_process';
import getPort from 'get-port';

const CDP_PORT = 9223; // Use a different port to avoid conflict with Playwright's own instance
const TEST_URL = 'https://www.google.com';

let targetBrowser: Browser;
let bridgeProcess: ChildProcess;
let bridgePort: number;

test.describe('AXTree Tool E2E', () => {

  test.beforeEach(async () => {
    // 1. Find a free port for the bridge
    bridgePort = await getPort();
    console.log(`Using dynamic bridge port: ${bridgePort}`);

    // 2. Launch a separate browser instance to be the target for our tool
    targetBrowser = await chromium.launch({
      headless: false,
      args: [`--remote-debugging-port=${CDP_PORT}`]
    });
    const targetPage = await targetBrowser.newPage();
    await targetPage.goto(TEST_URL);

    // 3. Get the WebSocket URL of the target page
    const wsUrl = await getWebSocketDebuggerUrl(TEST_URL);
    console.log(`Target page WebSocket URL: ${wsUrl}`);

    // 4. Start the Bridge with dynamic port and skip UI
    bridgeProcess = exec(
      `pnpm cli connect --ws-url "${wsUrl}" --bridge-port ${bridgePort} --skip-ui`,
      { cwd: process.cwd() }
    );
    bridgeProcess.stderr?.on('data', data => console.error(`[Bridge STDERR]: ${data}`));
    bridgeProcess.stdout?.on('data', data => console.log(`[Bridge STDOUT]: ${data}`));

    // 5. Wait for the Bridge to be ready before running tests
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  test.afterEach(async () => {
    // 5. Clean up after each test
    bridgeProcess?.kill('SIGKILL');
    await targetBrowser?.close();
  });

  test('should connect and display the accessibility tree', async ({ page }) => {
    // `page` here is the Playwright-controlled browser visiting our UI with dynamic bridge port
    await page.goto(`http://localhost:5173?bridgePort=${bridgePort}`);

    // Check for the "Connected" status
    await expect(page.locator('.connection-status')).toContainText('Connected', { timeout: 15000 });

    // Check that the tree view is populated
    await expect(page.locator('.tree-content [role="treeitem"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show node details on click', async ({ page }) => {
    await page.goto(`http://localhost:5173?bridgePort=${bridgePort}`);

    // Wait for the tree to be populated
    const firstNode = page.locator('.tree-content [role="treeitem"]').first();
    await firstNode.waitFor({ state: 'visible', timeout: 10000 });
    
    // Click the node and check for details
    await firstNode.click();
    await expect(page.locator('.details-panel .detail-item:has-text("Role:")')).toBeVisible();
  });
});


async function getWebSocketDebuggerUrl(url: string): Promise<string> {
  const response = await fetch(`http://localhost:${CDP_PORT}/json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch CDP targets: ${response.statusText}`);
  }
  const targets = await response.json() as any[];
  
  // Find the first available page target.
  const targetPage = targets.find(t => t.type === 'page' && t.url.includes('google.com'));

  if (!targetPage) {
    console.error('Available targets:', JSON.stringify(targets, null, 2));
    throw new Error(`Could not find a suitable page target for URL: ${url}.`);
  }

  return targetPage.webSocketDebuggerUrl;
}
