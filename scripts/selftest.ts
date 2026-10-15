/* Offline self-test: fake Gmail messages -> parse -> aggregate. Run: npm run selftest */
import { processMessage, settingsHash } from "../lib/process";
import { buildDrives } from "../lib/aggregate";
import { rankResumes, driveDocument } from "../lib/resume";
import { DEFAULT_SETTINGS } from "../lib/types";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

const DRIVE_HTML = `<html><body><div style="background:#1a237e"><h1>PES University</h1><p>Placement and Training Cell</p></div>
<p>Dear Student,</p><p>We are pleased to inform you that <b>ETG</b> is organizing a <b>Internship + Full Time Employment</b> recruitment drive.</p>
<h3>Event Details</h3><table>
<tr><td><b>Event:</b></td><td>ETG | Trainee Software Engineer | Drive</td></tr>
<tr><td><b>Date:</b></td><td>N/A</td></tr>
<tr><td><b>Rounds:</b></td><td>Technical + Aptitude Test, Group Discussion, Interview</td></tr>
<tr><td><b>Application Deadline:</b></td><td><span style="color:red">10 Oct 2026, 09:00 am</span></td></tr></table>
<h3>Position</h3><table><tr><td>Role:</td><td>Trainee Software Engineer</td></tr><tr><td>Location:</td><td>Bangalore</td></tr>
<tr><td>Stipend:</td><td>₹20,000/month</td></tr><tr><td>CTC:</td><td>₹8.00 LPA</td></tr></table>
<h3>Eligibility</h3><div><b>10th:</b> 65 | <b>12th:</b> 65 | <b>UG CGPA:</b> 6.5 | <b>PG CGPA:</b> N/A | <b>Active Backlogs:</b> &le;0</div>
<p><b>Departments:</b></p><ul><li>Computer Science and Engineering</li><li>Electronics and Communication</li></ul>
<p><a href="https://forms.example.com/etg">Click here to apply</a></p><p>Regards,<br>Placement Cell</p></body></html>`;

const DRIVE2_HTML = DRIVE_HTML
  .replace("ETG | Trainee Software Engineer | Drive", "Acme AI | Machine Learning Intern | Drive")
  .replace(/<b>ETG<\/b>/, "<b>Acme AI</b>").replace("Trainee Software Engineer</td></tr><tr><td>Location", "Machine Learning Intern</td></tr><tr><td>Location")
  .replace("10 Oct 2026, 09:00 am", "30 Oct 2026, 05:30 pm")
  .replace("<li>Computer Science and Engineering</li><li>Electronics and Communication</li>", "<li>Mechanical Engineering</li>");

const mkMsg = (id: string, date: string, subject: string, html: string | null, text: string, atts: { name: string; data: Buffer }[] = []) => ({
  id, internalDate: String(Date.parse(date)),
  payload: {
    headers: [{ name: "Subject", value: subject }, { name: "From", value: "placementsupport@pes.edu" }],
    mimeType: "multipart/mixed",
    parts: [
      ...(html ? [{ mimeType: "text/html", body: { data: b64(html) } }] : [{ mimeType: "text/plain", body: { data: b64(text) } }]),
      ...atts.map((a, i) => ({ mimeType: "application/octet-stream", filename: a.name, body: { attachmentId: `${id}-${i}` } })),
    ],
  },
  __atts: Object.fromEntries(atts.map((a, i) => [`${id}-${i}`, a.data])),
});

