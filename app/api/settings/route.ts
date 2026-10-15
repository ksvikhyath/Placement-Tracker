import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSettings, redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const cur = await getSettings();
  const n = (v: any, d: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  const next = {
    srn: String(b.srn ?? cur.srn).trim(),
    name: String(b.name ?? cur.name).trim(),
    tenth: n(b.tenth, cur.tenth),
    twelfth: n(b.twelfth, cur.twelfth),
    cgpa: n(b.cgpa, cur.cgpa),
    backlogs: n(b.backlogs, cur.backlogs),
    branch: String(b.branch ?? cur.branch).trim().toLowerCase(),
    senders: String(b.senders ?? cur.senders).trim(),
    label: String(b.label ?? cur.label).trim(),
  };
  await redis().set("settings", next);
  return NextResponse.json(next);
}
