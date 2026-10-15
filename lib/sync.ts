import { accessToken, buildQuery, getAttachment, getMessage, listMessageIds } from "./gmail";
import { processMessage, settingsHash } from "./process";
import { getSettings, redis } from "./redis";
import { EmailRec } from "./types";

export type SyncResult = {
  total: number;
  processed: number;
  remaining: number;
  failed: number;
  errors: string[];
};

/** Process as many new/changed emails as fit in the time budget. Safe to call repeatedly. */
export async function runSync(opts: { budgetMs: number; full?: boolean }): Promise<SyncResult> {
  const t0 = Date.now();
  const r = redis();
  const settings = await getSettings();
  const sh = settingsHash(settings);
  if (opts.full) await r.del("emails");

  const token = await accessToken();
  const ids = await listMessageIds(token, buildQuery(settings));
  const existing = ((await r.hgetall("emails")) || {}) as Record<string, EmailRec>;
  const todo = ids.filter((id) => !existing[id] || existing[id].sh !== sh);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const id of todo) {
    if (Date.now() - t0 > opts.budgetMs) break;
    try {
      const msg = await getMessage(token, id);
      const rec = await processMessage(msg, settings, (attId) => getAttachment(token, id, attId));
      rec.sh = sh;
      await r.hset("emails", { [id]: rec });
      processed++;
    } catch (e: any) {
      failed++;
      errors.push(`${id}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  await r.set("meta:lastSync", { at: Date.now(), total: ids.length });
  return { total: ids.length, processed, remaining: todo.length - processed, failed, errors: errors.slice(0, 5) };
}
