import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { Bridge } from '@ax/bridge';
import { spawn, ChildProcess } from 'child_process';

interface ConnectOptions {
  port: string;
  host: string;
  uiPort: string;
  uiHost: string;
}

export function createConnectCommand(): Command {
  const command = new Command('connect');
  
  command
    .description('Connect to Chrome DevTools and start the AXTree bridge')
    .option('-p, --port <port>', 'Chrome DevTools port', '9222')
    .option('-h, --host <host>', 'Chrome DevTools host', 'localhost')
    .option('--ui-port <port>', 'UI development server port', '5173')
    .option('--ui-host <host>', 'UI development server host', 'localhost')
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
  const cdpPort = parseInt(options.port);
  const cdpHost = options.host;
  const uiPort = parseInt(options.uiPort);
  const bridgePort = uiPort + 1; // Use UI port + 1 for bridge

  console.log(chalk.blue('🔍 Validating Chrome DevTools connection...'));
  
  // Validate CDP connection
  await validateCdpConnection(cdpHost, cdpPort);
  
  console.log(chalk.green('✅ Chrome DevTools connection validated'));
  console.log(chalk.blue('🌉 Starting AXTree bridge...'));

  // Start the bridge
  const bridge = new Bridge({
    port: bridgePort,
    host: 'localhost',
    cdpPort,
    cdpHost
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

  // Start bridge
  await bridge.start();

  // Start UI development server
  console.log(chalk.blue('🎨 Starting UI development server...'));
  const uiProcess = await startUiDevServer(uiPort);

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