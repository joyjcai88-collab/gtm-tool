import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'APOLLO_API_KEY not configured. Add your Apollo.io API key in Vercel environment variables.',
    });
  }

  const { titles = [], locations = [], employeeRanges = [], industries = [], limit = 25 } = req.body ?? {};

  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      per_page: Math.min(Number(limit) || 25, 50),
      page: 1,
    };

    if (Array.isArray(titles) && titles.length) body.person_titles = titles;
    if (Array.isArray(locations) && locations.length) body.person_locations = locations;
    if (Array.isArray(employeeRanges) && employeeRanges.length) body.organization_num_employees_ranges = employeeRanges;
    if (Array.isArray(industries) && industries.length) body.organization_industry_tag_ids = industries;

    const apolloRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    const data = (await apolloRes.json()) as Record<string, unknown>;

    if (!apolloRes.ok) {
      const msg =
        (data as any)?.message ||
        (data as any)?.error ||
        `Apollo API error (${apolloRes.status})`;
      // Surface plan restriction clearly
      if (apolloRes.status === 403 || String(msg).toLowerCase().includes('plan')) {
        return res.status(403).json({
          error: 'Apollo free plan does not support bulk people search. Upgrade to a paid plan or use a different source.',
          apolloMessage: msg,
        });
      }
      return res.status(apolloRes.status).json({ error: msg });
    }

    const people = ((data as any).people || []) as Record<string, unknown>[];

    const leads = people.map((p: any) => ({
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      email: p.email && p.email_status !== 'invalid' ? p.email : null,
      title: p.title || '',
      company: p.organization?.name || p.employment_history?.[0]?.organization_name || '',
      companyDomain: p.organization?.website_url
        ? String(p.organization.website_url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
        : null,
      industry: p.organization?.industry || null,
      location: [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
      linkedinUrl: p.linkedin_url || null,
      source: 'Apollo.io',
      seniority: p.seniority || null,
    }));

    const pagination = (data as any).pagination ?? {};
    return res.status(200).json({
      leads,
      totalResults: pagination.total_entries ?? leads.length,
    });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({ error: error.message, type: error.constructor.name });
  }
}
