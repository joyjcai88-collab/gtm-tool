import fs from 'node:fs';
import path from 'node:path';
import { GtmConfigSchema, ICPProfileSchema, CampaignSchema } from '../models/schemas.js';
import type { GtmConfig, ICPProfile, Campaign } from '../models/schemas.js';

const GTM_DIR = path.join(process.cwd(), '.gtm');
const CONFIG_FILE = path.join(GTM_DIR, 'config.json');
const PROFILES_DIR = path.join(GTM_DIR, 'profiles');
const CAMPAIGNS_DIR = path.join(GTM_DIR, 'campaigns');

export function ensureGtmDir(): void {
  for (const dir of [GTM_DIR, PROFILES_DIR, CAMPAIGNS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getConfig(): GtmConfig {
  ensureGtmDir();

  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }

  const config = GtmConfigSchema.parse(fileConfig);

  // Environment variables take precedence
  if (process.env.HUNTER_API_KEY) config.hunter.apiKey = process.env.HUNTER_API_KEY;
  if (process.env.ANTHROPIC_API_KEY) config.claude.apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.SMTP_HOST) config.smtp.host = process.env.SMTP_HOST;
  if (process.env.SMTP_PORT) config.smtp.port = parseInt(process.env.SMTP_PORT, 10);
  if (process.env.SMTP_USER) config.smtp.user = process.env.SMTP_USER;
  if (process.env.SMTP_PASS) config.smtp.pass = process.env.SMTP_PASS;

  return config;
}

export function setConfigValue(key: string, value: string): void {
  ensureGtmDir();

  let config: Record<string, unknown> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }

  const parts = key.split('.');
  let current: Record<string, unknown> = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1]!;
  // Try to parse as number/boolean
  if (value === 'true') current[lastKey] = true;
  else if (value === 'false') current[lastKey] = false;
  else if (!isNaN(Number(value)) && value !== '') current[lastKey] = Number(value);
  else current[lastKey] = value;

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigValue(key: string): unknown {
  const config = getConfig() as unknown as Record<string, unknown>;
  const parts = key.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function saveProfile(name: string, profile: ICPProfile): void {
  ensureGtmDir();
  const filePath = path.join(PROFILES_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
}

export function loadProfile(name: string): ICPProfile {
  const filePath = path.join(PROFILES_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`ICP profile "${name}" not found. Run "gtm icp --list" to see available profiles.`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return ICPProfileSchema.parse(data);
}

export function listProfiles(): string[] {
  ensureGtmDir();
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

export function saveCampaign(campaign: Campaign): void {
  ensureGtmDir();
  const filePath = path.join(CAMPAIGNS_DIR, `${campaign.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(campaign, null, 2));
}

export function loadCampaign(id: string): Campaign {
  const filePath = path.join(CAMPAIGNS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Campaign "${id}" not found.`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return CampaignSchema.parse(data);
}

export function listCampaigns(): Array<{ id: string; name: string; status: string; leadCount: number }> {
  ensureGtmDir();
  if (!fs.existsSync(CAMPAIGNS_DIR)) return [];
  return fs.readdirSync(CAMPAIGNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(CAMPAIGNS_DIR, f), 'utf-8'));
      return {
        id: data.id,
        name: data.name,
        status: data.status,
        leadCount: data.leads?.length ?? 0,
      };
    });
}
