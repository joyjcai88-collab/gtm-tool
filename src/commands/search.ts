import { Command } from 'commander';
import fs from 'node:fs';
import { loadProfile } from '../lib/config-store.js';
import { searchPeople, icpToApolloParams } from '../services/apollo.js';
import { log, spinner, table } from '../lib/logger.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search')
    .description('Source leads from Apollo.io based on an ICP profile')
    .requiredOption('-p, --profile <name>', 'ICP profile name to search against')
    .option('-l, --limit <n>', 'Maximum leads to return', '25')
    .option('-o, --output <path>', 'Save results to JSON file')
    .action(handleSearch);
}

async function handleSearch(options: {
  profile: string;
  limit: string;
  output?: string;
}): Promise<void> {
  const limit = parseInt(options.limit, 10);

  let profile;
  try {
    profile = loadProfile(options.profile);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }

  log.info(`Searching Apollo.io with ICP profile "${options.profile}"...`);
  log.dim(`Industry: ${profile.industry} | Roles: ${profile.targetRoles.join(', ')} | Geo: ${profile.geography.join(', ')}`);

  const params = icpToApolloParams(profile);
  const s = spinner(`Sourcing up to ${limit} leads...`);
  s.start();

  try {
    const { leads, totalEntries } = await searchPeople(params, limit);
    s.stop();

    if (leads.length === 0) {
      log.warn('No leads found matching your ICP criteria. Try broadening your search.');
      return;
    }

    log.success(`Found ${leads.length} leads (${totalEntries.toLocaleString()} total matches in Apollo)\n`);

    // Display summary table
    const rows = leads.slice(0, 20).map((lead) => [
      `${lead.firstName} ${lead.lastName}`,
      lead.title.slice(0, 30),
      lead.company.slice(0, 25),
      lead.email ?? '—',
      lead.location?.slice(0, 20) ?? '—',
    ]);

    table(['Name', 'Title', 'Company', 'Email', 'Location'], rows);

    if (leads.length > 20) {
      log.dim(`... and ${leads.length - 20} more leads`);
    }

    // Save to file
    const outputPath = options.output ?? `leads-${options.profile}-${Date.now()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(leads, null, 2));
    log.success(`Leads saved to ${outputPath}`);
  } catch (err) {
    s.stop();
    log.error(`Search failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
