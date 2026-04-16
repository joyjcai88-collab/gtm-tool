import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const LEAD_EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_leads',
  description: 'Submit the extracted leads from the provided content.',
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
            email: { type: 'string', description: 'Email if found, or best guess based on company pattern' },
            title: { type: 'string' },
            company: { type: 'string' },
            companyDomain: { type: 'string' },
            industry: { type: 'string' },
            location: { type: 'string' },
            source: { type: 'string', description: 'Where this lead was found' },
          },
          required: ['firstName', 'lastName', 'title', 'company'],
        },
      },
    },
    required: ['leads'],
  },
};

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GTMTool/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return `[Failed to fetch: ${res.status}]`;
    const html = await res.text();
    // Strip HTML tags, keep text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 15000); // Limit to 15k chars
  } catch {
    return `[Failed to fetch URL]`;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { query, urls, context, limit = 10 } = req.body ?? {};

  if (!query && (!urls || !Array.isArray(urls) || urls.length === 0)) {
    return res.status(400).json({ error: 'Either "query" (search description) or "urls" (array of URLs) is required' });
  }

  try {
    const client = new Anthropic({ apiKey });
    let userContent = '';

    if (urls && urls.length > 0) {
      // URL import mode: fetch pages and extract leads
      const pageContents: string[] = [];
      for (const url of urls.slice(0, 5)) {
        const content = await fetchUrlContent(url);
        pageContents.push(`\n--- Content from ${url} ---\n${content}`);
      }

      userContent = `Extract leads from the following web page content. ${context ? `Context: ${context.slice(0, 500)}` : 'Look for people with their names, titles, companies, and contact info.'}\n\nReturn up to ${limit} leads.\n\n<page_content>${pageContents.join('\n')}</page_content>`;
    } else {
      // Web search mode: use the query to generate leads
      userContent = `Based on your knowledge, generate a list of real, plausible leads matching this search query. These should be realistic contacts at real companies that match the described criteria.\n\nSearch query: "${query.slice(0, 1000)}"\n\nReturn up to ${limit} leads. For each lead, include their likely name, title, company, company domain, industry, and location. If you can reasonably guess their email format (e.g., first.last@company.com), include it.`;
    }

    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are a B2B lead research assistant. Extract or generate realistic lead data from the provided content or query. Always return structured data using the submit_leads tool. Focus on decision-makers: directors, VPs, C-suite, managers. Include as much detail as possible for each lead.`,
      tools: [LEAD_EXTRACTION_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_leads' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return res.status(500).json({ error: 'Failed to extract leads' });
    }

    const extracted = toolBlock.input as { leads: Record<string, unknown>[] };
    const leads = (extracted.leads || []).map((l) => ({
      firstName: l.firstName || '',
      lastName: l.lastName || '',
      email: l.email || null,
      title: l.title || '',
      company: l.company || '',
      companyDomain: l.companyDomain || null,
      industry: l.industry || null,
      location: l.location || null,
      source: l.source || (urls ? 'URL Import' : 'Web Search'),
      seniority: null,
    }));

    return res.status(200).json({ leads, totalResults: leads.length });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({
      error: error.message,
      type: error.constructor.name,
    });
  }
}
