import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGION = "americas";
const API = "https://gameinfo.albiononline.com/api/gameinfo";

export async function POST() {
  const { getDatabaseSummary, getSyncState, saveEvents, updateSyncState } = await import("@/lib/db");
  const previous = getSyncState(REGION);
  if (previous?.last_checked_at && Date.now() - Date.parse(previous.last_checked_at) < 45_000) {
    return NextResponse.json({ ok: true, skipped: true, summary: getDatabaseSummary(REGION), state: previous });
  }

  try {
    const response = await fetch(`${API}/events?limit=50&offset=0`, {
      cache: "no-store",
      headers: { "User-Agent": "LedgerNorth-Americas/0.1 (community fan project)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Albion gameinfo respondeu HTTP ${response.status}`);
    const events = await response.json();
    if (!Array.isArray(events)) throw new Error("A API retornou um formato de eventos inesperado");
    const inserted = saveEvents(REGION, events);
    updateSyncState(REGION, true);
    return NextResponse.json({ ok: true, inserted, received: events.length, summary: getDatabaseSummary(REGION), state: getSyncState(REGION) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao consultar Albion";
    updateSyncState(REGION, false, message);
    return NextResponse.json({ ok: false, error: message, summary: getDatabaseSummary(REGION), state: getSyncState(REGION) }, { status: 502 });
  }
}
