import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const targetPath = join(root, "data", "item-names.pt-BR.json");
const sourceUrl = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json";

const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Falha ao baixar catálogo: HTTP ${response.status}`);
const items = await response.json();

function shownName(id, localizedName) {
  if (!/_(?:MAIN|2H)_/.test(id)) return localizedName;
  return localizedName.replace(/\s+(?:do|da|dos|das)\s+(?:Iniciado|Novato|Aprendiz|Adepto|Perito|Mestre|Grão-mestre|Ancião|Sábio|Guardião)$/iu, "");
}

const catalog = {};
for (const item of items) {
  const id = item.UniqueName;
  const name = item.LocalizedNames?.["PT-BR"] || item.LocalizedNames?.["EN-US"];
  if (id && name && !catalog[id]) catalog[id] = shownName(id, name);
}

await mkdir(join(root, "data"), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(catalog)}\n`, "utf8");
console.log(`Catálogo salvo: ${Object.keys(catalog).length.toLocaleString("pt-BR")} itens.`);
