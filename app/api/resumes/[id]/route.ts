import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ResumeMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = redis();
  const [meta, b64] = await Promise.all([r.hget("resumes", params.id), r.get<string>(`resume:file:${params.id}`)]);
  if (!meta || !b64) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = ((meta as ResumeMeta).name || "resume").replace(/[^\w.\- ]+/g, "_");
  return new Response(Buffer.from(b64, "base64"), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const r = redis();
  const meta = (await r.hget("resumes", params.id)) as ResumeMeta | null;
  if (!meta) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (typeof b.tags === "string") meta.tags = b.tags;
  if (typeof b.name === "string" && b.name.trim()) meta.name = b.name.trim();
  await r.hset("resumes", { [params.id]: meta });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = redis();
  await r.hdel("resumes", params.id);
  await r.del(`resume:file:${params.id}`);
  return NextResponse.json({ ok: true });
}
