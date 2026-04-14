import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const ICP_GENERATION_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_icp_profile',
  description: 'Submit the structured Ideal Customer Profile based on the product description.',
  input_schema: {
    type: 'object' as const,
    properties: {
      industry: { type: 'string', description: 'Target industry vertical' },
      companySize: {
        type: 'object',
        properties: { min: { type: 'number' }, max: { type: 'number' } },
        required: ['min', 'max'],
      },
      targetRoles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Job titles of the people to target',
      },
      seniority: {
        type: 'array',
        items: { type: 'string', enum: ['c_suite', 'vp', 'director', 'manager', 'senior', 'entry'] },
      },
      geography: { type: 'array', items: { type: 'string' } },
      painPoints: { type: 'array', items: { type: 'string' } },
      keywords: { type: 'array', items: { type: 'string' } },
      technologies: { type: 'array', items: { type: 'string' } },
      rationale: { type: 'string' },
    },
    required: ['industry', 'companySize', 'targetRoles', 'seniority', 'geography', 'painPoints', 'keywords', 'rationale'],
  },
};

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productDescription } = req.body ?? {};
  if (!productDescription || typeof productDescription !== 'string' || productDescription.length < 10) {
    return res.status(400).json({ error: 'productDescription is required (min 10 chars)' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are an expert GTM (Go-To-Market) strategist. Given a product or service description, generate a detailed Ideal Customer Profile (ICP) that identifies the best-fit companies and decision-makers to target. Be specific and actionable.`,
      tools: [ICP_GENERATION_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_icp_profile' },
      messages: [
        {
          role: 'user',
          content: `Generate an Ideal Customer Profile for this product/service:\n\n<product_description>\n${productDescription.slice(0, 5000)}\n</product_description>`,
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return res.status(500).json({ error: 'Failed to generate ICP' });
    }

    return res.status(200).json({ icp: toolBlock.input });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({
      error: error.message,
      type: error.constructor.name,
      cause: (error as any).cause?.message,
    });
  }
}
