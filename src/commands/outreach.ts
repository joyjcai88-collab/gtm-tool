import { Command } from 'commander';
import fs from 'node:fs';
import inquirer from 'inquirer';
import pLimit from 'p-limit';
import { v4 as uuid } from 'uuid';
import { LeadSchema, OutreachContextSchema, CampaignSchema } from '../models/schemas.js';
import type { Lead, OutreachContext, GeneratedEmail, Campaign } from '../models/schemas.js';
import { saveCampaign, loadCampaign, listCampaigns } from '../lib/config-store.js';
import { generateEmail } from '../services/claude.js';
import { getSmtpConfig, createTransport, sendBatch } from '../services/email.js';
import { log, spinner, table } from '../lib/logger.js';

export function registerOutreachCommand(program: Command): void {
  const cmd = program
    .command('outreach')
    .description('Generate and send personalized outreach emails');

  cmd
    .command('start')
    .description('Start a new outreach campaign')
    .requiredOption('-l, --leads <path>', 'JSON file with leads')
    .requiredOption('-c, --context <path>', 'JSON file with outreach context')
    .option('--dry-run', 'Generate emails and preview, do not send')
    .option('--send', 'Generate and send emails')
    .option('--batch-size <n>', 'Emails per batch', '10')
    .option('--delay <ms>', 'Delay between emails in ms', '3000')
    .action(handleStart);

  cmd
    .command('send <campaignId>')
    .description('Send emails for an existing campaign')
    .option('--batch-size <n>', 'Emails per batch', '10')
    .option('--delay <ms>', 'Delay between emails in ms', '3000')
    .action(handleSend);

  cmd
    .command('status [campaignId]')
    .description('View campaign status')
    .action(handleStatus);
}

