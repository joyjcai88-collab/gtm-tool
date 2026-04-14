import { Command } from 'commander';
import fs from 'node:fs';
import { LeadSchema } from '../models/schemas.js';
import type { Lead } from '../models/schemas.js';
import { loadCampaign } from '../lib/config-store.js';
import { exportLeadsToCsv } from '../services/csv.js';
import { log } from '../lib/logger.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export leads to CSV')
    .option('-i, --input <path>', 'Input JSON file with leads')
    .option('-c, --campaign <id>', 'Export leads from a saved campaign')
    .option('-o, --output <path>', 'Output CSV file path')
    .action(handleExport);
}

async function handleExport(options: {
  input?: string;
  campaign?: string;
  output?: string;
}): Promise<void> {
  let leads: Lead[];

  if (options.campaign) {
    try {
      const campaign = loadCampaign(options.campaign);
      leads = campaign.leads;
      log.info(`Loaded ${leads.length} leads from campaign "${campaign.name}"`);
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  } else if (options.input) {
    if (!fs.existsSync(options.input)) {
      log.error(`File not found: ${options.input}`);
      process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(options.input, 'utf-8'));
    const items = Array.isArray(raw) ? raw : [raw];
    leads = [];

    for (const item of items) {
      const result = LeadSchema.safeParse(item);
      if (result.success) {
        leads.push(result.data);
      } else {
        log.warn(`Skipping invalid lead: ${result.error.issues[0]?.message}`);
      }
    }

    log.info(`Loaded ${leads.length} leads from ${options.input}`);
  } else {
    log.error('Provide --input <file> or --campaign <id>');
    process.exit(1);
  }

  if (leads.length === 0) {
    log.warn('No leads to export.');
    return;
  }

  const outputPath = options.output ?? `leads-${Date.now()}.csv`;

  try {
    await exportLeadsToCsv(leads, outputPath);
    log.success(`Exported ${leads.length} leads to ${outputPath}`);
  } catch (err) {
    log.error(`Export failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
