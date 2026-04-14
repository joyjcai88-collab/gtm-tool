#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { registerConfigCommand } from './commands/config.js';
import { registerIcpCommand } from './commands/icp.js';
import { registerSearchCommand } from './commands/search.js';
import { registerExportCommand } from './commands/export.js';
import { registerOutreachCommand } from './commands/outreach.js';

dotenv.config();

const program = new Command();
program
  .name('gtm')
  .description('AI-powered go-to-market CLI tool for ICP definition, lead sourcing, and outreach')
  .version('0.1.0');

registerConfigCommand(program);
registerIcpCommand(program);
registerSearchCommand(program);
registerExportCommand(program);
registerOutreachCommand(program);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
