import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return res.status(500).json({ error: 'APOLLO_API_KEY not configured' });
  }

  const {
    person_titles,
    person_locations,
    organization_num_employees_ranges,
    person_seniorities,
    q_organization_keyword,
    per_page = 25,
    page = 1,
  } = req.body ?? {};

  try {
    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        api_key: apolloKey,
        person_titles,
        person_locations,
        organization_num_employees_ranges,
        person_seniorities,
        q_organization_keyword,
        per_page: Math.min(per_page, 100),
        page,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Apollo API error: ${text}` });
    }

    const data = await response.json();
    const leads = (data.people ?? []).map((p: Record<string, unknown>) => ({
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      email: p.email ?? null,
      title: p.title ?? '',
      company: (p.organization as Record<string, unknown>)?.name ?? '',
      industry: (p.organization as Record<string, unknown>)?.industry ?? null,
      employeeCount: (p.organization as Record<string, unknown>)?.estimated_num_employees ?? null,
      location: [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
      linkedinUrl: p.linkedin_url ?? null,
      seniority: p.seniority ?? null,
    }));

    return res.status(200).json({
      leads,
      pagination: data.pagination,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
