import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const LEAD_EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_leads',
  description: 'Submit structured leads extracted from the Perplexity search results.',
  input_schema: {
    type: 'object' as const,
    properties: {
      leads: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', description: 'Email address if found in the content' },
            title: { type: 'string' },
            company: { type: 'string' },
            companyDomain: { type: 'string', description: 'Company website domain e.g. company.com' },
            industry: { type: 'string' },
            location: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['firstName', 'lastName', 'title', 'company'],
        },
      },
    },
    required: ['leads'],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!perplexityKey) {
    return res.status(500).json({
      error: 'PERPLEXITY_API_KEY not configured. Add it in your Vercel environment variables.',
    });
  }
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { query, limit = 10 } = req.body ?? {};
  if (!query || typeof query !== 'string' || query.length < 5) {
    return res.status(400).json({ error: 'query is required (min 5 chars)' });
  }

  try {
    // Step 1: Search the live web with Perplexity Sonar
    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content:
              'You are a B2B lead researcher. Search the web and return real, named individuals that match the search criteria. For each person provide: full name, job title, company, company website, city/state/country, and email address if available. Be factual — only include people you can find online.',
          },
          {
            role: 'user',
            content: `Find up to ${limit} real B2B leads matching this description:\n\n${query.slice(0, 1000)}\n\nFor each person include: full name, current title, company name, company website domain, location, and email if findable. List each lead clearly, one per paragraph.`,
          },
        ],
        search_recency_filter: 'year',
        return_citations: true,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text();
      return res.status(502).json({
        error: `Perplexity API error ${perplexityRes.status}: ${errText.slice(0, 300)}`,
      });
    }

    const perplexityData = (await perplexityRes.json()) as {
      choices: Array<{ message: { content: string } }>;
      citations?: string[];
    };

    const searchContent = perplexityData.choices?.[0]?.message?.content ?? '';
    const citations = perplexityData.citations ?? [];

    if (!searchContent) {
      return res.status(500).json({ error: 'No content returned from Perplexity' });
    }

    // Step 2: Extract structured leads from the Perplexity text with Claude
    const client = new Anthropic({ apiKey: anthropicKey });
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
      max_tokens: 4096,
      system:
        'You are a lead data extraction assistant. Parse the provided Perplexity search results and extract every identifiable person as a structured lead. Return all leads you can find.',
      tools: [LEAD_EXTRACTION_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_leads' },
      messages: [
        {
          role: 'user',
          content: `Extract leads from the following Perplexity search results. Return up to ${limit} leads.\n\n<search_results>\n${searchContent}\n</search_results>\n\nCitations:\n${citations.slice(0, 10).join('\n')}`,
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return res.status(500).json({ error: 'Failed to extract leads from search results' });
    }

    const extracted = toolBlock.input as { leads: Record<string, unknown>[] };
    const leads = (extracted.leads || []).map((l) => ({
      firstName: String(l.firstName || ''),
      lastName: String(l.lastName || ''),
      email: l.email ? String(l.email) : null,
      title: String(l.title || ''),
      company: String(l.company || ''),
      companyDomain: l.companyDomain ? String(l.companyDomain).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] : null,
      industry: l.industry ? String(l.industry) : null,
      location: l.location ? String(l.location) : null,
      source: 'Perplexity',
      seniority: null,
    }));

    return res.status(200).json({ leads, totalResults: leads.length, citations });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({ error: error.message, type: error.constructor.name });
  }
}
