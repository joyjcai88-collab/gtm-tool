import { describe, it, expect } from 'vitest';
import {
  ICPProfileSchema,
  LeadSchema,
  OutreachContextSchema,
  GtmConfigSchema,
  CampaignSchema,
  GeneratedEmailSchema,
  EmailSendResultSchema,
} from '../../src/models/schemas.js';
import sampleIcp from '../fixtures/sample-icp.json';
import sampleLeads from '../fixtures/sample-leads.json';
import sampleContext from '../fixtures/sample-context.json';

describe('ICPProfileSchema', () => {
  it('parses a valid ICP profile', () => {
    const result = ICPProfileSchema.safeParse(sampleIcp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('saas-cto-na');
      expect(result.data.targetRoles).toHaveLength(3);
      expect(result.data.seniority).toContain('c_suite');
    }
  });

  it('rejects missing required fields', () => {
    const result = ICPProfileSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid seniority levels', () => {
    const result = ICPProfileSchema.safeParse({
      ...sampleIcp,
      seniority: ['ceo'],
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults for optional arrays', () => {
    const minimal = {
      name: 'minimal',
      industry: 'Tech',
      companySize: { min: 10, max: 100 },
      targetRoles: ['CTO'],
      seniority: ['c_suite'],
      geography: ['US'],
    };
    const result = ICPProfileSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.painPoints).toEqual([]);
      expect(result.data.keywords).toEqual([]);
      expect(result.data.technologies).toEqual([]);
    }
  });
});

describe('LeadSchema', () => {
  it('parses valid leads', () => {
    for (const lead of sampleLeads) {
      const result = LeadSchema.safeParse(lead);
      expect(result.success).toBe(true);
    }
  });

  it('handles null email correctly', () => {
    const leadWithNullEmail = sampleLeads[2]; // Alice Chen has null email
    const result = LeadSchema.safeParse(leadWithNullEmail);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('rejects invalid email format', () => {
    const result = LeadSchema.safeParse({
      ...sampleLeads[0],
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('OutreachContextSchema', () => {
  it('parses valid context', () => {
    const result = OutreachContextSchema.safeParse(sampleContext);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tone).toBe('professional');
      expect(result.data.companyName).toBe('DevPulse');
    }
  });

  it('applies defaults for optional fields', () => {
    const minimal = {
      productDescription: 'A great product for teams',
      valueProposition: 'Saves you time and money',
      senderName: 'John',
      senderTitle: 'CEO',
      companyName: 'TestCo',
    };
    const result = OutreachContextSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tone).toBe('professional');
      expect(result.data.maxEmailLength).toBe(150);
    }
  });

  it('rejects short descriptions', () => {
    const result = OutreachContextSchema.safeParse({
      productDescription: 'short',
      valueProposition: 'too',
      senderName: 'John',
      senderTitle: 'CEO',
      companyName: 'Co',
    });
    expect(result.success).toBe(false);
  });
});

describe('GtmConfigSchema', () => {
  it('applies all defaults', () => {
    const result = GtmConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.smtp.port).toBe(587);
      expect(result.data.defaults.batchSize).toBe(10);
      expect(result.data.defaults.emailDelayMs).toBe(3000);
      expect(result.data.claude.model).toBe('claude-sonnet-4-20250514');
    }
  });

  it('merges partial config', () => {
    const result = GtmConfigSchema.safeParse({
      apollo: { apiKey: 'test-key' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apollo.apiKey).toBe('test-key');
      expect(result.data.smtp.port).toBe(587);
    }
  });
});

describe('GeneratedEmailSchema', () => {
  it('parses a valid generated email', () => {
    const result = GeneratedEmailSchema.safeParse({
      leadId: 'lead-001',
      to: 'test@example.com',
      subject: 'Quick question about engineering velocity',
      body: 'Hi Jane, I noticed Acme Corp...',
      personalizationNotes: 'Referenced their CTO role and SaaS industry',
      generatedAt: '2026-04-13T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('EmailSendResultSchema', () => {
  it('parses sent result', () => {
    const result = EmailSendResultSchema.safeParse({
      leadId: 'lead-001',
      to: 'test@example.com',
      status: 'sent',
      messageId: 'msg-123',
      error: null,
      sentAt: '2026-04-13T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('parses failed result', () => {
    const result = EmailSendResultSchema.safeParse({
      leadId: 'lead-001',
      to: 'test@example.com',
      status: 'failed',
      messageId: null,
      error: 'Connection refused',
      sentAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('CampaignSchema', () => {
  it('parses a minimal campaign', () => {
    const result = CampaignSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Campaign',
      icpProfileName: 'saas-cto-na',
      productDescription: 'A test product',
      valueProposition: 'A test value prop',
      leads: [sampleLeads[0]],
      status: 'draft',
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-13T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emails).toEqual([]);
      expect(result.data.sendResults).toEqual([]);
    }
  });
});
