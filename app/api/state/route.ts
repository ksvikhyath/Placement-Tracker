import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ManualState } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST { key, patch }  -> merge manual state for a company
// POST { link: { msgId, key } } -> manually attach an unlinked email to a company
export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const r = redis();
  if (body.link?.msgId && body.link?.key) {
    await r.hset("links", { [body.link.msgId]: body.link.key });
    return NextResponse.json({ ok: true });
  }
  if (!body.key || typeof body.patch !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const cur = ((await r.hget("state", body.key)) || {}) as ManualState;
  const next = { ...cur, ...body.patch };
  await r.hset("state", { [body.key]: next });
  return NextResponse.json({ ok: true, state: next });
}
