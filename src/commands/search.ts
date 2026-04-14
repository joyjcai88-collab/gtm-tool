import { Command } from 'commander';
import fs from 'node:fs';
import { loadProfile } from '../lib/config-store.js';
import { searchMultipleDomains, icpToHunterSeniority, icpToDepartment } from '../services/hunter.js';
import { log, spinner, table } from '../lib/logger.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search')
    .description('Source leads from Hunter.io by company domain')
    .requiredOption('-d, --domains <domains>', 'Comma-separated company domains (e.g., stripe.com,datadog.com)')
    .option('-f, --domains-file <path>', 'File with one domain per line')
    .option('-p, --profile <name>', 'ICP profile to filter by seniority/department')
    .option('-l, --limit <n>', 'Maximum total leads to return', '25')
    .option('--per-domain <n>', 'Max leads per domain', '10')
    .option('-o, --output <path>', 'Save results to JSON file')
    .action(handleSearch);
}

async function handleSearch(options: {
  domains: string;
  domainsFile?: string;
  profile?: string;
  limit: string;
  perDomain: string;
  output?: string;
}): Promise<void> {
  const limit = parseInt(options.limit, 10);
  const perDomain = parseInt(options.perDomain, 10);

  // Collect domains from CLI arg and/or file
  let domains = options.domains
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (options.domainsFile) {
    const fileContent = fs.readFileSync(options.domainsFile, 'utf-8');
    const fileDomains = fileContent
      .split('\n')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d && !d.startsWith('#'));
    domains = [...new Set([...domains, ...fileDomains])];
  }

  if (domains.length === 0) {
    log.error('No domains provided. Use --domains or --domains-file.');
    process.exit(1);
  }

  // Optionally apply ICP filtering
  let seniority: string | undefined;
  let department: string | undefined;

  if (options.profile) {
    try {
      const profile = loadProfile(options.profile);
      seniority = icpToHunterSeniority(profile.seniority);
      log.info(`Using ICP profile "${options.profile}" for filtering`);
      log.dim(`Seniority filter: ${seniority ?? 'none'} | Industry: ${profile.industry}`);
    } catch (err) {
      log.warn(`Could not load profile: ${(err as Error).message}. Searching without ICP filters.`);
    }
  }

  log.info(`Searching Hunter.io across ${domains.length} domain(s)...`);
  log.dim(`Domains: ${domains.slice(0, 5).join(', ')}${domains.length > 5 ? ` (+${domains.length - 5} more)` : ''}`);

  const s = spinner(`Sourcing up to ${limit} leads...`);
  s.start();

  try {
    const { leads, totalResults } = await searchMultipleDomains(domains, {
      seniority,
      department,
      limitPerDomain: perDomain,
      totalLimit: limit,
    });
    s.stop();

    if (leads.length === 0) {
      log.warn('No leads found. Try different domains or broader filters.');
      return;
    }

    log.success(`Found ${leads.length} leads (${totalResults.toLocaleString()} total contacts across domains)\n`);

    // Display summary table
    const rows = leads.slice(0, 20).map((lead) => [
      `${lead.firstName} ${lead.lastName}`,
      (lead.title || '—').slice(0, 30),
      lead.company.slice(0, 25),
      lead.email ?? '—',
      lead.seniority ?? '—',
    ]);

    table(['Name', 'Title', 'Company', 'Email', 'Seniority'], rows);

    if (leads.length > 20) {
      log.dim(`... and ${leads.length - 20} more leads`);
    }

    // Save to file
    const outputPath = options.output ?? `leads-${Date.now()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(leads, null, 2));
    log.success(`Leads saved to ${outputPath}`);
  } catch (err) {
    s.stop();
    log.error(`Search failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
