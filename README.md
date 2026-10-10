# LeadLens

**Know who to call first.** LeadLens is a prioritization layer for lead-generation tools such as SaaSquatch. Scraping gets you thousands of rows; LeadLens turns them into a ranked, cleaned, explainable call list.

Built for the Caprae Capital AI-readiness challenge, using a "quality first" approach: one feature, done well.

## The problem

Lead tools return volume, not priority. Sales teams then waste hours on duplicates, dead emails, role inboxes (`info@`) and companies that don't fit their target market.

## What it does

| Step | Feature |
|---|---|
| 1. Import | Upload any lead CSV. Flexible header matching (`Company Name`, `company`, `organization` ... all work). |
| 2. Clean | Normalizes domains and employee ranges, validates emails (malformed, disposable, role, free-provider), **deduplicates** by email or company+contact, and merges duplicate records instead of dropping data. |
| 3. Score | Scores every lead 0-100 against a configurable **Ideal Customer Profile** and assigns tier A/B/C. |
| 4. Explain | Every score breaks down into six factors with a plain-language reason, so reps trust the ranking. |
| 5. Act | One-sentence **outreach angle** per lead (LLM, with a deterministic template fallback). |
| 6. Export | CRM-ready CSV including score, tier, "why" and outreach angle. |

### Scoring model (100 points)

| Factor | Points | Logic |
|---|---|---|
| Industry fit | 25 | Matches ICP industries |
| Company size | 20 | Inside range = full, near range = half |
| Decision-maker | 25 | Seniority (15) + role keyword match (10) |
| Email quality | 15 | Personal business email > role/free > invalid/missing |
| Buying signals | 10 | 5 points per matched signal (hiring, funding, ...) |
| Geography | 5 | In target countries |

Tiers: **A** >= 85, **B** >= 50, **C** below. Changing the ICP re-ranks all leads instantly.

## Tech stack and architecture

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS 10 + TypeScript on Node 20 | Modular, typed, fast to build |
| Storage | **SQLite** (`better-sqlite3`, WAL mode) | Zero-setup for reviewers; indexed on score and tier. `DbService` is the only file to change to move to **PostgreSQL (AWS RDS)** in production |
| Caching | In-memory LRU-style map (500 entries) keyed by title+industry+signals, plus outreach persisted in the DB | Identical lead profiles never trigger a second LLM call |
| Performance | Single transaction per import; indexed queries; paging capped at 500; LLM calls batched 3 at a time with a 15s timeout | Imports of thousands of rows finish in a single DB transaction |
| LLM | Anthropic Messages API via `fetch`, model set by `ANTHROPIC_MODEL` | Optional; falls back to templates when no key or on error |
| Frontend | Static HTML/CSS/vanilla JS served by Nest (`@nestjs/serve-static`) | No build step, one deployable unit |
| Hosting | Single container (Dockerfile included) | Static assets and API on the same origin |
| Deployment (suggested) | Docker image -> Amazon ECR -> AWS App Runner (or ECS Fargate) | Managed HTTPS and autoscaling. Use RDS Postgres for persistence, because container disks are ephemeral |

```
CSV --> parse --> normalize/validate --> dedupe+merge --> score(ICP) --> SQLite
                                                             ^              |
                                          ICP change --------+              v
                                                       REST API --> UI / CSV export
                                                             \--> LLM outreach (cached)
```

## UX decisions

- The score bar is split into six coloured segments, one per factor, so the reason for a rank is visible without opening the row.
- Click or press Enter on a row to see per-factor reasons and the outreach angle.
- The ICP editor sits beside the table: change it, hit save, and watch the order change.
- Empty, error and success states say what happened and what to do next.
- Keyboard focus is visible, reduced-motion is respected, layout collapses on mobile.

## Run it

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY for LLM outreach angles
npm run build
npm start                 # http://localhost:3000
npm test                  # unit tests for scoring and normalization
```

Then click **Load sample data** (`public/sample_leads.csv`, 15 rows with deliberate duplicates, a bad email, a disposable email and a role inbox).

Docker: `docker build -t leadlens . && docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... leadlens`

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/leads/import` | Body: CSV text, `Content-Type: text/csv` |
| GET | `/api/leads` | `search`, `tier`, `minScore`, `sort`, `limit`, `offset` |
| POST | `/api/leads/enrich` | `{ "limit": 10 }` writes outreach angles for the top unenriched leads |
| POST | `/api/leads/:id/enrich` | Single lead |
| GET | `/api/leads/export.csv` | `tier`, `minScore` |
| GET/PUT | `/api/icp` | Read or update the ICP (re-scores all leads) |
| GET | `/api/stats` | Counts per tier and email status |
| DELETE | `/api/leads` | Clear all |

## Ethics and data handling

LeadLens does **not** scrape. It processes lead data the user already has the right to use, so it avoids ToS, CAPTCHA and IP-block issues. It flags risky emails before outreach, and outreach prompts forbid inventing facts. API keys stay server-side.

## Known limitations and next steps

- Email validation is syntactic plus provider/role heuristics. Next: MX lookup and SMTP-level verification.
- Scoring weights are fixed. Next: learn weights from won/lost deals.
- Single-tenant. Next: auth, per-workspace ICPs, Postgres.
- CRM push (HubSpot / Salesforce) and a SaaSquatch import connector.
- Fuzzy company matching ("Acme Inc" vs "Acme Incorporated") beyond domain matching.
