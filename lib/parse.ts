import { Eligibility, ParsedDrive } from "./types";
import { extractLinks } from "./text";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "10 Oct 2026, 09:00 am" (IST) -> ISO string with +05:30 offset. */
export function parseDeadline(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[a-z]*\.?,?\s+(\d{4})(?:[,\sat]+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  let hh = m[4] ? parseInt(m[4], 10) : 23;
  const mm = m[5] ? parseInt(m[5], 10) : m[4] ? 0 : 59;
  const ap = (m[6] || "").toLowerCase();
  if (ap === "pm" && hh < 12) hh += 12;
  if (ap === "am" && hh === 12) hh = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${m[3]}-${pad(mon + 1)}-${pad(parseInt(m[1], 10))}T${pad(hh)}:${pad(mm)}:00+05:30`;
}

function field(text: string, label: string): string {
  const re = new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]*)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

export function parseEligibility(text: string): Eligibility {
  const g = (re: RegExp) => {
    const m = text.match(re);
    return m ? m[1] : undefined;
  };
  // Departments block: lines after "Departments:" until a footer-ish line
  let departments = "";
  const di = text.search(/Departments?\s*:/i);
  if (di >= 0) {
    const after = text.slice(di).replace(/^Departments?\s*:/i, "");
    const lines = after.split("\n");
    const keep: string[] = [];
    for (let i = 0; i < lines.length && keep.length < 12; i++) {
      const l = lines[i].trim();
      if (!l) { if (keep.length) break; else continue; }
      if (/^(regards|thanks|thank you|best|note|apply|click|please|for any|contact|application|stipend|ctc|role|location)/i.test(l)) break;
      keep.push(l);
    }
    departments = keep.join(", ");
  }
  return {
    tenth: num(g(/10th\s*:\s*([\d.]+)/i)),
    twelfth: num(g(/12th\s*:\s*([\d.]+)/i)),
    ug: num(g(/UG\s*CGPA\s*:\s*([\d.]+)/i)),
    pg: num(g(/PG\s*CGPA\s*:\s*([\d.]+)/i)),
    backlogs: num(g(/Active\s*Backlogs?\s*:\s*[≤<=\s]*([\d]+)/i)),
    departments,
  };
}

export function parseDrive(text: string, html: string): ParsedDrive | null {
  const event = field(text, "Event");
  const deadlineText = field(text, "Application Deadline") || null;
  if (!event && !deadlineText) return null;
  const company = (event.split("|")[0] || "").trim() ||
    (text.match(/inform you that\s+(.+?)\s+is organizing/i)?.[1] ?? "Unknown");
  const date = field(text, "Date");
  const type = text.match(/organizing an?\s+(.+?)\s+recruitment drive/i)?.[1] ?? "";
  return {
    company,
    event,
    role: field(text, "Role") || (event.split("|")[1] || "").trim(),
    type,
    location: field(text, "Location"),
    stipend: field(text, "Stipend"),
    ctc: field(text, "CTC"),
    rounds: field(text, "Rounds"),
    date: !date || /^n\/?a$/i.test(date) ? null : date,
    deadlineText,
    deadlineISO: parseDeadline(deadlineText),
    eligibility: parseEligibility(text),
    links: extractLinks(html).filter((l) => !/mailto:|unsubscribe/i.test(l.href)),
  };
}

export function isDriveEmail(text: string): boolean {
  return /(?:^|\n)\s*Event\s*:/i.test(text) && /Application Deadline/i.test(text);
}

const ROUND_PATTERNS: [RegExp, string][] = [
  [/\b(final (list|result|selection)s?|offer|selected candidates|placed)\b/i, "Final / Offer"],
  [/\bhr\b/i, "HR"],
  [/\binterview/i, "Interview"],
  [/group discussion|\bgd\b/i, "Group Discussion"],
  [/technical/i, "Technical"],
  [/aptitude|online (test|assessment)|\boa\b|assessment|coding (test|round)/i, "Aptitude / OA"],
  [/shortlist/i, "Shortlist"],
];

export function detectRound(subject: string, body: string): string | null {
  for (const hay of [subject, body.slice(0, 600)]) {
    for (const [re, label] of ROUND_PATTERNS) if (re.test(hay)) return label;
  }
  return null;
}

export function guessCompany(subject: string): string | null {
  let s = subject.replace(/^(re|fwd?)\s*:\s*/i, "").trim();
  s = s.replace(/\b(shortlist(ed)?|results?|update|reminder|list|selected|candidates?|final|for|round)\b/gi, " ");
  const first = s.split(/[|\-–:]/)[0].replace(/\s+/g, " ").trim();
  return first || null;
}

/** Find which known company a non-drive email belongs to. */
export function linkToCompany(subject: string, bodyHead: string, companies: string[]): string | null {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const sorted = [...companies].sort((a, b) => b.length - a.length);
  for (const hay of [subject, bodyHead]) {
    for (const c of sorted) {
      if (c.length < 2) continue;
      if (new RegExp(`(^|[^a-z0-9])${esc(c)}([^a-z0-9]|$)`, "i").test(hay)) return c;
    }
  }
  return null;
}
