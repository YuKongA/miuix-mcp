import fs from "fs";
import path from "path";
import crypto from "crypto";

type CacheEntry<T> = { data: T; expiresAt: number };

const memory = new Map<string, CacheEntry<any>>();
const CACHE_DIR = path.join(process.cwd(), ".cache", "miuix-mcp");

function ensureDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
}

function keyToFile(key: string) {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

function readDisk<T>(key: string): CacheEntry<T> | null {
  try {
    const file = keyToFile(key);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch { return null; }
}

function writeDisk<T>(key: string, entry: CacheEntry<T>) {
  try { ensureDir(); fs.writeFileSync(keyToFile(key), JSON.stringify(entry)); } catch {}
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const mem = memory.get(key) as CacheEntry<T> | undefined;
  if (mem && mem.expiresAt > now) return mem.data;

  const disk = readDisk<T>(key);
  if (disk && disk.expiresAt > now) {
    memory.set(key, disk);
    return disk.data;
  }

  try {
    const data = await fetcher();
    const entry: CacheEntry<T> = { data, expiresAt: now + ttlMs };
    memory.set(key, entry);
    writeDisk(key, entry);
    return data;
  } catch (err) {
    if (mem) return mem.data;
    if (disk) return disk.data;
    throw err;
  }
}

