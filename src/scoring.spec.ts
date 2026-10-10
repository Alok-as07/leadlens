import { scoreLead } from './scoring';
import { classifyEmail, dedupeKey, parseEmployees, normalizeRow } from './normalize';
import { DEFAULT_ICP } from './types';

describe('scoreLead', () => {
  it('ranks an ideal lead as tier A with explanations', () => {
    const r = scoreLead(
      { industry: 'SaaS', employees: 120, country: 'United States', title: 'VP of Operations',
        signals: 'hiring; funding', emailStatus: 'valid' },
      DEFAULT_ICP,
    );
    expect(r.tier).toBe('A');
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.reasons).toHaveLength(6);
  });

  it('ranks a poor-fit lead as tier C', () => {
    const r = scoreLead(
      { industry: 'Agriculture', employees: 5, country: 'France', title: 'Intern', signals: '', emailStatus: 'disposable' },
      DEFAULT_ICP,
    );
    expect(r.tier).toBe('C');
  });
});

describe('normalize', () => {
  it('classifies emails', () => {
    expect(classifyEmail('Jane@Acme.com').status).toBe('valid');
    expect(classifyEmail('info@acme.com').status).toBe('role');
    expect(classifyEmail('x@mailinator.com').status).toBe('disposable');
    expect(classifyEmail('not-an-email').status).toBe('invalid');
    expect(classifyEmail('').status).toBe('missing');
  });

  it('parses employee ranges', () => {
    expect(parseEmployees('50-150')).toBe(100);
    expect(parseEmployees('1,200')).toBe(1200);
    expect(parseEmployees('')).toBeNull();
  });

  it('produces the same dedupe key for equivalent rows', () => {
    const a = normalizeRow({ Company: 'Acme', Email: 'JANE@acme.com' })!;
    const b = normalizeRow({ company_name: 'ACME Inc', email_address: 'jane@acme.com ' })!;
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });
});
