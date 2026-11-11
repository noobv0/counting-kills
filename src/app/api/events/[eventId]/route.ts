import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = "https://gameinfo.albiononline.com/api/gameinfo";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { getStoredEvent, saveEvents, updateSyncState } = await import("@/lib/db");
  const { localizedNamesFor } = await import("@/lib/item-catalog");
  const { eventId } = await params;
  const cached = getStoredEvent("americas", eventId);
  if (cached) {
    const event = JSON.parse(cached.data);
    return NextResponse.json({ event, itemNames: localizedNamesFor([event]), detailSource: "cópia local" }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  }
  try {
    const response = await fetch(`${API}/events/${encodeURIComponent(eventId)}`, {
      cache: "no-store",
      headers: { "User-Agent": "LedgerNorth-Americas/0.1 (community fan project)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) {
      const data = await response.json();
      saveEvents("americas", [data]);
      return NextResponse.json({ event: data, itemNames: localizedNamesFor([data]), detailSource: "Albion gameinfo" });
    }
    throw new Error(`Albion gameinfo respondeu HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os detalhes";
    updateSyncState("americas", false, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
