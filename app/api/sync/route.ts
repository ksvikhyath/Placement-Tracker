import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { full } = await req.json().catch(() => ({}));
  try {
    const res = await runSync({ budgetMs: 40_000, full: !!full });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
