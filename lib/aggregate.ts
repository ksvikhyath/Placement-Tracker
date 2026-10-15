import { linkToCompany } from "./parse";
import { driveDocument, rankResumes } from "./resume";
import { norm } from "./text";
import { EmailRec, ManualState, ParsedDrive, ResumeMeta, Settings } from "./types";

export type Status =
  | "open" | "ineligible" | "missed" | "applied" | "shortlisted"
  | "out" | "check" | "rejected" | "skipped";

export type DriveView = {
  key: string;
  company: string;
  drive: ParsedDrive;
  firstSeen: number;
  lastActivity: number;
  status: Status;
  statusLabel: string;
  auto: boolean; // status was inferred automatically (not set by user)
  state: ManualState;
  eligibility: { status: "eligible" | "not_eligible" | "unknown"; reasons: string[] };
  resume: { id: string; name: string; score: number; terms: string[] }[];
  timeline: {
    id: string; date: number; subject: string; kind: string; round: string | null;
    matched: boolean; via?: string; line?: string; unreadable: string[];
  }[];
};

export type Unlinked = { id: string; date: number; subject: string; guess: string | null; matched: boolean; files: string[] };

const BRANCH_ALIASES: Record<string, RegExp> = {
  cse: /\bcse\b|computer science/i,
  cs: /\bcse\b|computer science/i,
  ece: /\bece\b|electronics (and|&) communication/i,
  eee: /\beee\b|electrical/i,
  me: /\bme\b|\bmech|mechanical/i,
  ise: /\bise\b|information science/i,
  aiml: /\bai\s*[&/]?\s*ml\b|artificial intelligence/i,
};

export function checkEligibility(d: ParsedDrive, s: Settings) {
  const e = d.eligibility;
  const reasons: string[] = [];
  let bad = false, known = false;
  const chk = (label: string, req: number | null, mine: number, higherIsBetter = true) => {
    if (req === null) return;
    known = true;
    const ok = higherIsBetter ? mine >= req : mine <= req;
    if (!ok) { bad = true; reasons.push(`${label}: need ${higherIsBetter ? "≥" : "≤"}${req}, you have ${mine}`); }
  };
  chk("10th", e.tenth, s.tenth);
  chk("12th", e.twelfth, s.twelfth);
  chk("UG CGPA", e.ug, s.cgpa);
  chk("Backlogs", e.backlogs, s.backlogs, false);
  if (e.departments) {
    known = true;
    const txt = e.departments;
    const re = BRANCH_ALIASES[s.branch.toLowerCase()] || new RegExp(`\\b${s.branch.replace(/[^a-z0-9 ]/gi, "")}\\b`, "i");
    if (!(re.test(txt) || /\ball\b|any branch|all (branches|departments)/i.test(txt))) {
      bad = true;
      reasons.push(`Departments listed (${txt.slice(0, 80)}) don't include ${s.branch.toUpperCase()}`);
    }
  }
  return { status: (bad ? "not_eligible" : known ? "eligible" : "unknown") as any, reasons };
}

const LABELS: Record<Status, string> = {
  open: "Open to apply", ineligible: "Not eligible", missed: "Deadline passed", applied: "Applied – waiting",
  shortlisted: "Shortlisted", out: "Not in latest list", check: "Check attachment manually",
  rejected: "Rejected", skipped: "Skipped",
};