async function run() {
  const s = { ...DEFAULT_SETTINGS };
  const sh = settingsHash(s);
  const msgs = [
    mkMsg("m1", "2026-10-05T10:00:00Z", "ETG | Trainee Software Engineer | Drive", DRIVE_HTML, ""),
    mkMsg("m2", "2026-10-06T10:00:00Z", "Acme AI | Machine Learning Intern | Drive", DRIVE2_HTML, ""),
    // round 1 list: user present (SRN, csv)
    mkMsg("m3", "2026-10-12T10:00:00Z", "ETG - Aptitude Test Shortlist", null, "Please find the shortlist attached.",
      [{ name: "shortlist.csv", data: Buffer.from("SRN,Name,Section\nPES1UG23CS001,Someone Else,A\nPES2UG23CS253,Kakanuru Shiva Vikhyath Reddy,C\n") }]),
    // round 2 list: user absent
    mkMsg("m4", "2026-10-14T10:00:00Z", "ETG Interview Shortlist", null, "Interview round list attached.",
      [{ name: "interview.csv", data: Buffer.from("SRN,Name\nPES1UG23CS009,Another Person\n") }]),
    // acme: name-only list in body, user present by name, SRN absent
    mkMsg("m5", "2026-10-20T10:00:00Z", "Acme AI Technical shortlist", null, "Shortlisted:\n1. K Shiva Vikhyath Reddy\n2. Someone Else"),
    // unrelated mail with attachment, unlinkable
    mkMsg("m6", "2026-10-11T10:00:00Z", "Random Corp shortlist", null, "see attached", [{ name: "x.csv", data: Buffer.from("PES2UG23CS253,me") }]),
    // image attachment => unreadable
    mkMsg("m7", "2026-10-13T10:00:00Z", "Acme AI Aptitude results", null, "see image", [{ name: "res.png", data: Buffer.from("x") }]),
    mkMsg("m8", "2026-10-13T11:00:00Z", "Holiday notice", null, "Campus closed on Friday."),
  ];

  const recs = [];
  for (const m of msgs) {
    const r = await processMessage(m, s, async (id) => (m as any).__atts[id]);
    r.sh = sh; recs.push(r);
  }
  const by = (id: string) => recs.find((r) => r.id === id)!;

  // ---- parsing
  const d = by("m1").drive!;
  ok(by("m1").kind === "drive", "m1 is drive");
  ok(d.company === "ETG", "company " + d.company);
  ok(d.role === "Trainee Software Engineer", "role " + d.role);
  ok(d.location === "Bangalore", "location");
  ok(d.stipend.includes("20,000"), "stipend " + d.stipend);
  ok(d.ctc.includes("8.00"), "ctc");
  ok(d.date === null, "date N/A -> null");
  ok(d.deadlineISO === "2026-10-10T09:00:00+05:30", "deadline " + d.deadlineISO);
  ok(d.eligibility.tenth === 65 && d.eligibility.twelfth === 65 && d.eligibility.ug === 6.5 && d.eligibility.backlogs === 0, "eligibility " + JSON.stringify(d.eligibility));
  ok(d.eligibility.pg === null, "PG N/A");
  ok(/Computer Science/.test(d.eligibility.departments), "departments " + d.eligibility.departments);
  ok(d.type === "Internship + Full Time Employment", "type " + d.type);
  ok(d.links[0]?.href === "https://forms.example.com/etg", "apply link");
  ok(by("m3").matches[0]?.via === "srn", "m3 SRN match");
  ok(by("m4").matches.length === 0, "m4 no match");
  ok(by("m5").matches[0]?.via === "name", "m5 name match");
  ok(by("m3").round === "Aptitude / OA", "round m3 " + by("m3").round);
  ok(by("m4").round === "Interview", "round m4 " + by("m4").round);
  ok(by("m7").files[0].status === "unreadable", "png unreadable");
  ok(by("m8").kind === "other", "holiday notice ignored");

  // ---- aggregate
  const resumes = [
    { id: "r1", name: "AI/ML resume", tags: "ml ai python pytorch nlp", uploadedAt: 0, size: 1, text: "Machine learning engineer. Built LLM RAG pipelines, PyTorch, deep learning, computer vision, Python, LangGraph, FastAPI." },
    { id: "r2", name: "Full-stack resume", tags: "react node fullstack web", uploadedAt: 0, size: 1, text: "Full stack developer. React, Next.js, Node.js, REST API, SQL, PostgreSQL, TypeScript, DSA, backend services." },
  ];
  const now = Date.parse("2026-10-15T10:00:00+05:30");
  const run1 = (states: any = {}) => buildDrives({ emails: recs, states, links: {}, settings: s, resumes, now });
  let { drives, unlinked } = run1({ etg: { applied: true } });
  const etg = drives.find((x) => x.key === "etg")!, acme = drives.find((x) => x.key === "acmeai")!;
  ok(drives.length === 2, "two drives");
  ok(etg.status === "out", "ETG applied, in round1 but absent from interview -> out; got " + etg.status + " / " + etg.statusLabel);
  ok(/Aptitude/.test(etg.statusLabel), "label mentions earlier round: " + etg.statusLabel);
  ok(etg.eligibility.status === "eligible", "ETG eligible");
  ok(acme.eligibility.status === "not_eligible", "Acme not eligible (mechanical only)");
  ok(acme.status === "shortlisted", "Acme shortlisted via name list; got " + acme.status);
  ok(unlinked.length === 1 && unlinked[0].matched, "Random Corp unlinked + matched");
  ok(etg.resume[0].id === "r2", "ETG (software engineer) -> full-stack resume; got " + etg.resume.map((r) => `${r.name}:${r.score}`));
  ok(acme.resume[0].id === "r1", "Acme (ML intern) -> AI/ML resume; got " + acme.resume.map((r) => `${r.name}:${r.score}`));

  // not applied + deadline passed => missed
  const m = run1({}).drives.find((x) => x.key === "etg")!;
  ok(m.status === "out", "not ticked as applied but named in round 1 -> treated as applied -> out; got " + m.status);
  const only = buildDrives({ emails: [recs[0]], states: {}, links: {}, settings: s, resumes, now }).drives[0];
  ok(only.status === "missed", "no lists, not applied, deadline passed -> missed; got " + only.status);
  const early = buildDrives({ emails: [recs[1]], states: {}, links: {}, settings: s, resumes, now }).drives[0];
  ok(early.status === "ineligible", "mechanical-only drive -> ineligible; got " + early.status);
  // manual overrides
  ok(run1({ etg: { applied: true, override: "keep" } }).drives.find((x) => x.key === "etg")!.status === "applied", "keep override");
  ok(run1({ etg: { override: "rejected" } }).drives.find((x) => x.key === "etg")!.status === "rejected", "manual reject");
  // Acme: unreadable png in aptitude group, but user in later technical group => shortlisted wins
  // manual link of unlinked mail
  const linked = buildDrives({ emails: recs, states: {}, links: { m6: "etg" }, settings: s, resumes, now });
  ok(linked.unlinked.length === 0, "manual link removes from unlinked");

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log("ETG:", etg.status, "|", etg.statusLabel, "|", etg.resume.map((r) => `${r.name} ${r.score}% [${r.terms.join(",")}]`).join("; "));
  console.log("Acme:", acme.status, "|", acme.statusLabel, "|", acme.resume.map((r) => `${r.name} ${r.score}%`).join("; "));
  process.exit(fail ? 1 : 0);
}
run();
