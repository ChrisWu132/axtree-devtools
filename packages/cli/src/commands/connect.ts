import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { Bridge } from '@ax/bridge';
import { spawn, ChildProcess } from 'child_process';

interface ConnectOptions {
  port?: string;
  host?: string;
  wsUrl?: string;
  uiPort: string;
  uiHost: string;
  bridgePort?: string;
  skipUi?: boolean;
  noRecord?: boolean;
  output?: string;
}

export function createConnectCommand(): Command {
  const command = new Command('connect');
  
  command
    .description('Connect to Chrome DevTools with live monitoring & auto-recording')
    .option('-p, --port <port>', 'Chrome DevTools port (legacy)', '9222')
    .option('-h, --host <host>', 'Chrome DevTools host (legacy)', 'localhost')
    .option('-w, --ws-url <url>', 'WebSocket debugger URL (e.g., ws://localhost:9222/devtools/page/A1B2C3)')
    .option('--ui-port <port>', 'UI development server port', '5173')
    .option('--ui-host <host>', 'UI development server host', 'localhost')
    .option('--bridge-port <port>', 'Bridge WebSocket server port')
    .option('--skip-ui', 'Skip starting UI development server (useful for testing)')
    .option('--no-record', 'Disable auto-recording (live mode only)')
    .option('-o, --output <file>', 'Save recording to file when stopped')
    .action(async (options: ConnectOptions) => {
      try {
        await executeConnect(options);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return command;
}

async function executeConnect(options: ConnectOptions): Promise<void> {
  const uiPort = parseInt(options.uiPort);
  // Use provided bridge port, or default to uiPort + 1
  const bridgePort = options.bridgePort ? parseInt(options.bridgePort) : uiPort + 1;

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

  console.log(chalk.blue('🌉 Starting AXTree bridge...'));

  // Start the bridge with recording enabled by default
  const bridge = new Bridge({
    port: bridgePort,
    host: 'localhost',
    recordingMode: !options.noRecord, // Default true unless --no-record
    ...connectionConfig
  });

  // Handle bridge events
  bridge.on('started', () => {
    console.log(chalk.green('✅ Bridge started successfully'));
    console.log(chalk.cyan(`🔗 WebSocket server running on ws://localhost:${bridgePort}/ax-tree`));
  });

  bridge.on('error', (error) => {
    console.error(chalk.red('Bridge error:'), error);
  });

  bridge.on('stopped', () => {
    console.log(chalk.yellow('Bridge stopped'));
  });

  // Handle recording events if recording is enabled
  if (!options.noRecord) {
    bridge.on('recording-stopped', async (recording) => {
      console.log(chalk.green('📹 Recording stopped'));
      console.log(chalk.cyan(`   Duration: ${((recording.metadata.endTime - recording.metadata.startTime) / 1000).toFixed(1)}s`));
      console.log(chalk.cyan(`   Timeline entries: ${recording.timeline.length}`));
      
      if (options.output) {
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          
          const resolvedPath = path.resolve(options.output);
          const dir = path.dirname(resolvedPath);
          
          // Ensure directory exists
          await fs.mkdir(dir, { recursive: true });
          
          // Save recording
          await fs.writeFile(resolvedPath, JSON.stringify(recording, null, 2));
          
          console.log(chalk.green(`💾 Recording saved to: ${resolvedPath}`));
          
          // Show file size
          const stats = await fs.stat(resolvedPath);
          const sizeKB = (stats.size / 1024).toFixed(1);
          console.log(chalk.dim(`   File size: ${sizeKB} KB`));
        } catch (error) {
          console.error(chalk.red('Failed to save recording:'), error);
        }
      }
    });
  }

  // Start bridge
  await bridge.start();

  // Start UI development server only if not skipped
  let uiProcess: any = null;
  if (!options.skipUi) {
    console.log(chalk.blue('🎨 Starting UI development server...'));
    uiProcess = await startUiDevServer(uiPort);
  }

  // Handle graceful shutdown
  const cleanup = async () => {
    console.log(chalk.yellow('\\n🛑 Shutting down...'));
    
    if (uiProcess) {
      uiProcess.kill('SIGTERM');
    }
    
    await bridge.stop();
    console.log(chalk.green('✅ Cleanup completed'));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log(chalk.green('\\n🚀 AXTree is ready!'));
  console.log(chalk.cyan(`   📱 UI: http://localhost:${uiPort}`));
  console.log(chalk.cyan(`   🔗 Bridge: ws://localhost:${bridgePort}/ax-tree`));
  console.log(chalk.yellow('\\nPress Ctrl+C to stop'));

  // Keep process alive
  await new Promise(() => {});
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
        `Cannot connect to Chrome DevTools at ${host}:${port}.\\n` +
        'Make sure Chrome is running with --remote-debugging-port flag:\\n' +
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

async function startUiDevServer(port: number): Promise<ChildProcess | null> {
  return new Promise((resolve, reject) => {
    try {
      // Check if we have a UI package in the workspace
      const uiProcess = spawn('pnpm', ['--filter', '@ax/ui', 'dev', '--port', port.toString()], {
        stdio: 'pipe',
        shell: true
      });

      let started = false;

      uiProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Local:') || output.includes('ready')) {
          if (!started) {
            started = true;
            console.log(chalk.green('✅ UI development server started'));
            resolve(uiProcess);
          }
        }
        // Optionally log UI server output with prefix
        console.log(chalk.dim('   UI:'), output.trim());
      });

      uiProcess.stderr?.on('data', (data) => {
        console.error(chalk.yellow('   UI Warning:'), data.toString().trim());
      });

      uiProcess.on('error', (error) => {
        if (!started) {
          console.warn(chalk.yellow('⚠️  UI development server not available'));
          console.log(chalk.dim('   This is fine for headless usage'));
          resolve(null);
        }
      });

      uiProcess.on('exit', (code) => {
        if (!started && code !== 0) {
          console.warn(chalk.yellow('⚠️  UI development server failed to start'));
          console.log(chalk.dim('   This is fine for headless usage'));
          resolve(null);
        }
      });

      // Timeout fallback
      setTimeout(() => {
        if (!started) {
          console.warn(chalk.yellow('⚠️  UI development server timeout'));
          console.log(chalk.dim('   This is fine for headless usage'));
          resolve(null);
        }
      }, 10000);

    } catch (error) {
      console.warn(chalk.yellow('⚠️  Could not start UI development server'));
      console.log(chalk.dim('   This is fine for headless usage'));
      resolve(null);
    }
  });
}