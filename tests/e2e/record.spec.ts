import { test, expect, Browser } from '@playwright/test';
import { chromium } from 'playwright';
import { exec, ChildProcess } from 'child_process';
import getPort from 'get-port';
import * as fs from 'fs/promises';

const CDP_PORT = 9224; // Use a different port to avoid conflict with other tests
const TEST_URL = 'https://example.com'; // Simple page for testing
const OUTPUT_FILE = 'test-recording.json';

let targetBrowser: Browser;
let connectProcess: ChildProcess;
let bridgePort: number;

test.describe('AXTree Recording E2E (via connect)', () => {
  test.beforeEach(async () => {
    bridgePort = await getPort();

    targetBrowser = await chromium.launch({
      headless: false,
      args: [`--remote-debugging-port=${CDP_PORT}`]
    });
    const targetPage = await targetBrowser.newPage();
    await targetPage.goto(TEST_URL);
    await targetPage.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    if (connectProcess) {
      connectProcess.kill('SIGTERM');
    }
    if (targetBrowser) {
      await targetBrowser.close();
    }
    try {
      await fs.unlink(OUTPUT_FILE);
    } catch {}
  });

  test('should record accessibility tree changes (connect with auto-record)', async () => {
    const command = `pnpm cli connect --port ${CDP_PORT} --bridge-port ${bridgePort} --output ${OUTPUT_FILE} --skip-ui`;
    connectProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Connect process error:', error);
      }
      if (stdout) console.log('Connect stdout:', stdout);
      if (stderr) console.log('Connect stderr:', stderr);
    });

    // Wait for the bridge to be ready
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Interact with target page to cause AX changes
    const pages = await targetBrowser.contexts()[0]?.pages() || [];
    const targetPage = pages.find(page => page.url().includes('example.com'));
    if (targetPage) {
      await targetPage.evaluate(() => {
        const button = document.createElement('button');
        button.textContent = 'Test Button';
        button.setAttribute('aria-label', 'Test button for accessibility');
        document.body.appendChild(button);

        document.title = 'Modified Title';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Test input';
        input.setAttribute('aria-describedby', 'test-desc');
        document.body.appendChild(input);

        const desc = document.createElement('div');
        desc.id = 'test-desc';
        desc.textContent = 'This is a test input field';
        document.body.appendChild(desc);
      });

      await targetPage.waitForTimeout(2000);
    }

    // Stop connect to trigger cleanup and file persist
    connectProcess.kill('SIGTERM');

    // Wait for file to be written
    await new Promise(resolve => setTimeout(resolve, 2000));

    const fileExists = await fs.access(OUTPUT_FILE).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const recordingData = JSON.parse(await fs.readFile(OUTPUT_FILE, 'utf-8'));
    expect(recordingData).toHaveProperty('metadata');
    expect(recordingData).toHaveProperty('initialSnapshot');
    expect(recordingData).toHaveProperty('timeline');
    expect(Array.isArray(recordingData.timeline)).toBe(true);
  });
});