"use client";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Drive = any;
const FILTERS: [string, string, (d: Drive) => boolean][] = [
  ["open", "Open", (d) => d.status === "open"],
  ["applied", "Applied", (d) => ["applied", "check"].includes(d.status)],
  ["shortlisted", "Shortlisted", (d) => d.status === "shortlisted"],
  ["rejected", "Rejected", (d) => ["rejected", "out"].includes(d.status)],
  ["missed", "Missed / N/A", (d) => ["missed", "ineligible", "skipped"].includes(d.status)],
  ["all", "All", () => true],
];

const BADGE: Record<string, string> = {
  open: "b-info", ineligible: "b-grey", missed: "b-grey", applied: "b-warn", shortlisted: "b-ok",
  out: "b-bad", check: "b-warn", rejected: "b-bad", skipped: "b-grey",
};

function countdown(iso: string | null): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5), h = Math.floor((abs % 864e5) / 36e5), m = Math.floor((abs % 36e5) / 6e4);
  const t = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? { text: `closed ${t} ago`, urgent: false } : { text: `closes in ${t}`, urgent: ms < 864e5 * 1.5 };
}
const fmt = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Home() {
  const { status } = useSession();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("open");
  const [syncing, setSyncing] = useState("");
  const [resumes, setResumes] = useState<any[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/drives");
    if (r.status === 401) { setErr("Signed in with an account that isn't allowed, or session expired."); return; }
    const j = await r.json();
    if (j.error) { setErr(j.error); return; }
    setErr(""); setData(j);
    const rr = await fetch("/api/resumes"); if (rr.ok) setResumes(await rr.json());
  }, []);

  useEffect(() => { if (status === "authenticated") load(); }, [status, load]);

  async function sync(full = false) {
    setSyncing("Starting…"); setErr("");
    try {
      for (let i = 0; i < 60; i++) {
        const r = await fetch("/api/sync", { method: "POST", body: JSON.stringify({ full: full && i === 0 }) });
        const j = await r.json();
        if (j.error) { setErr(j.error); break; }
        setSyncing(`Scanned ${j.total - j.remaining}/${j.total} emails…`);
        if (j.remaining <= 0 || (j.processed === 0 && j.failed > 0)) {
          if (j.failed) setErr(`${j.failed} email(s) failed: ${j.errors?.[0] || ""}`);
          break;
        }
      }
    } catch (e: any) { setErr(String(e)); }
    setSyncing(""); load();
  }

  async function patch(key: string, p: any) {
    await fetch("/api/state", { method: "POST", body: JSON.stringify({ key, patch: p }) });
    load();
  }

  const drives: Drive[] = data?.drives || [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k, , f]) => [k, drives.filter(f).length])), [drives]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x[0] === filter)![2];
    const list = drives.filter(f);
    if (filter === "open") return list.sort((a, b) => (Date.parse(a.drive.deadlineISO) || 9e15) - (Date.parse(b.drive.deadlineISO) || 9e15));
    return list.sort((a, b) => b.lastActivity - a.lastActivity);
  }, [drives, filter]);

  if (status === "loading") return <div className="center sub">Loading…</div>;
  if (status === "unauthenticated")
    return (
      <div className="center">
        <h1>Placement Tracker</h1>
        <p className="sub">Private dashboard. Sign in with the Google account that receives placement mail.</p>
        <button className="primary" onClick={() => signIn("google")}>Sign in with Google</button>
      </div>
    );

  const urgent = drives.filter((d) => d.status === "open" && countdown(d.drive.deadlineISO)?.urgent);

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Placement Tracker</h1>
          <div className="sub">
            {data?.lastSync ? `Last sync ${fmt(data.lastSync.at)} · ${data.lastSync.total} mails` : "Not synced yet"}
          </div>
        </div>
        <div className="row">
          <button className="primary" disabled={!!syncing} onClick={() => sync(false)}>{syncing || "Sync mail"}</button>
          <Link className="btn" href="/settings">Settings</Link>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      {err && <div className="msg err">{err}</div>}
      {data && !data.resumeCount && (
        <div className="msg info">No resumes uploaded yet. <Link href="/settings">Upload them in Settings</Link> to get recommendations.</div>
      )}
      {urgent.length > 0 && (
        <div className="msg" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
          ⏰ Closing soon: {urgent.map((d) => d.company).join(", ")}
        </div>
      )}

      <div className="stats">
        <div className="stat"><b>{drives.length}</b><span>companies</span></div>
        <div className="stat"><b>{counts.open}</b><span>open to apply</span></div>
        <div className="stat"><b>{counts.applied}</b><span>applied</span></div>
        <div className="stat"><b>{counts.shortlisted}</b><span>shortlisted</span></div>
        <div className="stat"><b>{counts.rejected}</b><span>rejected</span></div>
      </div>

      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? "sel" : ""}`} onClick={() => setFilter(k)}>
            {label} · {counts[k] ?? 0}
          </button>
        ))}
      </div>

      {!data && !err && <div className="sub">Loading…</div>}
      {data && !drives.length && (
        <div className="msg info">No drives found yet. Press “Sync mail”. If it stays empty, check the sender address in Settings.</div>
      )}

      {shown.map((d) => <DriveCard key={d.key} d={d} resumes={resumes} patch={patch} />)}

      {data?.unlinked?.length > 0 && (
        <div className="card">
          <h2>Emails I couldn't link to a company</h2>
          <div className="sub">Pick the company so the shortlist check works for them.</div>
          {data.unlinked.map((u: any) => (
            <div key={u.id} className="mt">
              <div><b>{u.subject}</b> {u.matched && <span className="badge b-ok">you're in it</span>}</div>
              <div className="sub">{fmt(u.date)} · {u.files.join(", ") || "no attachments"}</div>
              <select defaultValue="" onChange={async (e) => {
                if (!e.target.value) return;
                await fetch("/api/state", { method: "POST", body: JSON.stringify({ link: { msgId: u.id, key: e.target.value } }) });
                load();
              }}>
                <option value="">Assign to…</option>
                {drives.map((d) => <option key={d.key} value={d.key}>{d.company}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <p className="sub mt">
        <button onClick={() => { if (confirm("Re-read every email from scratch?")) sync(true); }} disabled={!!syncing}>Re-scan everything</button>
      </p>
    </div>
  );
}

function DriveCard({ d, resumes, patch }: { d: Drive; resumes: any[]; patch: (k: string, p: any) => void }) {
  const dr = d.drive;
  const cd = countdown(dr.deadlineISO);
  const best = d.resume[0];
  const apply = dr.links.find((l: any) => /apply|register|form|click|here|link/i.test(l.text)) || dr.links[0];
  const [notes, setNotes] = useState(d.state.notes || "");
  const el = d.eligibility;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>{d.company}</h2>
          <div className="sub">{dr.role}{dr.type ? ` · ${dr.type}` : ""}</div>
        </div>
        <span className={`badge ${BADGE[d.status]}`}>{d.statusLabel}{d.auto && ["out"].includes(d.status) ? " (auto)" : ""}</span>
      </div>

      <div className="kv">
        {dr.deadlineText && <><span>Deadline</span><span>{dr.deadlineText}{cd && <b style={{ color: cd.urgent ? "var(--bad)" : "var(--muted)" }}> · {cd.text}</b>}</span></>}
        {dr.location && <><span>Location</span><span>{dr.location}</span></>}
        {(dr.stipend || dr.ctc) && <><span>Pay</span><span>{[dr.stipend, dr.ctc && `CTC ${dr.ctc}`].filter(Boolean).join(" · ")}</span></>}
        {dr.rounds && <><span>Rounds</span><span>{dr.rounds}</span></>}
        {dr.date && <><span>Date</span><span>{dr.date}</span></>}
        <span>Eligibility</span>
        <span>
          <span className={`badge ${el.status === "eligible" ? "b-ok" : el.status === "not_eligible" ? "b-bad" : "b-grey"}`}>
            {el.status === "eligible" ? "You're eligible" : el.status === "not_eligible" ? "Not eligible" : "Unknown"}
          </span>
          {el.reasons.map((r: string, i: number) => <div key={i} className="sub">{r}</div>)}
        </span>
      </div>

      {best ? (
        <div className="resume">
          Upload: <b>{best.name}</b> <span className="terms">({best.score}% match)</span>
          {best.terms.length > 0 && <div className="terms">matched on: {best.terms.join(", ")}</div>}
          {d.resume.length > 1 && d.resume[1].score >= best.score * 0.85 && <div className="terms">⚖️ close call – your tags in Settings decide ties</div>}
          {d.resume.length > 1 && <div className="terms">then: {d.resume.slice(1).map((r: any) => `${r.name} (${r.score}%)`).join(", ")}</div>}
        </div>
      ) : (
        <div className="resume sub">Upload resumes in Settings to get a recommendation.</div>
      )}

      {d.status === "check" && (
        <div className="msg err">A shortlist attachment couldn't be read (scanned or unsupported). Open the email and check manually.</div>
      )}

      <div className="row">
        {apply && <a className="btn" href={apply.href} target="_blank" rel="noreferrer">Open application ↗</a>}
        <button className={d.state.applied ? "on" : ""} onClick={() => patch(d.key, { applied: !d.state.applied })}>
          {d.state.applied ? "✓ Applied" : "Mark applied"}
        </button>
        {d.status === "out" && <button onClick={() => patch(d.key, { override: "keep" })}>Not out – keep</button>}
        {d.state.override === "rejected"
          ? <button onClick={() => patch(d.key, { override: null })}>Undo reject</button>
          : <button className="danger" onClick={() => patch(d.key, { override: "rejected" })}>Rejected</button>}
        <button onClick={() => patch(d.key, { ignored: !d.state.ignored })}>{d.state.ignored ? "Unskip" : "Skip"}</button>
      </div>

      <details>
        <summary>Details, resume used, notes & email timeline</summary>
        <label>Resume I used</label>
        <select value={d.state.resumeUsed || ""} onChange={(e) => patch(d.key, { resumeUsed: e.target.value || null })}>
          <option value="">—</option>
          {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (d.state.notes || "") && patch(d.key, { notes })} />
        {dr.eligibility.departments && <div className="sub mt">Departments: {dr.eligibility.departments}</div>}
        <div className="tl">
          {d.timeline.map((t: any) => (
            <div key={t.id}>
              <a href={`https://mail.google.com/mail/u/0/#all/${t.id}`} target="_blank" rel="noreferrer">{t.subject || "(no subject)"}</a>
              <div className="sub">{fmt(t.date)}{t.round ? ` · ${t.round}` : ""}</div>
              {t.matched && <div><span className="badge b-ok">found you</span> <span className="sub">{t.via === "srn" ? "SRN" : "name"} match: {t.line}</span></div>}
              {t.unreadable.length > 0 && <div className="sub" style={{ color: "var(--warn)" }}>couldn't read: {t.unreadable.join(", ")}</div>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
