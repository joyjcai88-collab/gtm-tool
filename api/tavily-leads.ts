import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const LEAD_EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_leads',
  description: 'Submit structured leads extracted from the web search results.',
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
            email: { type: 'string', description: 'Email address if found' },
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

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilyResult[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!tavilyKey) {
    return res.status(500).json({ error: 'TAVILY_API_KEY not configured' });
  }
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { query, limit = 10 } = req.body ?? {};
  if (!query || typeof query !== 'string' || query.length < 5) {
    return res.status(400).json({ error: 'query is required (min 5 chars)' });
  }

  try {
    // Step 1: Search the live web with Tavily
    const tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `${query} contact information name title company`,
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: false,
        max_results: Math.min(Number(limit) + 5, 20),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text();
      return res.status(502).json({
        error: `Tavily API error ${tavilyRes.status}: ${errText.slice(0, 300)}`,
      });
    }

    const tavilyData = (await tavilyRes.json()) as TavilyResponse;

    // Combine answer + all result snippets into one block for Claude
    const searchContent = [
      tavilyData.answer ? `Summary:\n${tavilyData.answer}` : '',
      ...tavilyData.results.map(
        (r, i) => `[Result ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`
      ),
    ]
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(0, 20000);

    const sources = tavilyData.results.map((r) => r.url);

    if (!searchContent) {
      return res.status(500).json({ error: 'No content returned from Tavily search' });
    }

    // Step 2: Extract structured leads with Claude
    const client = new Anthropic({ apiKey: anthropicKey });
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
      max_tokens: 4096,
      system:
        'You are a lead data extraction assistant. Parse the provided web search results and extract every identifiable person as a structured lead. Include their name, title, company, domain, location, and email if present. Only extract real people mentioned in the content.',
      tools: [LEAD_EXTRACTION_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_leads' },
      messages: [
        {
          role: 'user',
          content: `Extract up to ${limit} leads from these Tavily web search results.\n\nOriginal query: "${query}"\n\n<search_results>\n${searchContent}\n</search_results>`,
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
      companyDomain: l.companyDomain
        ? String(l.companyDomain)
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0]
        : null,
      industry: l.industry ? String(l.industry) : null,
      location: l.location ? String(l.location) : null,
      source: 'Tavily Search',
      seniority: null,
    }));

    return res.status(200).json({ leads, totalResults: leads.length, sources });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({ error: error.message, type: error.constructor.name });
  }
}
