import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { DbService } from './db.service';
import { dedupeKey, normalizeRow } from './normalize';
import { scoreLead } from './scoring';
import { DEFAULT_ICP, Icp, NormalizedLead } from './types';

export interface ListQuery {
  minScore?: string; tier?: string; search?: string;
  sort?: string; limit?: string; offset?: string;
}

@Injectable()
export class LeadsService {
  constructor(private readonly store: DbService) {}
  private get db() { return this.store.db; }

  getIcp(): Icp {
    const row = this.db.prepare('SELECT json FROM icp WHERE id = 1').get() as { json: string } | undefined;
    return row ? { ...DEFAULT_ICP, ...JSON.parse(row.json) } : DEFAULT_ICP;
  }

  setIcp(input: Partial<Icp>): Icp {
    const list = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : []);
    const icp: Icp = {
      industries: list(input.industries),
      countries: list(input.countries),
      titleKeywords: list(input.titleKeywords),
      signalKeywords: list(input.signalKeywords),
      minEmployees: Math.max(0, Number(input.minEmployees) || 0),
      maxEmployees: Math.max(0, Number(input.maxEmployees) || 100000),
    };
    this.db.prepare('INSERT INTO icp (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(JSON.stringify(icp));
    this.rescoreAll();
    return icp;
  }

  rescoreAll() {
    const icp = this.getIcp();
    const rows = this.db.prepare('SELECT id, industry, employees, country, title, signals, email_status FROM leads').all() as any[];
    const upd = this.db.prepare('UPDATE leads SET score = ?, tier = ?, reasons = ? WHERE id = ?');
    this.db.transaction(() => {
      for (const r of rows) {
        const s = scoreLead({ ...r, emailStatus: r.email_status }, icp);
        upd.run(s.score, s.tier, JSON.stringify(s.reasons), r.id);
      }
    })();
  }

  importCsv(csv: string) {
    const records: Record<string, string>[] = parse(csv, {
      columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true,
    });
    const icp = this.getIcp();
    let inserted = 0, merged = 0, skipped = 0, flagged = 0;

    const find = this.db.prepare('SELECT * FROM leads WHERE dedupe_key = ?');
    const insert = this.db.prepare(`INSERT INTO leads
      (dedupe_key, company, domain, website, industry, employees, country, contact_name, title,
       email, email_status, linkedin_url, signals, score, tier, reasons)
      VALUES (@key,@company,@domain,@website,@industry,@employees,@country,@contactName,@title,
       @email,@emailStatus,@linkedinUrl,@signals,@score,@tier,@reasons)`);
    const update = this.db.prepare(`UPDATE leads SET company=@company, domain=@domain, website=@website,
      industry=@industry, employees=@employees, country=@country, contact_name=@contactName, title=@title,
      email_status=@emailStatus, linkedin_url=@linkedinUrl, signals=@signals,
      score=@score, tier=@tier, reasons=@reasons WHERE id=@id`);

    this.db.transaction(() => {
      for (const rec of records) {
        const lead = normalizeRow(rec);
        if (!lead) { skipped++; continue; }
        if (['invalid', 'disposable'].includes(lead.emailStatus)) flagged++;
        const key = dedupeKey(lead);
        const existing = find.get(key) as any;
        if (existing) {
          const m = this.merge(existing, lead);
          const s = scoreLead(m, icp);
          update.run({ ...m, id: existing.id, score: s.score, tier: s.tier, reasons: JSON.stringify(s.reasons) });
          merged++;
        } else {
          const s = scoreLead(lead, icp);
          insert.run({ ...lead, key, score: s.score, tier: s.tier, reasons: JSON.stringify(s.reasons) });
          inserted++;
        }
      }
    })();
    return { received: records.length, inserted, merged, skipped, flaggedEmails: flagged };
  }

