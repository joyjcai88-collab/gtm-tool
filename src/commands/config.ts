import { Command } from 'commander';
import inquirer from 'inquirer';
import { getConfig, setConfigValue, getConfigValue, ensureGtmDir } from '../lib/config-store.js';
import { log, table } from '../lib/logger.js';

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command('config')
    .description('Manage GTM tool settings');

  cmd
    .command('init')
    .description('Interactive setup wizard for API keys and SMTP')
    .action(handleInit);

  cmd
    .command('set <key> <value>')
    .description('Set a config value (e.g., gtm config set hunter.apiKey YOUR_KEY)')
    .action(handleSet);

  cmd
    .command('get <key>')
    .description('Get a config value')
    .action(handleGet);

  cmd
    .command('list')
    .description('Show all configuration')
    .action(handleList);
}

async function handleInit(): Promise<void> {
  ensureGtmDir();
  log.bold('GTM Tool Setup Wizard');
  log.dim('Press Enter to skip any field.\n');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'hunterApiKey',
      message: 'Hunter.io API Key:',
      transformer: (input: string) => input ? '****' + input.slice(-4) : '',
    },
    {
      type: 'input',
      name: 'claudeApiKey',
      message: 'Anthropic (Claude) API Key:',
      transformer: (input: string) => input ? '****' + input.slice(-4) : '',
    },
    {
      type: 'input',
      name: 'smtpHost',
      message: 'SMTP Host:',
      default: 'smtp.gmail.com',
    },
    {
      type: 'number',
      name: 'smtpPort',
      message: 'SMTP Port:',
      default: 587,
    },
    {
      type: 'input',
      name: 'smtpUser',
      message: 'SMTP Username (email):',
    },
    {
      type: 'password',
      name: 'smtpPass',
      message: 'SMTP Password (App Password for Gmail):',
      mask: '*',
    },
  ]);

  if (answers.hunterApiKey) setConfigValue('hunter.apiKey', answers.hunterApiKey);
  if (answers.claudeApiKey) setConfigValue('claude.apiKey', answers.claudeApiKey);
  if (answers.smtpHost) setConfigValue('smtp.host', answers.smtpHost);
  if (answers.smtpPort) setConfigValue('smtp.port', String(answers.smtpPort));
  if (answers.smtpUser) setConfigValue('smtp.user', answers.smtpUser);
  if (answers.smtpPass) setConfigValue('smtp.pass', answers.smtpPass);

  log.success('Configuration saved to .gtm/config.json');
}

async function handleSet(key: string, value: string): Promise<void> {
  setConfigValue(key, value);
  log.success(`Set ${key} = ${key.includes('key') || key.includes('pass') ? '****' : value}`);
}

async function handleGet(key: string): Promise<void> {
  const value = getConfigValue(key);
  if (value === undefined) {
    log.warn(`Key "${key}" is not set.`);
  } else {
    const display = key.includes('key') || key.includes('pass')
      ? '****' + String(value).slice(-4)
      : String(value);
    console.log(display);
  }
}

async function handleList(): Promise<void> {
  const config = getConfig();
  const rows: string[][] = [];

  const flatten = (obj: Record<string, unknown>, prefix = ''): void => {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        flatten(v as Record<string, unknown>, fullKey);
      } else {
        const display = (fullKey.includes('key') || fullKey.includes('pass')) && v
          ? '****' + String(v).slice(-4)
          : String(v ?? '');
        rows.push([fullKey, display]);
      }
    }
  };

  flatten(config as unknown as Record<string, unknown>);
  table(['Key', 'Value'], rows);
}
