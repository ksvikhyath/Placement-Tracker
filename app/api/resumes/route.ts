import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ResumeMeta } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const all = ((await redis().hgetall("resumes")) || {}) as Record<string, ResumeMeta>;
  const list = Object.values(all)
    .map(({ text, ...m }) => ({ ...m, chars: text.length }))
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Upload a PDF file" }, { status: 400 });
  }
  if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "PDF must be under 3 MB" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  let text = "";
  try {
    text = (await pdfParse(buf)).text || "";
  } catch {
    return NextResponse.json({ error: "Couldn't read that PDF" }, { status: 400 });
  }
  if (text.replace(/\s/g, "").length < 50) {
    return NextResponse.json({ error: "PDF has no selectable text (scanned?). Export it again from Word/LaTeX." }, { status: 400 });
  }
  const id = crypto.randomUUID().slice(0, 8);
  const name = String(form.get("name") || file.name.replace(/\.pdf$/i, "")).trim();
  const tags = String(form.get("tags") || "").trim();
  const meta: ResumeMeta = { id, name, tags, text: text.slice(0, 30000), uploadedAt: Date.now(), size: file.size };
  const r = redis();
  await r.hset("resumes", { [id]: meta });
  await r.set(`resume:file:${id}`, buf.toString("base64"));
  return NextResponse.json({ id });
}
