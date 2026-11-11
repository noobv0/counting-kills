import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const cacheDir = join(process.cwd(), "data", "icons");
const pending = new Map<string, Promise<Uint8Array>>();
const iconQueue: Array<() => void> = [];
let activeFetches = 0;

async function withFetchLimit<T>(operation: () => Promise<T>) {
  if (activeFetches >= 4) await new Promise<void>((resolve) => iconQueue.push(resolve));
  activeFetches += 1;
  try { return await operation(); }
  finally {
    activeFetches -= 1;
    iconQueue.shift()?.();
  }
}

async function loadIcon(itemId: string) {
  const file = join(cacheDir, `${itemId}.png`);
  try { return new Uint8Array(await readFile(file)); } catch { /* first request for this icon */ }

  const plainId = itemId.split("@")[0];
  const fallbackId = plainId.replace(/^T\d+_/, "T4_");
  const ids = [...new Set([itemId, plainId, fallbackId])];
  let lastStatus = 404;
  for (const id of ids) {
    for (const url of [
      `https://render.albiononline.com/v1/item/${id}.png?quality=2&size=64`,
      `https://render.albiononline.com/v1/item/${id}.png`,
    ]) {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
        lastStatus = response.status;
        if (response.ok || (response.status !== 429 && response.status < 500)) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (response?.ok) {
        const image = new Uint8Array(await response.arrayBuffer());
        await mkdir(cacheDir, { recursive: true });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, image);
        try { await rename(temporary, file); } catch { /* another request may have cached the same item */ }
        return image;
      }
    }
  }
  throw new Error(`Renderizador de itens respondeu HTTP ${lastStatus}`);
}

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!/^[A-Za-z0-9_@-]+$/.test(itemId)) return NextResponse.json({ error: "ID de item inválido" }, { status: 400 });
  try {
    let operation = pending.get(itemId);
    if (!operation) {
      operation = withFetchLimit(() => loadIcon(itemId)).finally(() => pending.delete(itemId));
      pending.set(itemId, operation);
    }
    const image = await operation;
    const imageBody = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
    return new NextResponse(imageBody, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
