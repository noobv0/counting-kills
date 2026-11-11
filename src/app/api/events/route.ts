import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { getDatabaseSummary, getStoredEvents, getSyncState } = await import("@/lib/db");
  const { localizedNamesFor } = await import("@/lib/item-catalog");
  const search = request.nextUrl.searchParams.get("q") ?? "";
  const rows = getStoredEvents("americas", 150, search);
  return NextResponse.json({
    events: rows.map((row) => ({ ...row, data: JSON.parse(row.data) })),
    itemNames: localizedNamesFor(rows.map((row) => JSON.parse(row.data))),
    summary: getDatabaseSummary("americas"),
    state: getSyncState("americas") ?? null,
  }, { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=120" } });
}
