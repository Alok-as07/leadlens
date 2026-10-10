import { Injectable, OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL, domain TEXT, website TEXT, industry TEXT,
  employees INTEGER, country TEXT, contact_name TEXT, title TEXT,
  email TEXT, email_status TEXT, linkedin_url TEXT, signals TEXT,
  score INTEGER DEFAULT 0, tier TEXT DEFAULT 'C', reasons TEXT DEFAULT '[]',
  outreach TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);
CREATE TABLE IF NOT EXISTS icp (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
`;

@Injectable()
export class DbService implements OnModuleInit {
  db!: Database.Database;

  onModuleInit() {
    const dir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
    mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, 'leadlens.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }
}
