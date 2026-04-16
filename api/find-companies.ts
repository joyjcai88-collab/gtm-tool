import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const COMPANY_FINDING_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_target_companies',
  description: 'Submit a list of real companies/organizations that are ideal prospects based on the ICP.',
  input_schema: {
    type: 'object' as const,
    properties: {
      companies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Company or organization name' },
            domain: { type: 'string', description: 'Primary website domain e.g. company.com — no http/www' },
            industry: { type: 'string' },
            employeeCount: { type: 'number', description: 'Approximate employee count' },
            location: { type: 'string', description: 'HQ city and state or country' },
            relevance: { type: 'string', description: 'One or two sentences on why this company fits the ICP' },
          },
          required: ['name', 'domain', 'relevance'],
        },
      },
    },
    required: ['companies'],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { icp, limit = 15 } = req.body ?? {};
  if (!icp) {
    return res.status(400).json({ error: 'icp is required' });
  }

  try {
    const client = new Anthropic({ apiKey });

    const icpSummary = [
      `Industry: ${icp.industry || 'Not specified'}`,
      `Company Size: ${icp.companySize ? `${icp.companySize.min}–${icp.companySize.max} employees` : 'Any'}`,
      `Geography: ${(icp.geography || []).join(', ') || 'Any'}`,
      `Target Roles: ${(icp.targetRoles || []).join(', ')}`,
      `Seniority: ${(icp.seniority || []).join(', ')}`,
      `Pain Points: ${(icp.painPoints || []).join('; ')}`,
      `Keywords: ${(icp.keywords || []).join(', ')}`,
      icp.technologies?.length ? `Technologies: ${icp.technologies.join(', ')}` : '',
      `Rationale: ${icp.rationale || ''}`,
    ].filter(Boolean).join('\n');

    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are an expert GTM researcher. Given an Ideal Customer Profile (ICP), identify real, named companies and organizations that are the best prospects. Return specific real companies with accurate, working domain names. Focus on companies that match ALL key criteria: industry, company size, geography, and the pain points and rationale described. Prioritize well-known, verifiable organizations. Be specific — return actual company names, not generic categories.`,
      tools: [COMPANY_FINDING_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_target_companies' },
      messages: [
        {
          role: 'user',
          content: `Based on the following Ideal Customer Profile, identify ${limit} real companies or organizations that are strong prospects. Use the rationale and pain points to guide your selection.\n\n<icp>\n${icpSummary}\n</icp>\n\nReturn real, named companies with accurate domains (no www, no https — just the bare domain like company.com). Include employee count and location where known. Provide a 1-2 sentence explanation of why each is a strong fit.`,
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return res.status(500).json({ error: 'Failed to find companies' });
    }

    const extracted = toolBlock.input as { companies: Record<string, unknown>[] };
    const companies = (extracted.companies || []).map((c) => ({
      name: String(c.name || ''),
      domain: String(c.domain || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase(),
      industry: c.industry ? String(c.industry) : null,
      employeeCount: c.employeeCount ? Number(c.employeeCount) : null,
      location: c.location ? String(c.location) : null,
      relevance: String(c.relevance || ''),
    })).filter(c => c.name && c.domain);

    return res.status(200).json({ companies });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({
      error: error.message,
      type: error.constructor.name,
      cause: (error as any).cause?.message,
    });
  }
}