  private merge(existing: any, incoming: NormalizedLead): NormalizedLead {
    const pick = (a: any, b: any) => (a !== null && a !== undefined && a !== '' ? a : b);
    const sig = [...new Set(`${existing.signals ?? ''};${incoming.signals}`.split(/[;,]/).map((s) => s.trim()).filter(Boolean))];
    return {
      company: pick(existing.company, incoming.company),
      domain: pick(existing.domain, incoming.domain),
      website: pick(existing.website, incoming.website),
      industry: pick(existing.industry, incoming.industry),
      employees: pick(existing.employees, incoming.employees),
      country: pick(existing.country, incoming.country),
      contactName: pick(existing.contact_name, incoming.contactName),
      title: pick(existing.title, incoming.title),
      email: existing.email || incoming.email,
      emailStatus: existing.email_status,
      linkedinUrl: pick(existing.linkedin_url, incoming.linkedinUrl),
      signals: sig.join('; '),
    };
  }

  private map(r: any) {
    return {
      id: r.id, company: r.company, domain: r.domain, website: r.website, industry: r.industry,
      employees: r.employees, country: r.country, contactName: r.contact_name, title: r.title,
      email: r.email, emailStatus: r.email_status, linkedinUrl: r.linkedin_url, signals: r.signals,
      score: r.score, tier: r.tier, reasons: JSON.parse(r.reasons || '[]'), outreach: r.outreach,
    };
  }

  list(q: ListQuery) {
    const where: string[] = []; const p: any[] = [];
    if (q.minScore) { where.push('score >= ?'); p.push(Number(q.minScore) || 0); }
    if (q.tier) { where.push('tier = ?'); p.push(q.tier.toUpperCase()); }
    if (q.search) {
      where.push('(company LIKE ? OR contact_name LIKE ? OR title LIKE ? OR industry LIKE ? OR email LIKE ?)');
      p.push(...Array(5).fill(`%${q.search}%`));
    }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortCol = { score: 'score DESC', company: 'company COLLATE NOCASE ASC', recent: 'id DESC' }[q.sort ?? 'score'] ?? 'score DESC';
    const limit = Math.min(500, Number(q.limit) || 100);
    const offset = Number(q.offset) || 0;
    const total = (this.db.prepare(`SELECT COUNT(*) c FROM leads ${W}`).get(...p) as any).c;
    const rows = this.db.prepare(`SELECT * FROM leads ${W} ORDER BY ${sortCol}, id LIMIT ? OFFSET ?`).all(...p, limit, offset);
    return { total, rows: rows.map((r) => this.map(r)) };
  }

  get(id: number) {
    const r = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    return r ? this.map(r) : null;
  }

  topUnenriched(limit: number) {
    const rows = this.db.prepare('SELECT * FROM leads WHERE outreach IS NULL ORDER BY score DESC LIMIT ?').all(limit);
    return rows.map((r) => this.map(r));
  }

  saveOutreach(id: number, text: string) {
    this.db.prepare('UPDATE leads SET outreach = ? WHERE id = ?').run(text, id);
  }

  stats() {
    const one = (sql: string) => this.db.prepare(sql).get() as any;
    const tiers = this.db.prepare('SELECT tier, COUNT(*) c FROM leads GROUP BY tier').all() as any[];
    const emails = this.db.prepare('SELECT email_status s, COUNT(*) c FROM leads GROUP BY email_status').all() as any[];
    return {
      total: one('SELECT COUNT(*) c FROM leads').c,
      avgScore: Math.round(one('SELECT COALESCE(AVG(score),0) a FROM leads').a),
      tiers: Object.fromEntries(tiers.map((t) => [t.tier, t.c])),
      emailStatus: Object.fromEntries(emails.map((e) => [e.s, e.c])),
    };
  }

  exportCsv(minScore?: string, tier?: string): string {
    const { rows } = this.list({ minScore, tier, limit: '500' });
    return stringify(
      rows.map((r) => ({
        score: r.score, tier: r.tier, company: r.company, website: r.website, industry: r.industry,
        employees: r.employees ?? '', country: r.country, contact_name: r.contactName, title: r.title,
        email: r.email, email_status: r.emailStatus, linkedin_url: r.linkedinUrl,
        signals: r.signals, why: r.reasons.filter((x: any) => x.points > 0).map((x: any) => `${x.factor}: ${x.note}`).join(' | '),
        outreach_angle: r.outreach ?? '',
      })),
      { header: true },
    );
  }

  clear() { this.db.prepare('DELETE FROM leads').run(); }
}
