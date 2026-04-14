import { createObjectCsvWriter } from 'csv-writer';
import type { Lead } from '../models/schemas.js';

const CSV_HEADERS = [
  { id: 'firstName', title: 'First Name' },
  { id: 'lastName', title: 'Last Name' },
  { id: 'email', title: 'Email' },
  { id: 'title', title: 'Title' },
  { id: 'company', title: 'Company' },
  { id: 'industry', title: 'Industry' },
  { id: 'employeeCount', title: 'Company Size' },
  { id: 'location', title: 'Location' },
  { id: 'linkedinUrl', title: 'LinkedIn URL' },
  { id: 'phone', title: 'Phone' },
  { id: 'website', title: 'Website' },
  { id: 'seniority', title: 'Seniority' },
  { id: 'departments', title: 'Departments' },
];

export async function exportLeadsToCsv(leads: Lead[], outputPath: string): Promise<void> {
  const writer = createObjectCsvWriter({
    path: outputPath,
    header: CSV_HEADERS,
  });

  const records = leads.map((lead) => ({
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email ?? '',
    title: lead.title,
    company: lead.company,
    industry: lead.industry ?? '',
    employeeCount: lead.employeeCount?.toString() ?? '',
    location: lead.location ?? '',
    linkedinUrl: lead.linkedinUrl ?? '',
    phone: lead.phone ?? '',
    website: lead.website ?? '',
    seniority: lead.seniority ?? '',
    departments: lead.departments.join('; '),
  }));

  await writer.writeRecords(records);
}
