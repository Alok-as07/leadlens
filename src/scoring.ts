import { EmailStatus, Icp, NormalizedLead, ScoreReason, ScoreResult } from './types';

type Scorable = Pick<NormalizedLead, 'industry' | 'employees' | 'country' | 'title' | 'signals'> & {
  emailStatus: EmailStatus;
};

const has = (haystack: string, needles: string[]) =>
  needles.filter((n) => n && haystack.toLowerCase().includes(n.toLowerCase()));

function seniority(title: string): { weight: number; label: string } {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|coo|cfo|chief|founder|co-founder|owner|president|partner)\b/.test(t))
    return { weight: 1, label: 'executive / owner' };
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return { weight: 0.8, label: 'VP / director' };
  if (/\b(manager|lead)\b/.test(t)) return { weight: 0.5, label: 'manager' };
  return { weight: t ? 0.2 : 0, label: t ? 'individual contributor' : 'no title' };
}

export function scoreLead(lead: Scorable, icp: Icp): ScoreResult {
  const reasons: ScoreReason[] = [];

  // Industry fit (25)
  const ind = has(lead.industry, icp.industries);
  reasons.push(
    !icp.industries.length
      ? { factor: 'Industry', points: 12, max: 25, note: 'No industry preference set' }
      : ind.length
      ? { factor: 'Industry', points: 25, max: 25, note: `Matches ICP (${ind[0]})` }
      : { factor: 'Industry', points: 0, max: 25, note: lead.industry ? `${lead.industry} is outside ICP` : 'Industry unknown' },
  );

  // Company size (20)
  const n = lead.employees;
  let sizePts = 6, sizeNote = 'Size unknown';
  if (n !== null) {
    const { minEmployees: lo, maxEmployees: hi } = icp;
    if (n >= lo && n <= hi) { sizePts = 20; sizeNote = `${n} employees, inside ${lo}-${hi}`; }
    else if (n >= lo * 0.5 && n <= hi * 1.5) { sizePts = 10; sizeNote = `${n} employees, near ${lo}-${hi}`; }
    else { sizePts = 0; sizeNote = `${n} employees, outside ${lo}-${hi}`; }
  }
  reasons.push({ factor: 'Company size', points: sizePts, max: 20, note: sizeNote });

  // Decision-maker fit (25): seniority 15 + role keyword 10
  const sen = seniority(lead.title);
  const kw = has(lead.title, icp.titleKeywords);
  const titlePts = Math.round(sen.weight * 15) + (kw.length ? 10 : 0);
  reasons.push({
    factor: 'Decision-maker',
    points: titlePts,
    max: 25,
    note: `${sen.label}${kw.length ? `, role matches "${kw[0]}"` : ''}`,
  });

  // Email deliverability (15)
  const emailMap: Record<EmailStatus, [number, string]> = {
    valid: [15, 'Personal business email'],
    role: [7, 'Role inbox (info@, sales@) – lower reply rate'],
    free: [8, 'Free mailbox provider'],
    disposable: [0, 'Disposable address – exclude'],
    invalid: [0, 'Malformed email'],
    missing: [0, 'No email – enrich before outreach'],
  };
  const [ePts, eNote] = emailMap[lead.emailStatus];
  reasons.push({ factor: 'Email quality', points: ePts, max: 15, note: eNote });

  // Buying signals (10)
  const sig = has(lead.signals, icp.signalKeywords);
  reasons.push({
    factor: 'Buying signals',
    points: Math.min(10, sig.length * 5),
    max: 10,
    note: sig.length ? `Signals: ${sig.join(', ')}` : 'No signals',
  });

  // Geography (5)
  const geo = icp.countries.length ? has(lead.country, icp.countries).length > 0 : true;
  reasons.push({ factor: 'Geography', points: geo ? 5 : 0, max: 5, note: geo ? 'In target region' : `${lead.country || 'Unknown'} outside target` });

  const score = reasons.reduce((s, r) => s + r.points, 0);
  return { score, tier: score >= 85 ? 'A' : score >= 50 ? 'B' : 'C', reasons };
}
