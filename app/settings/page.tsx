"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

export default function Settings() {
  const { status } = useSession();
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState<{ t: string; k: "ok" | "err" } | null>(null);
  const [resumes, setResumes] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/settings"), fetch("/api/resumes")]);
    if (a.ok) setS(await a.json());
    if (b.ok) setResumes(await b.json());
  }, []);
  useEffect(() => { if (status === "authenticated") load(); }, [status, load]);

  const set = (k: string, v: string) => setS({ ...s, [k]: v });

  async function save() {
    const r = await fetch("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    setMsg(r.ok ? { t: "Saved. Press “Re-scan everything” on the dashboard so old mails are re-checked with the new details.", k: "ok" } : { t: "Save failed", k: "err" });
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/resumes", { method: "POST", body: new FormData(form) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ t: j.error || "Upload failed", k: "err" });
    form.reset(); load();
  }

  if (status === "unauthenticated") return <div className="center"><Link href="/">Sign in first</Link></div>;
  if (!s) return <div className="center sub">Loading…</div>;

  return (
    <div className="wrap">
      <header className="top"><h1>Settings</h1><Link className="btn" href="/">← Dashboard</Link></header>
      {msg && <div className={`msg ${msg.k}`}>{msg.t}</div>}

      <div className="card">
        <h2>Your details</h2>
        <div className="sub">Used to find you in shortlists and to check eligibility.</div>
        <label>SRN (exact, as printed on lists)</label>
        <input value={s.srn} onChange={(e) => set("srn", e.target.value)} />
        <label>Full name (as it appears on lists)</label>
        <input value={s.name} onChange={(e) => set("name", e.target.value)} />
        <div className="grid2">
          <div><label>10th %</label><input inputMode="decimal" value={s.tenth} onChange={(e) => set("tenth", e.target.value)} /></div>
          <div><label>12th %</label><input inputMode="decimal" value={s.twelfth} onChange={(e) => set("twelfth", e.target.value)} /></div>
          <div><label>UG CGPA</label><input inputMode="decimal" value={s.cgpa} onChange={(e) => set("cgpa", e.target.value)} /></div>
          <div><label>Active backlogs</label><input inputMode="numeric" value={s.backlogs} onChange={(e) => set("backlogs", e.target.value)} /></div>
        </div>
        <label>Branch (cse, ece, eee, me, ise…)</label>
        <input value={s.branch} onChange={(e) => set("branch", e.target.value)} />
        <label>Placement sender address(es), comma separated</label>
        <input value={s.senders} onChange={(e) => set("senders", e.target.value)} />
        <label>Optional Gmail label (also scanned)</label>
        <input value={s.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. placements" />
        <p><button className="primary" onClick={save}>Save</button></p>
      </div>

      <div className="card">
        <h2>Resumes</h2>
        <div className="sub">PDFs with selectable text. Tags help the matcher, e.g. “ml ai python pytorch nlp” or “react node fullstack web”.</div>
        {resumes.map((r) => (
          <div key={r.id} className="mt" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <b>{r.name}</b> <span className="sub">· {Math.round(r.size / 1024)} KB</span>
            <input defaultValue={r.tags} placeholder="tags" onBlur={(e) => e.target.value !== r.tags && fetch(`/api/resumes/${r.id}`, { method: "PATCH", body: JSON.stringify({ tags: e.target.value }) }).then(load)} />
            <div className="row mt">
              <a className="btn" href={`/api/resumes/${r.id}`} target="_blank" rel="noreferrer">View PDF</a>
              <button className="danger" onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await fetch(`/api/resumes/${r.id}`, { method: "DELETE" }); load(); } }}>Delete</button>
            </div>
          </div>
        ))}
        <form onSubmit={upload} className="mt" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <label>Add a resume (PDF, max 3 MB)</label>
          <input type="file" name="file" accept="application/pdf" required />
          <label>Name (e.g. “AI/ML resume”)</label>
          <input name="name" required />
          <label>Tags (optional)</label>
          <input name="tags" placeholder="ml ai python …" />
          <p><button className="primary" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button></p>
        </form>
      </div>
    </div>
  );
}
