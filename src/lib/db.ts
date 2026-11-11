import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

type DbGlobal = typeof globalThis & { murderLedgerDb?: DatabaseSync };
const root = globalThis as DbGlobal;

export const db = root.murderLedgerDb ?? new DatabaseSync(join(dataDir, "murder-ledger.sqlite"));
root.murderLedgerDb = db;

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS events (
    region TEXT NOT NULL,
    event_id TEXT NOT NULL,
    happened_at TEXT,
    data TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (region, event_id)
  );
  CREATE INDEX IF NOT EXISTS events_time_idx ON events(region, happened_at DESC);
  CREATE TABLE IF NOT EXISTS sync_state (
    region TEXT PRIMARY KEY,
    last_checked_at TEXT,
    last_success_at TEXT,
    last_error TEXT
  );
`);

export function saveEvents(region: string, events: unknown[]) {
  const insert = db.prepare(`
    INSERT INTO events(region, event_id, happened_at, data, fetched_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(region, event_id) DO UPDATE SET
      data = excluded.data,
      happened_at = COALESCE(excluded.happened_at, events.happened_at),
      fetched_at = excluded.fetched_at
  `);
  const now = new Date().toISOString();
  let inserted = 0;
  for (const value of events) {
    if (!value || typeof value !== "object") continue;
    const event = value as Record<string, unknown>;
    const id = event.EventId ?? event.eventId ?? event.id;
    if (id === undefined || id === null) continue;
    const time = event.TimeStamp ?? event.timestamp ?? event.time;
    const result = insert.run(region, String(id), time ? String(time) : null, JSON.stringify(event), now) as { changes?: number };
    inserted += result.changes ?? 0;
  }
  return inserted;
}

export function updateSyncState(region: string, success: boolean, error?: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sync_state(region, last_checked_at, last_success_at, last_error)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(region) DO UPDATE SET
      last_checked_at = excluded.last_checked_at,
      last_success_at = COALESCE(excluded.last_success_at, sync_state.last_success_at),
      last_error = excluded.last_error
  `).run(region, now, success ? now : null, error ?? null);
}

export function getSyncState(region: string) {
  return db.prepare("SELECT * FROM sync_state WHERE region = ?").get(region) as
    | { last_checked_at: string | null; last_success_at: string | null; last_error: string | null }
    | undefined;
}

export function getStoredEvents(region: string, limit = 150, search = "") {
  const query = search.trim();
  const rows = query
    ? db.prepare(`SELECT event_id, happened_at, data, fetched_at FROM events WHERE region = ? AND data LIKE ? ORDER BY happened_at DESC LIMIT ?`)
        .all(region, `%${query}%`, limit)
    : db.prepare(`SELECT event_id, happened_at, data, fetched_at FROM events WHERE region = ? ORDER BY happened_at DESC LIMIT ?`)
        .all(region, limit);
  return rows as Array<{ event_id: string; happened_at: string | null; data: string; fetched_at: string }>;
}

export function getStoredEvent(region: string, eventId: string) {
  return db.prepare("SELECT event_id, happened_at, data, fetched_at FROM events WHERE region = ? AND event_id = ?")
    .get(region, eventId) as { event_id: string; happened_at: string | null; data: string; fetched_at: string } | undefined;
}

export function getDatabaseSummary(region: string) {
  return db.prepare(`SELECT COUNT(*) AS total, MIN(happened_at) AS oldest, MAX(happened_at) AS newest FROM events WHERE region = ?`)
    .get(region) as { total: number; oldest: string | null; newest: string | null };
}
