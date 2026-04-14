import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exportLeadsToCsv } from '../../src/services/csv.js';
import type { Lead } from '../../src/models/schemas.js';
import sampleLeads from '../fixtures/sample-leads.json';
import { LeadSchema } from '../../src/models/schemas.js';

const tmpDir = os.tmpdir();

describe('exportLeadsToCsv', () => {
  const outputPath = path.join(tmpDir, `test-leads-${Date.now()}.csv`);

  afterEach(() => {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  it('exports leads to a valid CSV file', async () => {
    const leads = sampleLeads.map((l) => LeadSchema.parse(l));
    await exportLeadsToCsv(leads, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Header + 3 leads
    expect(lines.length).toBe(4);

    // Check header
    expect(lines[0]).toContain('First Name');
    expect(lines[0]).toContain('Email');
    expect(lines[0]).toContain('Company');
    expect(lines[0]).toContain('LinkedIn URL');

    // Check first lead data
    expect(lines[1]).toContain('Jane');
    expect(lines[1]).toContain('jane.smith@example.com');
    expect(lines[1]).toContain('Acme Corp');
  });

  it('handles leads with null fields gracefully', async () => {
    const leads = sampleLeads.map((l) => LeadSchema.parse(l));
    await exportLeadsToCsv(leads, outputPath);

    const content = fs.readFileSync(outputPath, 'utf-8');
    // Alice Chen (lead 3) has null email — should not crash, just be empty
    expect(content).toContain('Alice');
    expect(content).toContain('DataFlow Labs');
  });

  it('exports empty array without crashing', async () => {
    await exportLeadsToCsv([], outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1); // Just header
  });
});
