import { z } from 'zod';

export const CompanySizeRange = z.object({
  min: z.number().int().min(1),
  max: z.number().int().max(1000000),
});

export const RevenueRange = z.object({
  min: z.number().min(0),
  max: z.number().max(1e12),
});

export const ICPProfileSchema = z.object({
  name: z.string().min(1).max(100),
  industry: z.string().min(1),
  companySize: CompanySizeRange,
  targetRoles: z.array(z.string()).min(1),
  seniority: z.array(z.enum([
    'c_suite', 'vp', 'director', 'manager', 'senior', 'entry',
  ])).min(1),
  geography: z.array(z.string()).min(1),
  painPoints: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  annualRevenue: RevenueRange.optional(),
  technologies: z.array(z.string()).default([]),
  rationale: z.string().default(''),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type ICPProfile = z.infer<typeof ICPProfileSchema>;

export const LeadSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().nullable(),
  title: z.string(),
  company: z.string(),
  companyDomain: z.string().nullable(),
  industry: z.string().nullable(),
  employeeCount: z.number().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().url().nullable(),
  phone: z.string().nullable(),
  website: z.string().url().nullable(),
  seniority: z.string().nullable(),
  departments: z.array(z.string()).default([]),
  apolloId: z.string().nullable(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const GeneratedEmailSchema = z.object({
  leadId: z.string(),
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  personalizationNotes: z.string(),
  generatedAt: z.string().datetime(),
});
export type GeneratedEmail = z.infer<typeof GeneratedEmailSchema>;

export const EmailSendResultSchema = z.object({
  leadId: z.string(),
  to: z.string().email(),
  status: z.enum(['sent', 'failed', 'bounced', 'skipped']),
  messageId: z.string().nullable(),
  error: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
});
export type EmailSendResult = z.infer<typeof EmailSendResultSchema>;

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  icpProfileName: z.string(),
  productDescription: z.string(),
  valueProposition: z.string(),
  leads: z.array(LeadSchema),
  emails: z.array(GeneratedEmailSchema).default([]),
  sendResults: z.array(EmailSendResultSchema).default([]),
  status: z.enum(['draft', 'emails_generated', 'sending', 'sent', 'paused']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const OutreachContextSchema = z.object({
  productDescription: z.string().min(10),
  valueProposition: z.string().min(10),
  senderName: z.string(),
  senderTitle: z.string(),
  companyName: z.string(),
  tone: z.enum(['professional', 'casual', 'friendly', 'direct']).default('professional'),
  callToAction: z.string().default('Would you be open to a 15-minute call this week?'),
  maxEmailLength: z.number().default(150),
});
export type OutreachContext = z.infer<typeof OutreachContextSchema>;

export const GtmConfigSchema = z.object({
  hunter: z.object({
    apiKey: z.string().optional(),
  }).default({}),
  claude: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('claude-sonnet-4-20250514'),
  }).default({}),
  smtp: z.object({
    host: z.string().optional(),
    port: z.number().default(587),
    secure: z.boolean().default(false),
    user: z.string().optional(),
    pass: z.string().optional(),
  }).default({}),
  defaults: z.object({
    outputDir: z.string().default('./output'),
    batchSize: z.number().default(10),
    emailDelayMs: z.number().default(3000),
  }).default({}),
});
export type GtmConfig = z.infer<typeof GtmConfigSchema>;
