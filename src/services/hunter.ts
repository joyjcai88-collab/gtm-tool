import type { Lead } from '../models/schemas.js';
import type { HunterDomainSearchResponse, HunterEmail } from '../types/hunter.js';
import { getConfig } from '../lib/config-store.js';
import { fetchWithRetry, RateLimiter } from '../lib/retry.js';
import { v4 as uuid } from 'uuid';

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';
const rateLimiter = new RateLimiter(25, 3600000); // 25 req/hour (free tier)

function getApiKey(): string {
  const config = getConfig();
  const apiKey = config.hunter.apiKey;
  if (!apiKey) {
    throw new Error(
      'Hunter.io API key not configured. Run "gtm config set hunter.apiKey YOUR_KEY" or set HUNTER_API_KEY env var.',
    );
  }
  return apiKey;
}

// Map ICP seniority levels to Hunter's seniority values
const SENIORITY_MAP: Record<string, string> = {
  c_suite: 'executive',
  vp: 'executive',
  director: 'senior',
  manager: 'senior',
  senior: 'senior',
  entry: 'junior',
};

// Map ICP seniority to Hunter department values
const DEPARTMENT_MAP: Record<string, string> = {
  engineering: 'it',
  product: 'management',
  sales: 'sales',
  marketing: 'marketing',
  operations: 'operations',
  finance: 'finance',
  hr: 'hr',
  legal: 'legal',
  design: 'design',
  support: 'support',
  executive: 'executive',
};

function hunterEmailToLead(email: HunterEmail, domain: string, organization: string | null): Lead {
  return {
    id: uuid(),
    firstName: email.first_name ?? '',
    lastName: email.last_name ?? '',
    email: email.value || null,
    title: email.position ?? '',
    company: organization ?? domain,
    companyDomain: domain,
    industry: null,
    employeeCount: null,
    location: null,
    linkedinUrl: email.linkedin || null,
    phone: email.phone_number || null,
    website: `https://${domain}`,
    seniority: email.seniority || null,
    departments: email.department ? [email.department] : [],
    apolloId: null,
  };
}

export async function domainSearch(
  domain: string,
  options?: {
    seniority?: string;
    department?: string;
    type?: 'personal' | 'generic';
    limit?: number;
    offset?: number;
  },
): Promise<{ leads: Lead[]; totalResults: number; organization: string | null }> {
  const apiKey = getApiKey();
  await rateLimiter.acquire();

  const params = new URLSearchParams({
    domain,
    api_key: apiKey,
    limit: String(options?.limit ?? 10),
    offset: String(options?.offset ?? 0),
  });

  if (options?.seniority) params.append('seniority', options.seniority);
  if (options?.department) params.append('department', options.department);
  if (options?.type) params.append('type', options.type);

  const response = await fetchWithRetry(
    `${HUNTER_BASE_URL}/domain-search?${params}`,
    { headers: { 'Accept': 'application/json' } },
    { retryOnStatuses: [429, 500, 502, 503] },
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid Hunter.io API key. Check your configuration.');
    }
    if (response.status === 403) {
      throw new Error('Hunter.io API access denied. Check your plan limits.');
    }
    throw new Error(`Hunter.io API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as HunterDomainSearchResponse;

  const leads = data.data.emails
    .filter((e) => e.first_name && e.last_name) // skip generic emails without names
    .map((e) => hunterEmailToLead(e, domain, data.data.organization));

  return {
    leads,
    totalResults: data.meta.results,
    organization: data.data.organization,
  };
}

export async function searchMultipleDomains(
  domains: string[],
  options?: {
    seniority?: string;
    department?: string;
    limitPerDomain?: number;
    totalLimit?: number;
  },
): Promise<{ leads: Lead[]; totalResults: number }> {
  const allLeads: Lead[] = [];
  let totalResults = 0;
  const totalLimit = options?.totalLimit ?? 100;

  for (const domain of domains) {
    if (allLeads.length >= totalLimit) break;

    const remaining = totalLimit - allLeads.length;
    const result = await domainSearch(domain, {
      seniority: options?.seniority,
      department: options?.department,
      limit: Math.min(options?.limitPerDomain ?? 10, remaining),
    });

    allLeads.push(...result.leads.slice(0, remaining));
    totalResults += result.totalResults;
  }

  return { leads: allLeads, totalResults };
}

export function icpToHunterSeniority(icpSeniority: string[]): string | undefined {
  // Hunter only supports one seniority value per request
  // Pick the highest priority one from the ICP
  const priority = ['executive', 'senior', 'junior'];
  const mapped = new Set(icpSeniority.map((s) => SENIORITY_MAP[s]).filter(Boolean));
  return priority.find((p) => mapped.has(p));
}

export function icpToDepartment(departments: string[]): string | undefined {
  // Map first matching department
  for (const dept of departments) {
    const mapped = DEPARTMENT_MAP[dept.toLowerCase()];
    if (mapped) return mapped;
  }
  return undefined;
}
