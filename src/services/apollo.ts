import type { ICPProfile, Lead } from '../models/schemas.js';
import type { ApolloSearchParams, ApolloSearchResponse, ApolloPerson } from '../types/apollo.js';
import { getConfig } from '../lib/config-store.js';
import { fetchWithRetry, RateLimiter } from '../lib/retry.js';
import { v4 as uuid } from 'uuid';

const APOLLO_BASE_URL = 'https://api.apollo.io';
const rateLimiter = new RateLimiter(45, 3600000); // 45 req/hour (under free tier limit)

function getApiKey(): string {
  const config = getConfig();
  const apiKey = config.apollo.apiKey;
  if (!apiKey) {
    throw new Error(
      'Apollo API key not configured. Run "gtm config set apollo.apiKey YOUR_KEY" or set APOLLO_API_KEY env var.',
    );
  }
  return apiKey;
}

const SENIORITY_MAP: Record<string, string> = {
  c_suite: 'c_suite',
  vp: 'vp',
  director: 'director',
  manager: 'manager',
  senior: 'senior',
  entry: 'entry',
};

export function icpToApolloParams(icp: ICPProfile): ApolloSearchParams {
  return {
    person_titles: icp.targetRoles,
    person_locations: icp.geography,
    organization_num_employees_ranges: [
      `${icp.companySize.min},${icp.companySize.max}`,
    ],
    person_seniorities: icp.seniority.map((s) => SENIORITY_MAP[s] ?? s),
    q_organization_keyword: [icp.industry, ...icp.keywords].filter(Boolean).join(' '),
    per_page: 25,
  };
}

function apolloPersonToLead(person: ApolloPerson): Lead {
  const org = person.organization;
  const location = [person.city, person.state, person.country]
    .filter(Boolean)
    .join(', ');

  return {
    id: uuid(),
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    email: person.email || null,
    title: person.title || '',
    company: org?.name || '',
    companyDomain: org?.primary_domain || null,
    industry: org?.industry || null,
    employeeCount: org?.estimated_num_employees || null,
    location: location || null,
    linkedinUrl: person.linkedin_url || null,
    phone: person.phone_numbers?.[0]?.raw_number || null,
    website: org?.website_url || null,
    seniority: person.seniority || null,
    departments: person.departments || [],
    apolloId: person.id || null,
  };
}

export async function searchPeople(
  params: ApolloSearchParams,
  limit: number = 25,
): Promise<{ leads: Lead[]; totalEntries: number }> {
  const apiKey = getApiKey();
  const allLeads: Lead[] = [];
  let page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 25, 100);
  let totalEntries = 0;

  while (allLeads.length < limit) {
    await rateLimiter.acquire();

    const body = {
      api_key: apiKey,
      person_titles: params.person_titles,
      person_locations: params.person_locations,
      organization_num_employees_ranges: params.organization_num_employees_ranges,
      person_seniorities: params.person_seniorities,
      q_organization_keyword: params.q_organization_keyword,
      page,
      per_page: Math.min(perPage, limit - allLeads.length),
    };

    const response = await fetchWithRetry(
      `${APOLLO_BASE_URL}/v1/mixed_people/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(body),
      },
      { retryOnStatuses: [429, 500, 502, 503] },
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid Apollo API key. Check your configuration.');
      }
      throw new Error(`Apollo API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as ApolloSearchResponse;
    totalEntries = data.pagination.total_entries;

    if (!data.people || data.people.length === 0) break;

    for (const person of data.people) {
      if (allLeads.length >= limit) break;
      allLeads.push(apolloPersonToLead(person));
    }

    if (page >= data.pagination.total_pages) break;
    page++;
  }

  return { leads: allLeads, totalEntries };
}
