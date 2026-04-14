import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We test config-store by running in a temp directory
describe('config-store', () => {
  const originalCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-test-'));

  beforeEach(() => {
    process.chdir(tmpDir);
    // Clean .gtm dir if exists
    const gtmDir = path.join(tmpDir, '.gtm');
    if (fs.existsSync(gtmDir)) {
      fs.rmSync(gtmDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('creates .gtm directory structure', async () => {
    const { ensureGtmDir } = await import('../../src/lib/config-store.js');
    ensureGtmDir();

    expect(fs.existsSync(path.join(tmpDir, '.gtm'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gtm', 'profiles'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gtm', 'campaigns'))).toBe(true);
  });

  it('saves and loads an ICP profile', async () => {
    const { saveProfile, loadProfile, listProfiles } = await import('../../src/lib/config-store.js');

    const profile = {
      name: 'test-profile',
      industry: 'SaaS',
      companySize: { min: 10, max: 100 },
      targetRoles: ['CTO'],
      seniority: ['c_suite' as const],
      geography: ['US'],
      painPoints: [],
      keywords: [],
      technologies: [],
      rationale: '',
      createdAt: new Date().toISOString(),
    };

    saveProfile('test-profile', profile);

    const loaded = loadProfile('test-profile');
    expect(loaded.name).toBe('test-profile');
    expect(loaded.industry).toBe('SaaS');
    expect(loaded.targetRoles).toEqual(['CTO']);

    const profiles = listProfiles();
    expect(profiles).toContain('test-profile');
  });

  it('throws on loading non-existent profile', async () => {
    const { loadProfile, ensureGtmDir } = await import('../../src/lib/config-store.js');
    ensureGtmDir();

    expect(() => loadProfile('nonexistent')).toThrow('not found');
  });

  it('sets and gets config values', async () => {
    const { setConfigValue, getConfigValue } = await import('../../src/lib/config-store.js');

    setConfigValue('hunter.apiKey', 'test-key-123');
    expect(getConfigValue('hunter.apiKey')).toBe('test-key-123');

    setConfigValue('smtp.port', '465');
    expect(getConfigValue('smtp.port')).toBe(465); // Parsed as number
  });
});
