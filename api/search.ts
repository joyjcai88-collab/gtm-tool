import type { VercelRequest, VercelResponse } from '@vercel/node';

interface HunterEmail {
  value: string;
  type: string;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  linkedin: string | null;
  phone_number: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hunterKey = process.env.HUNTER_API_KEY;
  if (!hunterKey) {
    return res.status(500).json({ error: 'HUNTER_API_KEY not configured' });
  }

  const { domains, seniority, department, limit = 10 } = req.body ?? {};

  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'domains array is required (e.g., ["stripe.com", "datadog.com"])' });
  }

  try {
    const allLeads: Record<string, unknown>[] = [];
    let totalResults = 0;

    for (const domain of domains.slice(0, 10)) {
      if (allLeads.length >= limit) break;

      const params = new URLSearchParams({
        domain,
        api_key: hunterKey,
        limit: String(Math.min(limit - allLeads.length, 10)),
        type: 'personal',
      });

      if (seniority) params.append('seniority', seniority);
      if (department) params.append('department', department);

      const response = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 401 || response.status === 403) {
          return res.status(response.status).json({ error: `Hunter.io API error: ${text}` });
        }
        continue; // skip failed domains
      }

      const data = await response.json();
      const org = data.data?.organization ?? domain;
      totalResults += data.meta?.results ?? 0;

      for (const e of (data.data?.emails ?? []) as HunterEmail[]) {
        if (!e.first_name || !e.last_name) continue;
        if (allLeads.length >= limit) break;

        allLeads.push({
          firstName: e.first_name,
          lastName: e.last_name,
          email: e.value || null,
          title: e.position || '',
          company: org,
          companyDomain: domain,
          industry: null,
          employeeCount: null,
          location: null,
          linkedinUrl: e.linkedin || null,
          seniority: e.seniority || null,
          department: e.department || null,
          confidence: e.confidence,
        });
      }
    }

    return res.status(200).json({
      leads: allLeads,
      totalResults,
      domainsSearched: domains.length,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
