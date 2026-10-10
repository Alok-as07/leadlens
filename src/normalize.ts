import { EmailStatus, NormalizedLead } from './types';

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com',
  'tempmail.com', 'yopmail.com', 'trashmail.com',
]);
const FREE = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'aol.com', 'proton.me',
]);
const ROLE = new Set([
  'info', 'sales', 'contact', 'support', 'hello', 'admin',
  'office', 'team', 'help', 'careers', 'jobs', 'marketing',
]);
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function classifyEmail(raw?: string): { email: string; status: EmailStatus } {
  const email = (raw ?? '').trim().toLowerCase();
  if (!email) return { email: '', status: 'missing' };
  if (!EMAIL_RE.test(email)) return { email, status: 'invalid' };
  const [local, domain] = email.split('@');
  if (DISPOSABLE.has(domain)) return { email, status: 'disposable' };
  if (ROLE.has(local)) return { email, status: 'role' };
  if (FREE.has(domain)) return { email, status: 'free' };
  return { email, status: 'valid' };
}

export function extractDomain(website?: string, email?: string): string {
  const w = (website ?? '').trim().toLowerCase();
  if (w) {
    const host = w.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    if (host.includes('.')) return host;
  }
  const e = (email ?? '').trim().toLowerCase();
  if (e.includes('@')) {
    const d = e.split('@')[1];
    if (d && !FREE.has(d) && !DISPOSABLE.has(d)) return d;
  }
  return '';
}

export function parseEmployees(raw?: string): number | null {
  const s = (raw ?? '').replace(/,/g, '').trim().toLowerCase();
  if (!s) return null;
  const range = s.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const single = s.match(/(\d+)/);
  return single ? Number(single[1]) : null;
}

export function dedupeKey(l: Pick<NormalizedLead, 'email' | 'domain' | 'company' | 'contactName'>): string {
  if (l.email) return `e:${l.email}`;
  const co = l.domain || l.company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `c:${co}|${l.contactName.toLowerCase().replace(/[^a-z]/g, '')}`;
}

const ALIASES: Record<keyof Omit<NormalizedLead, 'domain' | 'emailStatus'>, string[]> = {
  company: ['company', 'company_name', 'organization', 'organisation', 'account'],
  website: ['website', 'url', 'domain', 'company_website'],
  industry: ['industry', 'sector', 'vertical'],
  employees: ['employees', 'company_size', 'size', 'headcount', 'employee_count'],
  country: ['country', 'location', 'region', 'hq_country'],
  contactName: ['contact_name', 'name', 'full_name', 'contact'],
  title: ['title', 'job_title', 'role', 'position'],
  email: ['email', 'email_address', 'work_email'],
  linkedinUrl: ['linkedin_url', 'linkedin', 'linkedin_profile'],
  signals: ['signals', 'notes', 'triggers', 'intent'],
};

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (row[k] && row[k].trim()) return row[k].trim();
  return '';
}

export function normalizeRow(rawRow: Record<string, string>): NormalizedLead | null {
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    row[k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')] = String(v ?? '');
  }
  const company = pick(row, ALIASES.company);
  const { email, status } = classifyEmail(pick(row, ALIASES.email));
  const website = pick(row, ALIASES.website);
  if (!company && !email && !website) return null;
  return {
    company: company || extractDomain(website, email) || 'Unknown',
    domain: extractDomain(website, email),
    website,
    industry: pick(row, ALIASES.industry),
    employees: parseEmployees(pick(row, ALIASES.employees)),
    country: pick(row, ALIASES.country),
    contactName: pick(row, ALIASES.contactName),
    title: pick(row, ALIASES.title),
    email,
    emailStatus: status,
    linkedinUrl: pick(row, ALIASES.linkedinUrl),
    signals: pick(row, ALIASES.signals),
  };
}
