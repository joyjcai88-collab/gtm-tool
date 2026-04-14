import { Command } from 'commander';
import fs from 'node:fs';
import YAML from 'yaml';
import inquirer from 'inquirer';
import { ICPProfileSchema } from '../models/schemas.js';
import type { ICPProfile } from '../models/schemas.js';
import { saveProfile, loadProfile, listProfiles } from '../lib/config-store.js';
import { generateICP } from '../services/claude.js';
import { runICPInteractivePrompts } from '../prompts/icp-interactive.js';
import { log, spinner, table } from '../lib/logger.js';

export function registerIcpCommand(program: Command): void {
  const cmd = program
    .command('icp')
    .description('Define your Ideal Customer Profile (ICP)');

  cmd
    .command('interactive')
    .alias('i')
    .description('Build ICP through interactive Q&A')
    .action(handleInteractive);

  cmd
    .command('file <path>')
    .alias('f')
    .description('Import ICP from a JSON or YAML file')
    .action(handleFileImport);

  cmd
    .command('ai')
    .description('Generate ICP using AI from a product description')
    .action(handleAIGeneration);

  cmd
    .command('list')
    .alias('ls')
    .description('List saved ICP profiles')
    .action(handleList);

  cmd
    .command('show <name>')
    .description('Display a saved ICP profile')
    .action(handleShow);
}

async function handleInteractive(): Promise<void> {
  log.bold('ICP Builder — Interactive Mode\n');

  const data = await runICPInteractivePrompts();
  const profile = ICPProfileSchema.parse({
    ...data,
    createdAt: new Date().toISOString(),
  });

  displayProfile(profile);

  const { save } = await inquirer.prompt([
    { type: 'confirm', name: 'save', message: 'Save this ICP profile?', default: true },
  ]);

  if (save) {
    saveProfile(profile.name, profile);
    log.success(`Profile "${profile.name}" saved.`);
  }
}

async function handleFileImport(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    log.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let data: unknown;

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    data = YAML.parse(raw);
  } else {
    data = JSON.parse(raw);
  }

  const result = ICPProfileSchema.safeParse(data);
  if (!result.success) {
    log.error('Invalid ICP profile:');
    for (const issue of result.error.issues) {
      log.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const profile = result.data;
  displayProfile(profile);

  saveProfile(profile.name, profile);
  log.success(`Profile "${profile.name}" imported and saved.`);
}

async function handleAIGeneration(): Promise<void> {
  log.bold('ICP Builder — AI Mode\n');

  const { description } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'description',
      message: 'Describe your product or service (an editor will open):',
      validate: (input: string) => input.length >= 10 || 'Please provide at least a brief description.',
    },
  ]);

  const s = spinner('Generating ICP with Claude...');
  s.start();

  try {
    const icpData = await generateICP(description);
    s.stop();

    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Name for this ICP profile:',
        validate: (input: string) => input.length > 0 || 'Name is required',
      },
    ]);

    const profile = ICPProfileSchema.parse({
      ...icpData,
      name,
      createdAt: new Date().toISOString(),
    });

    displayProfile(profile);

    if (profile.rationale) {
      log.dim(`\nRationale: ${profile.rationale}`);
    }

    const { save } = await inquirer.prompt([
      { type: 'confirm', name: 'save', message: 'Save this ICP profile?', default: true },
    ]);

    if (save) {
      saveProfile(profile.name, profile);
      log.success(`Profile "${profile.name}" saved.`);
    }
  } catch (err) {
    s.stop();
    log.error(`Failed to generate ICP: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function handleList(): Promise<void> {
  const profiles = listProfiles();
  if (profiles.length === 0) {
    log.info('No ICP profiles saved yet. Create one with "gtm icp interactive" or "gtm icp ai".');
    return;
  }

  log.bold('Saved ICP Profiles:\n');
  for (const name of profiles) {
    const profile = loadProfile(name);
    log.info(`${name} — ${profile.industry} | ${profile.targetRoles.join(', ')} | ${profile.geography.join(', ')}`);
  }
}

async function handleShow(name: string): Promise<void> {
  try {
    const profile = loadProfile(name);
    displayProfile(profile);
    if (profile.rationale) {
      log.dim(`\nRationale: ${profile.rationale}`);
    }
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
}

function displayProfile(profile: ICPProfile): void {
  log.bold(`\nICP Profile: ${profile.name}`);
  table(
    ['Field', 'Value'],
    [
      ['Industry', profile.industry],
      ['Company Size', `${profile.companySize.min} - ${profile.companySize.max} employees`],
      ['Target Roles', profile.targetRoles.join(', ')],
      ['Seniority', profile.seniority.join(', ')],
      ['Geography', profile.geography.join(', ')],
      ['Pain Points', profile.painPoints.join(', ') || '—'],
      ['Keywords', profile.keywords.join(', ') || '—'],
      ['Technologies', profile.technologies.join(', ') || '—'],
      ['Revenue Range', profile.annualRevenue
        ? `$${profile.annualRevenue.min.toLocaleString()} - $${profile.annualRevenue.max.toLocaleString()}`
        : '—'],
    ],
  );
}
