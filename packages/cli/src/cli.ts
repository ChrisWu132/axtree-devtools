#!/usr/bin/env node

import { Command } from 'commander';
import { createConnectCommand } from './commands/connect.js';
import { createRecordCommand } from './commands/record.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('axtree')
  .description('Headless Accessibility Tree Visualization Tool')
  .version('0.1.0');

// Add commands
program.addCommand(createConnectCommand());
program.addCommand(createRecordCommand());

// Show help if no command provided
if (process.argv.length <= 2) {
  program.help();
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise);
  console.error(chalk.red('Reason:'), reason);
  process.exit(1);
});

// Parse and execute
program.parse();