export function buildDrives(args: {
  emails: EmailRec[];
  states: Record<string, ManualState>;
  links: Record<string, string>; // msgId -> company key (manual links)
  settings: Settings;
  resumes: ResumeMeta[];
  now: number;
}): { drives: DriveView[]; unlinked: Unlinked[] } {
  const { emails, states, links, settings, resumes, now } = args;
  const sorted = [...emails].filter((e) => e.sh !== "err").sort((a, b) => a.date - b.date);

  // 1) drives, grouped by normalised company name (later emails update earlier fields)
  const map = new Map<string, { drive: ParsedDrive; firstSeen: number; last: number; mails: EmailRec[]; jd: string; body: string; subject: string }>();
  for (const e of sorted) {
    if (e.kind !== "drive" || !e.drive) continue;
    const key = norm(e.drive.company);
    if (!key) continue;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { drive: e.drive, firstSeen: e.date, last: e.date, mails: [e], jd: e.jdText, body: e.bodyText, subject: e.subject });
    } else {
      const merged: any = { ...cur.drive };
      for (const [k, v] of Object.entries(e.drive)) if (v !== null && v !== "" && !(Array.isArray(v) && !v.length)) merged[k] = v;
      cur.drive = merged;
      cur.last = e.date;
      cur.mails.push(e);
      cur.jd = e.jdText || cur.jd;
      cur.body = e.bodyText || cur.body;
    }
  }
  const names = [...map.values()].map((m) => m.drive.company);
  const nameToKey = new Map([...map.entries()].map(([k, m]) => [m.drive.company, k]));

  // 2) attach non-drive emails
  const attached = new Map<string, EmailRec[]>();
  const unlinked: Unlinked[] = [];
  for (const e of sorted) {
    if (e.kind !== "update") continue;
    let key: string | null = links[e.id] && map.has(links[e.id]) ? links[e.id] : null;
    if (!key) {
      const c = linkToCompany(e.subject, e.bodyHead, names);
      if (c) key = nameToKey.get(c) || null;
    }
    if (key) {
      if (!attached.has(key)) attached.set(key, []);
      attached.get(key)!.push(e);
    } else if (e.files.length || e.matches.length) {
      unlinked.push({
        id: e.id, date: e.date, subject: e.subject, guess: e.companyGuess,
        matched: e.matches.length > 0, files: e.files.map((f) => f.name),
      });
    }
  }

  // 3) per-drive view
  const drives: DriveView[] = [];
  for (const [key, m] of map) {
    const state = states[key] || {};
    const ups = attached.get(key) || [];
    const elig = checkEligibility(m.drive, settings);
    const deadlinePassed = m.drive.deadlineISO ? Date.parse(m.drive.deadlineISO) < now : false;

    // group list-type emails into rounds (same label = same round, names are unioned)
    const groups: { label: string; mails: EmailRec[]; first: number }[] = [];
    for (const u of ups) {
      if (!u.files.length && !u.matches.length) continue; // pure announcements with nothing to scan
      const label = u.round || `List ${groups.length + 1}`;
      const g = groups.find((x) => x.label === label);
      if (g) g.mails.push(u);
      else groups.push({ label, mails: [u], first: u.date });
    }
    groups.sort((a, b) => a.first - b.first);
    const inGroup = (g: (typeof groups)[0]) => g.mails.some((x) => x.matches.length > 0);
    const unreadable = (g: (typeof groups)[0]) => g.mails.some((x) => x.files.some((f) => f.status === "unreadable"));

    let status: Status;
    let auto = true;
    let label = "";
    // being named on any shortlist implies you did apply
    const applied = !!state.applied || groups.some(inGroup);
    const last = groups[groups.length - 1];
    const lastIn = [...groups].reverse().find(inGroup);

    if (state.override === "rejected") { status = "rejected"; auto = false; }
    else if (state.ignored) { status = "skipped"; auto = false; }
    else if (last && inGroup(last)) { status = "shortlisted"; label = `Shortlisted – ${last.label}`; }
    else if (applied && groups.length) {
      if (state.override === "keep") { status = "applied"; auto = false; }
      else if (groups.some(unreadable) && !lastIn) { status = "check"; }
      else if (last && unreadable(last)) { status = "check"; }
      else {
        status = "out";
        label = lastIn ? `Not in ${last.label} list (was in ${lastIn.label})` : `Not in ${last.label} list`;
      }
    } else if (applied) { status = "applied"; auto = false; }
    else if (lastIn) { status = "shortlisted"; label = `Shortlisted – ${lastIn.label}`; }
    else if (deadlinePassed) status = "missed";
    else if (elig.status === "not_eligible") status = "ineligible";
    else status = "open";
    if (status === "shortlisted" && state.override === "keep") auto = false;

    const doc = driveDocument({ role: m.drive.role, event: m.drive.event, subject: m.subject, body: m.body, jd: m.jd });
    const timeline = [...m.mails, ...ups]
      .sort((a, b) => a.date - b.date)
      .map((x) => ({
        id: x.id, date: x.date, subject: x.subject, kind: x.kind, round: x.round,
        matched: x.matches.length > 0, via: x.matches[0]?.via, line: x.matches[0]?.line,
        unreadable: x.files.filter((f) => f.status === "unreadable").map((f) => `${f.name}${f.note ? ` (${f.note})` : ""}`),
      }));

    drives.push({
      key, company: m.drive.company, drive: m.drive, firstSeen: m.firstSeen,
      lastActivity: Math.max(m.last, ...ups.map((u) => u.date)),
      status, statusLabel: label || LABELS[status], auto, state, eligibility: elig,
      resume: rankResumes(resumes, doc).slice(0, 3), timeline,
    });
  }
  return { drives, unlinked };
}
