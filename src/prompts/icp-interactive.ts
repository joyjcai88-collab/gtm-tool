import inquirer from 'inquirer';
import type { ICPProfile } from '../models/schemas.js';

const SENIORITY_CHOICES = [
  { name: 'C-Suite (CEO, CTO, CFO, etc.)', value: 'c_suite' },
  { name: 'VP', value: 'vp' },
  { name: 'Director', value: 'director' },
  { name: 'Manager', value: 'manager' },
  { name: 'Senior IC', value: 'senior' },
  { name: 'Entry Level', value: 'entry' },
];

export async function runICPInteractivePrompts(): Promise<Omit<ICPProfile, 'createdAt'>> {
  const { name } = await inquirer.prompt({
    type: 'input',
    name: 'name',
    message: 'Profile name (used for saving/referencing):',
    validate: (input: string) => input.length > 0 || 'Profile name is required',
  });

  const { industry } = await inquirer.prompt({
    type: 'input',
    name: 'industry',
    message: 'Target industry (e.g., "SaaS / B2B Software", "Fintech", "Healthcare"):',
    validate: (input: string) => input.length > 0 || 'Industry is required',
  });

  const { companySizeMin } = await inquirer.prompt({
    type: 'number',
    name: 'companySizeMin',
    message: 'Minimum company size (employees):',
    default: 10,
  });

  const { companySizeMax } = await inquirer.prompt({
    type: 'number',
    name: 'companySizeMax',
    message: 'Maximum company size (employees):',
    default: 500,
  });

  const { targetRolesRaw } = await inquirer.prompt({
    type: 'input',
    name: 'targetRolesRaw',
    message: 'Target roles/titles (comma-separated, e.g., "CTO, VP Engineering"):',
    validate: (input: string) => input.length > 0 || 'At least one target role is required',
  });
  const targetRoles = targetRolesRaw.split(',').map((s: string) => s.trim()).filter(Boolean);

  const { seniority } = await inquirer.prompt({
    type: 'checkbox',
    name: 'seniority',
    message: 'Target seniority levels:',
    choices: SENIORITY_CHOICES,
    validate: (input: string[]) => input.length > 0 || 'Select at least one seniority level',
  });

  const { geographyRaw } = await inquirer.prompt({
    type: 'input',
    name: 'geographyRaw',
    message: 'Target geography (comma-separated, e.g., "United States, Canada"):',
    validate: (input: string) => input.length > 0 || 'At least one geography is required',
  });
  const geography = geographyRaw.split(',').map((s: string) => s.trim()).filter(Boolean);

  const { painPointsRaw } = await inquirer.prompt({
    type: 'input',
    name: 'painPointsRaw',
    message: 'Key pain points (comma-separated, optional):',
  });
  const painPoints = painPointsRaw ? painPointsRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

  const { keywordsRaw } = await inquirer.prompt({
    type: 'input',
    name: 'keywordsRaw',
    message: 'Company keywords (comma-separated, e.g., "devtools, platform engineering"):',
  });
  const keywords = keywordsRaw ? keywordsRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

  const { technologiesRaw } = await inquirer.prompt({
    type: 'input',
    name: 'technologiesRaw',
    message: 'Technologies they likely use (comma-separated, optional):',
  });
  const technologies = technologiesRaw ? technologiesRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

  const { hasRevenue } = await inquirer.prompt({
    type: 'confirm',
    name: 'hasRevenue',
    message: 'Do you want to specify an annual revenue range?',
    default: false,
  });

  let annualRevenue: { min: number; max: number } | undefined;
  if (hasRevenue) {
    const { revenueMin } = await inquirer.prompt({
      type: 'number',
      name: 'revenueMin',
      message: 'Minimum annual revenue ($):',
      default: 1000000,
    });
    const { revenueMax } = await inquirer.prompt({
      type: 'number',
      name: 'revenueMax',
      message: 'Maximum annual revenue ($):',
      default: 100000000,
    });
    annualRevenue = { min: revenueMin, max: revenueMax };
  }

  return {
    name,
    industry,
    companySize: { min: companySizeMin, max: companySizeMax },
    targetRoles,
    seniority,
    geography,
    painPoints,
    keywords,
    technologies,
    annualRevenue,
    rationale: '',
  };
}
