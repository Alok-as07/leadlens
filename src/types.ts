export type EmailStatus = 'valid' | 'role' | 'free' | 'disposable' | 'invalid' | 'missing';

export interface NormalizedLead {
  company: string;
  domain: string;
  website: string;
  industry: string;
  employees: number | null;
  country: string;
  contactName: string;
  title: string;
  email: string;
  emailStatus: EmailStatus;
  linkedinUrl: string;
  signals: string;
}

export interface Icp {
  industries: string[];
  minEmployees: number;
  maxEmployees: number;
  countries: string[];
  titleKeywords: string[];
  signalKeywords: string[];
}

export interface ScoreReason {
  factor: string;
  points: number;
  max: number;
  note: string;
}

export interface ScoreResult {
  score: number;
  tier: 'A' | 'B' | 'C';
  reasons: ScoreReason[];
}

export const DEFAULT_ICP: Icp = {
  industries: ['saas', 'software', 'healthcare', 'logistics', 'fintech'],
  minEmployees: 20,
  maxEmployees: 500,
  countries: ['united states', 'canada', 'united kingdom'],
  titleKeywords: ['operations', 'growth', 'revenue', 'technology', 'product'],
  signalKeywords: ['hiring', 'funding', 'expanding', 'acquisition', 'new product'],
};