async function handleStart(options: {
  leads: string;
  context: string;
  dryRun?: boolean;
  send?: boolean;
  batchSize: string;
  delay: string;
}): Promise<void> {
  // Load leads
  if (!fs.existsSync(options.leads)) {
    log.error(`Leads file not found: ${options.leads}`);
    process.exit(1);
  }

  const rawLeads = JSON.parse(fs.readFileSync(options.leads, 'utf-8'));
  const leadsArray = Array.isArray(rawLeads) ? rawLeads : [rawLeads];
  const leads: Lead[] = [];

  for (const item of leadsArray) {
    const result = LeadSchema.safeParse(item);
    if (result.success) {
      if (result.data.email) {
        leads.push(result.data);
      } else {
        log.warn(`Skipping ${result.data.firstName} ${result.data.lastName} — no email`);
      }
    }
  }

  if (leads.length === 0) {
    log.error('No valid leads with email addresses found.');
    process.exit(1);
  }

  // Load outreach context
  if (!fs.existsSync(options.context)) {
    log.error(`Context file not found: ${options.context}`);
    process.exit(1);
  }

  const rawContext = JSON.parse(fs.readFileSync(options.context, 'utf-8'));
  const contextResult = OutreachContextSchema.safeParse(rawContext);
  if (!contextResult.success) {
    log.error('Invalid outreach context:');
    for (const issue of contextResult.error.issues) {
      log.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const context = contextResult.data;
  log.info(`Loaded ${leads.length} leads with email addresses`);
  log.info(`Outreach: ${context.companyName} — ${context.tone} tone\n`);

  // Generate emails
  const s = spinner(`Generating ${leads.length} personalized emails with Claude...`);
  s.start();

  const limit = pLimit(3);
  const emails: GeneratedEmail[] = [];
  const errors: Array<{ lead: Lead; error: string }> = [];

  const results = await Promise.allSettled(
    leads.map((lead) =>
      limit(async () => {
        const email = await generateEmail(lead, context);
        emails.push(email);
        s.text = `Generated ${emails.length}/${leads.length} emails...`;
        return email;
      }),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === 'rejected') {
      errors.push({ lead: leads[i]!, error: result.reason?.message ?? 'Unknown error' });
    }
  }

  s.stop();
  log.success(`Generated ${emails.length} emails`);
  if (errors.length > 0) {
    log.warn(`Failed to generate ${errors.length} emails:`);
    for (const { lead, error } of errors) {
      log.dim(`  ${lead.firstName} ${lead.lastName}: ${error}`);
    }
  }

  // Create campaign
  const campaign: Campaign = CampaignSchema.parse({
    id: uuid(),
    name: `${context.companyName} outreach ${new Date().toLocaleDateString()}`,
    icpProfileName: '',
    productDescription: context.productDescription,
    valueProposition: context.valueProposition,
    leads,
    emails,
    sendResults: [],
    status: 'emails_generated',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  saveCampaign(campaign);
  log.info(`Campaign saved: ${campaign.id}\n`);

  // Preview emails
  displayEmailPreviews(emails.slice(0, 3));

  if (emails.length > 3) {
    log.dim(`... and ${emails.length - 3} more emails\n`);
  }

  if (options.dryRun) {
    log.info('Dry run complete. Emails generated but not sent.');
    log.info(`To send: gtm outreach send ${campaign.id}`);
    return;
  }

  if (options.send) {
    await executeSend(campaign, parseInt(options.batchSize, 10), parseInt(options.delay, 10));
  } else {
    log.info(`To send: gtm outreach send ${campaign.id}`);
  }
}

async function handleSend(
  campaignId: string,
  options: { batchSize: string; delay: string },
): Promise<void> {
  let campaign: Campaign;
  try {
    campaign = loadCampaign(campaignId);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }

  if (campaign.emails.length === 0) {
    log.error('No emails generated for this campaign.');
    process.exit(1);
  }

  const alreadySent = new Set(campaign.sendResults.map((r) => r.leadId));
  const unsent = campaign.emails.filter((e) => !alreadySent.has(e.leadId));

  if (unsent.length === 0) {
    log.info('All emails in this campaign have already been sent.');
    return;
  }

  log.info(`${unsent.length} unsent emails in campaign "${campaign.name}"`);
  await executeSend(campaign, parseInt(options.batchSize, 10), parseInt(options.delay, 10));
}

async function executeSend(
  campaign: Campaign,
  batchSize: number,
  delayMs: number,
): Promise<void> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Send ${campaign.emails.length} emails? This cannot be undone.`,
      default: false,
    },
  ]);

  if (!confirm) {
    log.info('Send cancelled.');
    return;
  }

  let smtpConfig;
  try {
    smtpConfig = getSmtpConfig();
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }

  const transporter = createTransport(smtpConfig);
  const from = smtpConfig.user;

  log.info(`Sending ${campaign.emails.length} emails via ${smtpConfig.host}...`);

  const alreadySent = new Set(campaign.sendResults.map((r) => r.leadId));
  const unsent = campaign.emails.filter((e) => !alreadySent.has(e.leadId));

  const results = await sendBatch(transporter, from, unsent, {
    delayMs,
    batchSize,
    onProgress: (sent, total, result) => {
      const icon = result.status === 'sent' ? '✓' : '✗';
      log.dim(`  ${icon} [${sent}/${total}] ${result.to} — ${result.status}`);
    },
  });

  campaign.sendResults.push(...results);
  campaign.status = 'sent';
  campaign.updatedAt = new Date().toISOString();
  saveCampaign(campaign);

  const sentCount = results.filter((r) => r.status === 'sent').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  log.success(`\nDone! ${sentCount} sent, ${failedCount} failed.`);
  if (failedCount > 0) {
    log.info(`Failed emails can be retried: gtm outreach send ${campaign.id}`);
  }
}

async function handleStatus(campaignId?: string): Promise<void> {
  if (campaignId) {
    let campaign: Campaign;
    try {
      campaign = loadCampaign(campaignId);
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }

    log.bold(`Campaign: ${campaign.name}`);
    log.info(`ID: ${campaign.id}`);
    log.info(`Status: ${campaign.status}`);
    log.info(`Leads: ${campaign.leads.length}`);
    log.info(`Emails generated: ${campaign.emails.length}`);

    if (campaign.sendResults.length > 0) {
      const sent = campaign.sendResults.filter((r) => r.status === 'sent').length;
      const failed = campaign.sendResults.filter((r) => r.status === 'failed').length;
      log.info(`Sent: ${sent} | Failed: ${failed}`);
    }
  } else {
    const campaigns = listCampaigns();
    if (campaigns.length === 0) {
      log.info('No campaigns yet. Start one with "gtm outreach start".');
      return;
    }

    table(
      ['ID', 'Name', 'Status', 'Leads'],
      campaigns.map((c) => [c.id.slice(0, 8), c.name, c.status, c.leadCount.toString()]),
    );
  }
}

function displayEmailPreviews(emails: GeneratedEmail[]): void {
  for (const email of emails) {
    log.bold(`\nTo: ${email.to}`);
    log.info(`Subject: ${email.subject}`);
    log.dim('─'.repeat(50));
    console.log(email.body);
    log.dim('─'.repeat(50));
    log.dim(`Personalization: ${email.personalizationNotes}\n`);
  }
}
