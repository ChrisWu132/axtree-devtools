import { test, expect, Browser, Page } from '@playwright/test';
import { chromium } from 'playwright';
import fetch from 'node-fetch';
import { exec, ChildProcess } from 'child_process';
import getPort from 'get-port';
import * as fs from 'fs/promises';
import * as path from 'path';

const CDP_PORT = 9224; // Use a different port to avoid conflict with other tests
const TEST_URL = 'https://example.com'; // Simple page for testing
const OUTPUT_FILE = 'test-recording.json';

let targetBrowser: Browser;
let recordProcess: ChildProcess;
let bridgePort: number;

test.describe('AXTree Recording E2E', () => {

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

    // Wait a bit to ensure page is fully loaded
    await targetPage.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    // Clean up: kill record process
    if (recordProcess) {
      recordProcess.kill('SIGTERM');
    }

    // Close target browser
    if (targetBrowser) {
      await targetBrowser.close();
    }

    // Clean up output file
    try {
      await fs.unlink(OUTPUT_FILE);
    } catch {
      // File might not exist, ignore
    }
  });

  test('should record accessibility tree changes', async () => {
    console.log('Starting recording test...');

    // Start the record command
    const recordCommand = `pnpm cli record --port ${CDP_PORT} --bridge-port ${bridgePort} --output ${OUTPUT_FILE} --timeout 5`;
    console.log(`Running: ${recordCommand}`);
    
    recordProcess = exec(recordCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Record process error:', error);
      }
      if (stdout) console.log('Record stdout:', stdout);
      if (stderr) console.log('Record stderr:', stderr);
    });

    // Wait for recording to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the first page from the target browser context
    const pages = await targetBrowser.contexts()[0]?.pages() || [];
    const targetPage = pages.find(page => page.url().includes('example.com'));
    
    if (targetPage) {
      // Perform some interactions that should change the accessibility tree
      await targetPage.evaluate(() => {
        // Add a button dynamically
        const button = document.createElement('button');
        button.textContent = 'Test Button';
        button.setAttribute('aria-label', 'Test button for accessibility');
        document.body.appendChild(button);
        
        // Change the title
        document.title = 'Modified Title';
        
        // Add an input field
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Test input';
        input.setAttribute('aria-describedby', 'test-desc');
        document.body.appendChild(input);

        // Add description for the input
        const desc = document.createElement('div');
        desc.id = 'test-desc';
        desc.textContent = 'This is a test input field';
        document.body.appendChild(desc);
      });

      // Wait a bit more for changes to be captured
      await targetPage.waitForTimeout(2000);
    }

    // Wait for the recording to timeout and complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify that the recording file was created
    const fileExists = await fs.access(OUTPUT_FILE).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    // Read and validate the recording file
    const recordingData = JSON.parse(await fs.readFile(OUTPUT_FILE, 'utf-8'));
    
    // Validate recording structure
    expect(recordingData).toHaveProperty('metadata');
    expect(recordingData).toHaveProperty('initialSnapshot');
    expect(recordingData).toHaveProperty('timeline');
    
    expect(recordingData.metadata).toHaveProperty('startTime');
    expect(recordingData.metadata).toHaveProperty('endTime');
    expect(recordingData.metadata).toHaveProperty('version');
    
    expect(recordingData.initialSnapshot).toHaveProperty('timestamp');
    expect(recordingData.initialSnapshot).toHaveProperty('tree');
    expect(recordingData.initialSnapshot).toHaveProperty('flatNodes');
    
    expect(Array.isArray(recordingData.timeline)).toBe(true);
    
    // Verify that we captured some timeline entries
    console.log(`Recording captured ${recordingData.timeline.length} timeline entries`);
    expect(recordingData.timeline.length).toBeGreaterThan(0);
    
    // Verify timeline entry structure
    if (recordingData.timeline.length > 0) {
      const entry = recordingData.timeline[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('delta');
      expect(typeof entry.timestamp).toBe('number');
    }

    console.log('Recording validation successful!');
  });

});

// Helper function removed as we inline the page getting logic

async function getWebSocketDebuggerUrl(targetUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`http://localhost:${CDP_PORT}/json`);
    const tabs = await response.json() as any[];
    
    // Find the tab with our target URL
    const targetTab = tabs.find(tab => 
      tab.type === 'page' && 
      tab.url.includes('example.com')
    );
    
    if (targetTab && targetTab.webSocketDebuggerUrl) {
      console.log(`Found WebSocket URL: ${targetTab.webSocketDebuggerUrl}`);
      return targetTab.webSocketDebuggerUrl;
    }
    
    console.warn('Could not find WebSocket debugger URL for target page');
    return null;
  } catch (error) {
    console.error('Error getting WebSocket URL:', error);
    return null;
  }
}