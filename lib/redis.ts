import { Redis } from "@upstash/redis";
import { DEFAULT_SETTINGS, Settings } from "./types";

let _r: Redis | null = null;
export function redis(): Redis {
  if (_r) return _r;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis env vars missing (UPSTASH_REDIS_REST_URL / _TOKEN)");
  _r = new Redis({ url, token });
  return _r;
}

export async function getSettings(): Promise<Settings> {
  const s = await redis().get<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}
