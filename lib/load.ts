import { buildDrives } from "./aggregate";
import { getSettings, redis } from "./redis";
import { EmailRec, ManualState, ResumeMeta } from "./types";

export async function loadAll() {
  const r = redis();
  const [settings, emails, states, links, resumes, meta] = await Promise.all([
    getSettings(),
    r.hgetall("emails"),
    r.hgetall("state"),
    r.hgetall("links"),
    r.hgetall("resumes"),
    r.get<{ at: number; total: number }>("meta:lastSync"),
  ]);
  const built = buildDrives({
    emails: Object.values((emails || {}) as Record<string, EmailRec>),
    states: (states || {}) as Record<string, ManualState>,
    links: (links || {}) as Record<string, string>,
    settings,
    resumes: Object.values((resumes || {}) as Record<string, ResumeMeta>),
    now: Date.now(),
  });
  return { ...built, settings, lastSync: meta, resumeCount: Object.keys(resumes || {}).length };
}
