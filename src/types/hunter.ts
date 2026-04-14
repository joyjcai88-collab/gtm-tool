export interface HunterEmail {
  value: string;
  type: 'personal' | 'generic';
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: 'junior' | 'senior' | 'executive' | null;
  department: string | null;
  linkedin: string | null;
  twitter: string | null;
  phone_number: string | null;
}

export interface HunterDomainSearchResponse {
  data: {
    domain: string;
    disposable: boolean;
    webmail: boolean;
    accept_all: boolean;
    pattern: string | null;
    organization: string | null;
    country: string | null;
    state: string | null;
    emails: HunterEmail[];
    linked_domains: string[];
  };
  meta: {
    results: number;
    limit: number;
    offset: number;
    params: Record<string, string>;
  };
}

export interface HunterEmailFinderResponse {
  data: {
    first_name: string;
    last_name: string;
    email: string;
    score: number;
    domain: string;
    accept_all: boolean;
    position: string | null;
    linkedin: string | null;
    twitter: string | null;
    phone_number: string | null;
    company: string | null;
    sources: Array<{ domain: string; uri: string; extracted_on: string }>;
  };
}

export interface HunterSearchParams {
  domains: string[];
  department?: string;
  seniority?: string;
  limit?: number;
}
