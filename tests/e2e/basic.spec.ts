import { test, expect, Page, BrowserContext } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import { chromium } from 'playwright';

// Test configuration
const BRIDGE_PORT = 5174;
const CDP_PORT = 9222;
const TEST_URL = 'https://github.com';

let bridgeProcess: ChildProcess | null = null;
let testBrowser: BrowserContext | null = null;

test.describe('AXTree Tool E2E Tests', () => {
  test.beforeAll(async () => {
    // Start a Chrome instance with debugging enabled
    testBrowser = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--remote-debugging-port=${CDP_PORT}`],
    });

    // Navigate to test page
    const page = await testBrowser.newPage();
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // Start the bridge process
    bridgeProcess = spawn('pnpm', ['cli', 'connect', '--port', CDP_PORT.toString()], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    // Wait for bridge to start
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  test.afterAll(async () => {
    // Clean up processes
    if (bridgeProcess) {
      bridgeProcess.kill();
    }
    if (testBrowser) {
      await testBrowser.close();
    }
  });

  test('should connect to WebSocket and receive accessibility tree', async ({ page }) => {
    // Navigate to the UI
    await page.goto(`http://localhost:5173`);
    
    // Wait for connection status to show connected
    await expect(page.locator('.connection-status')).toContainText('Connected', { timeout: 10000 });
    
    // Check that tree is loaded
    await expect(page.locator('.tree-content')).toBeVisible();
    
    // Verify tree contains nodes
    const treeNodes = page.locator('[role="treeitem"]');
    await expect(treeNodes).toHaveCountGreaterThan(0);
  });

  test('should display node details when selecting a tree node', async ({ page }) => {
    await page.goto(`http://localhost:5173`);
    
    // Wait for tree to load
    await page.waitForSelector('[role="treeitem"]', { timeout: 10000 });
    
    // Click on the first tree node
    const firstNode = page.locator('[role="treeitem"]').first();
    await firstNode.click();
    
    // Verify details panel shows information
    await expect(page.locator('.node-details')).toBeVisible();
    await expect(page.locator('.detail-item')).toHaveCountGreaterThan(0);
    
    // Check that role is displayed
    const roleElement = page.locator('.detail-item:has-text("Role:")');
    await expect(roleElement).toBeVisible();
  });

  test('should be able to search for nodes', async ({ page }) => {
    await page.goto(`http://localhost:5173`);
    
    // Wait for tree to load
    await page.waitForSelector('[role="treeitem"]', { timeout: 10000 });
    
    // Type in search box
    const searchInput = page.locator('.search-input');
    await searchInput.fill('button');
    
    // Wait for search results
    await page.waitForSelector('.search-results', { timeout: 5000 });
    
    // Verify search results are shown
    await expect(page.locator('.search-results')).toBeVisible();
    await expect(page.locator('.search-result-item')).toHaveCountGreaterThan(0);
    
    // Click on a search result
    const firstResult = page.locator('.search-result-item').first();
    await firstResult.click();
    
    // Verify node details are updated
    await expect(page.locator('.node-details')).toBeVisible();
  });

  test('should be able to highlight nodes in the browser', async ({ page }) => {
    await page.goto(`http://localhost:5173`);
    
    // Wait for tree to load
    await page.waitForSelector('[role="treeitem"]', { timeout: 10000 });
    
    // Click on a tree node to select it
    const treeNode = page.locator('[role="treeitem"]').first();
    await treeNode.click();
    
    // Wait for node details to load
    await expect(page.locator('.node-details')).toBeVisible();
    
    // Verify that backend node ID is present (indicating selection worked)
    const backendNodeId = page.locator('.detail-item:has-text("Backend Node ID:")');
    await expect(backendNodeId).toBeVisible();
    
    // Note: We can't easily test the actual highlighting in the target browser
    // without more complex setup, but we can verify the selection mechanism works
  });

  test('should handle tree updates when page content changes', async ({ page }) => {
    await page.goto(`http://localhost:5173`);
    
    // Wait for initial tree
    await page.waitForSelector('[role="treeitem"]', { timeout: 10000 });
    const initialNodeCount = await page.locator('[role="treeitem"]').count();
    
    // Get reference to the test browser page
    const testPage = testBrowser!.pages()[0];
    
    // Trigger a DOM change in the test browser
    await testPage.evaluate(() => {
      const newDiv = document.createElement('div');
      newDiv.textContent = 'Test Dynamic Content';
      newDiv.setAttribute('aria-label', 'Dynamic test element');
      document.body.appendChild(newDiv);
    });
    
    // Wait a bit for the tree to potentially update
    await page.waitForTimeout(2000);
    
    // Verify the UI is still functional (tree should still be visible)
    await expect(page.locator('.tree-content')).toBeVisible();
    const updatedNodeCount = await page.locator('[role="treeitem"]').count();
    
    // The node count might change due to delta updates
    expect(updatedNodeCount).toBeGreaterThan(0);
  });

  test('should show advanced node details when expanded', async ({ page }) => {
    await page.goto(`http://localhost:5173`);
    
    // Wait for tree to load
    await page.waitForSelector('[role="treeitem"]', { timeout: 10000 });
    
    // Select a node
    const firstNode = page.locator('[role="treeitem"]').first();
    await firstNode.click();
    
    // Look for the advanced details toggle
    const advancedToggle = page.locator('.toggle-advanced');
    
    if (await advancedToggle.isVisible()) {
      // Click to expand advanced details
      await advancedToggle.click();
      
      // Verify advanced details are shown
      await expect(page.locator('.advanced-details')).toBeVisible();
    }
    
    // At minimum, basic details should be visible
    await expect(page.locator('.role-badge')).toBeVisible();
  });
});

// Helper function to wait for bridge startup
async function waitForBridgeReady(port: number, timeout = 10000): Promise<boolean> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.status === 404) {
        // WebSocket endpoint returns 404 for HTTP requests, which is expected
        return true;
      }
    } catch (error) {
      // Connection refused means server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return false;
}