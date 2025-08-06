import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { Bridge } from '@ax/bridge';
import { Recording } from '@ax/core';
import * as fs from 'fs/promises';
import * as path from 'path';

interface RecordOptions {
  port?: string;
  host?: string;
  wsUrl?: string;
  output?: string;
  timeout?: string;
  bridgePort?: string;
}

export function createRecordCommand(): Command {
  const command = new Command('record');
  
  command
    .description('Record accessibility tree changes during user interactions')
    .option('-p, --port <port>', 'Chrome DevTools port (legacy)', '9222')
    .option('-h, --host <host>', 'Chrome DevTools host (legacy)', 'localhost')
    .option('-w, --ws-url <url>', 'WebSocket debugger URL (e.g., ws://localhost:9222/devtools/page/A1B2C3)')
    .option('-o, --output <file>', 'Output file for timeline recording', 'axtree-recording.json')
    .option('-t, --timeout <seconds>', 'Recording timeout in seconds (0 = no timeout)', '0')
    .option('--bridge-port <port>', 'Bridge WebSocket server port (for internal use)')
    .action(async (options: RecordOptions) => {
      try {
        await executeRecord(options);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return command;
}

async function executeRecord(options: RecordOptions): Promise<void> {
  const bridgePort = options.bridgePort ? parseInt(options.bridgePort) : 8081;
  const timeout = parseInt(options.timeout || '0');

  let connectionConfig: any;

  if (options.wsUrl) {
    // Direct WebSocket URL mode
    console.log(chalk.blue('🔍 Validating WebSocket URL...'));
    connectionConfig = await validateAndParseWsUrl(options.wsUrl);
    console.log(chalk.green('✅ WebSocket URL validated'));
  } else {
    // Legacy port-based mode
    const cdpPort = parseInt(options.port!);
    const cdpHost = options.host!;
    
    console.log(chalk.blue('🔍 Validating Chrome DevTools connection...'));
    await validateCdpConnection(cdpHost, cdpPort);
    console.log(chalk.green('✅ Chrome DevTools connection validated'));
    
    connectionConfig = { cdpPort, cdpHost };
  }

  console.log(chalk.blue('🎬 Starting recording session...'));

  // Start the bridge with recording mode enabled
  const bridge = new Bridge({
    port: bridgePort,
    host: 'localhost',
    recordingMode: true, // Enable recording functionality
    ...connectionConfig
  });

  let recording: Recording | null = null;

  // Handle bridge events
  bridge.on('started', async () => {
    console.log(chalk.green('✅ Bridge started successfully'));
    
    try {
      // Get page info for context
      const pageInfo = await getPageInfo(connectionConfig);
      await bridge.startRecording(pageInfo?.url, pageInfo?.title);
      
      console.log(chalk.green('🔴 Recording started!'));
      console.log(chalk.cyan(`   Page: ${pageInfo?.title || 'Unknown'}`));
      console.log(chalk.cyan(`   URL: ${pageInfo?.url || 'Unknown'}`));
      console.log(chalk.yellow('\n👆 Interact with the page in your browser...'));
      console.log(chalk.yellow('Press Ctrl+C to stop recording and save'));
      
      // Set timeout if specified
      if (timeout > 0) {
        setTimeout(() => {
          console.log(chalk.yellow(`\n⏰ Recording timeout (${timeout}s) reached, stopping...`));
          stopRecording();
        }, timeout * 1000);
      }
    } catch (error) {
      console.error(chalk.red('Failed to start recording:'), error);
      process.exit(1);
    }
  });

  bridge.on('timeline-entry-added', (entry) => {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    console.log(chalk.dim(`   [${timestamp}] Timeline entry recorded`));
  });

  bridge.on('recording-stopped', (recordingData: Recording) => {
    recording = recordingData;
    console.log(chalk.green(`\n📊 Recording completed!`));
    console.log(chalk.cyan(`   Duration: ${((recordingData.metadata.endTime - recordingData.metadata.startTime) / 1000).toFixed(1)}s`));
    console.log(chalk.cyan(`   Timeline entries: ${recordingData.timeline.length}`));
  });

  bridge.on('error', (error) => {
    console.error(chalk.red('Bridge error:'), error);
  });

  const stopRecording = async () => {
    try {
      console.log(chalk.yellow('\n🛑 Stopping recording...'));
      
      if (bridge.getRecordingStatus().isRecording) {
        recording = bridge.stopRecording();
      }
      
      await bridge.stop();
      
      if (recording) {
        await saveRecording(recording, options.output!);
      }
      
      console.log(chalk.green('✅ Recording session completed'));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error stopping recording:'), error);
      process.exit(1);
    }
  };

  // Handle graceful shutdown
  process.on('SIGINT', stopRecording);
  process.on('SIGTERM', stopRecording);

  // Start bridge
  await bridge.start();

  // Keep process alive
  await new Promise(() => {});
}

async function saveRecording(recording: Recording, outputPath: string): Promise<void> {
  try {
    const resolvedPath = path.resolve(outputPath);
    const dir = path.dirname(resolvedPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Save recording with pretty formatting
    await fs.writeFile(resolvedPath, JSON.stringify(recording, null, 2));
    
    console.log(chalk.green(`💾 Recording saved to: ${resolvedPath}`));
    
    // Show file size
    const stats = await fs.stat(resolvedPath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(chalk.dim(`   File size: ${sizeKB} KB`));
  } catch (error) {
    console.error(chalk.red('Failed to save recording:'), error);
    throw error;
  }
}

async function getPageInfo(connectionConfig: any): Promise<{ url?: string; title?: string } | null> {
  try {
    let baseUrl: string;
    
    if (connectionConfig.wsUrl) {
      // Extract host from WebSocket URL
      const wsUrl = new URL(connectionConfig.wsUrl);
      baseUrl = `http://${wsUrl.host}`;
    } else {
      baseUrl = `http://${connectionConfig.cdpHost}:${connectionConfig.cdpPort}`;
    }
    
    const response = await fetch(`${baseUrl}/json`);
    if (!response.ok) return null;
    
    const tabs = await response.json() as any[];
    
    // Find the target tab (prefer the one being used or first user tab)
    const targetTab = tabs.find(tab => 
      tab.type === 'page' && 
      !tab.url.startsWith('devtools://')
    );
    
    if (targetTab) {
      return {
        url: targetTab.url,
        title: targetTab.title
      };
    }
    
    return null;
  } catch (error) {
    console.warn(chalk.yellow('Could not get page info:', error));
    return null;
  }
}

async function validateCdpConnection(host: string, port: number): Promise<void> {
  const url = `http://${host}:${port}/json/version`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    console.log(chalk.dim(`   Browser: ${data.Browser || 'Unknown'}`));
    console.log(chalk.dim(`   Protocol: ${data['Protocol-Version'] || 'Unknown'}`));
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to Chrome DevTools at ${host}:${port}.\n` +
        'Make sure Chrome is running with --remote-debugging-port flag:\n' +
        `  chrome --remote-debugging-port=${port} --remote-debugging-address=${host}`
      );
    }
    throw new Error(`Failed to validate CDP connection: ${error.message}`);
  }
}

async function validateAndParseWsUrl(wsUrl: string): Promise<{ wsUrl: string }> {
  try {
    // Parse WebSocket URL
    const url = new URL(wsUrl);
    
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      throw new Error('WebSocket URL must start with ws:// or wss://');
    }

    // Extract host and port for HTTP validation
    const httpUrl = `http://${url.host}/json/version`;
    
    try {
      const response = await fetch(httpUrl);
      if (response.ok) {
        const data = await response.json() as any;
        console.log(chalk.dim(`   Browser: ${data.Browser || 'Unknown'}`));
        console.log(chalk.dim(`   Protocol: ${data['Protocol-Version'] || 'Unknown'}`));
      }
    } catch (error) {
      // HTTP validation failed, but WebSocket might still work
      console.log(chalk.yellow('   Warning: Could not validate via HTTP endpoint'));
    }

    return { wsUrl };
  } catch (error: any) {
    throw new Error(`Invalid WebSocket URL: ${error.message}`);
  }
}