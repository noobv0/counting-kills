import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let names: Record<string, string> | null = null;

function getNames() {
  if (!names) {
    names = JSON.parse(readFileSync(join(process.cwd(), "data", "item-names.pt-BR.json"), "utf8")) as Record<string, string>;
  }
  return names;
}

function collectItemIds(value: unknown, ids: Set<string>) {
  if (Array.isArray(value)) {
    for (const entry of value) collectItemIds(entry, ids);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.Type === "string") ids.add(record.Type);
  for (const entry of Object.values(record)) collectItemIds(entry, ids);
}

export function localizedNamesFor(events: unknown[]) {
  const allNames = getNames();
  const ids = new Set<string>();
  collectItemIds(events, ids);
  const result: Record<string, string> = {};
  for (const id of ids) {
    const baseId = id.split("@")[0];
    if (allNames[baseId]) result[id] = allNames[baseId];
  }
  return result;
}
