import { Injectable, Logger } from '@nestjs/common';
import { LeadsService } from './leads.service';

type L = ReturnType<LeadsService['get']> & {};

@Injectable()
export class EnrichService {
  private readonly log = new Logger(EnrichService.name);
  private readonly cache = new Map<string, string>();
  private static readonly MAX_CACHE = 500;

  constructor(private readonly leads: LeadsService) {}

  async enrichOne(id: number): Promise<string | null> {
    const lead = this.leads.get(id);
    if (!lead) return null;
    if (lead.outreach) return lead.outreach;
    const key = [lead.title, lead.industry, lead.signals].join('|').toLowerCase();
    let text = this.cache.get(key);
    if (!text) {
      text = (await this.viaLlm(lead)) ?? this.template(lead);
      if (this.cache.size >= EnrichService.MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(key, text);
    }
    this.leads.saveOutreach(id, text);
    return text;
  }

  async enrichTop(limit: number) {
    const targets = this.leads.topUnenriched(Math.min(limit, 25));
    for (let i = 0; i < targets.length; i += 3) {
      await Promise.all(targets.slice(i, i + 3).map((t) => this.enrichOne(t.id)));
    }
    return { enriched: targets.length };
  }

  private template(l: NonNullable<L>): string {
    const sig = l.signals ? l.signals.split(/[;,]/)[0].trim() : '';
    const hook = sig ? `noticed ${l.company} is ${sig.toLowerCase()}` : `works with ${l.industry || 'teams like yours'}`;
    return `Lead with relevance: ${hook}. Offer a short idea for ${l.title || 'their team'} and ask for 15 minutes.`;
  }

  private async viaLlm(l: NonNullable<L>): Promise<string | null> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content:
              `Write ONE sentence (max 35 words) suggesting the best opening angle for a cold email to ` +
              `${l.contactName || 'a contact'}, ${l.title || 'decision maker'} at ${l.company} (${l.industry}, ` +
              `${l.employees ?? 'unknown'} employees). Buying signals: ${l.signals || 'none'}. ` +
              `No greeting, no invented facts, plain text only.`,
          }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}`);
      const data: any = await res.json();
      const text = data.content?.find((c: any) => c.type === 'text')?.text?.trim();
      return text || null;
    } catch (e) {
      this.log.warn(`LLM enrichment failed, using template: ${(e as Error).message}`);
      return null;
    }
  }
}
