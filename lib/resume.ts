/* Local TF-IDF resume ranking (no external API). */

const STOP = new Set(
  ("a an and are as at be by for from has have in is it its of on or that the to was were will with you your we our " +
    "this these those their they them us via using use used per not can may must should also etc will more all any " +
    "dear student students regards please kindly pes university placement training cell drive event date rounds " +
    "application deadline position role location stipend ctc eligibility departments active backlogs cgpa month lpa " +
    "internship full time employment recruitment organizing pleased inform details apply " +
    "engineer engineers developer developers intern trainee software engineering associate junior graduate").split(" ")
);

const PHRASES: [RegExp, string][] = [
  [/machine[\s-]?learning/g, " ml "],
  [/artificial intelligence/g, " ai "],
  [/deep[\s-]?learning/g, " deeplearning "],
  [/natural language processing|\bnlp\b/g, " nlp "],
  [/large language models?|\bllms?\b/g, " llm "],
  [/full[\s-]?stack/g, " fullstack "],
  [/front[\s-]?end/g, " frontend "],
  [/back[\s-]?end/g, " backend "],
  [/data[\s-]?science/g, " datascience "],
  [/data[\s-]?engineer(ing)?/g, " dataengineering "],
  [/computer vision/g, " cv "],
  [/node\.?js/g, " nodejs "],
  [/react\.?js/g, " react "],
  [/next\.?js/g, " nextjs "],
  [/c\+\+/g, " cpp "],
  [/c#/g, " csharp "],
  [/\.net/g, " dotnet "],
  [/data structures?( and| &)? algorithms?|\bdsa\b/g, " dsa "],
  [/operating systems?/g, " os "],
  [/computer networks?/g, " networks "],
  [/dev[\s-]?ops/g, " devops "],
  [/quality assurance|\bqa\b|test automation/g, " testing "],
  [/embedded|firmware|\bc\b programming/g, " embedded "],
];

// Light hints so sparse drive emails (just a job title) still map to the right skills.
const ROLE_HINTS: [RegExp, string][] = [
  [/\b(ai|ml|machine learning|data scien|nlp|llm|deep learning)\b/i, "ml ai deeplearning python llm datascience"],
  [/full[\s-]?stack|web developer|mern|frontend|front end/i, "fullstack frontend backend react nodejs api javascript"],
  [/backend|back end|api|java developer|spring/i, "backend api java sql database"],
  [/software (engineer|developer)|sde|trainee|associate engineer|graduate engineer/i, "dsa backend sql api datastructures"],
  [/data (engineer|analyst)|analytics|etl|bi\b/i, "sql python dataengineering analytics"],
  [/cloud|devops|sre|infrastructure/i, "cloud devops docker aws linux"],
  [/embedded|firmware|vlsi|iot|cellular|wireless/i, "embedded cpp os networks"],
  [/test|qa|automation/i, "testing automation selenium python java"],
];

export function tokenize(raw: string): string[] {
  let t = raw.toLowerCase();
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

export function driveDocument(parts: { role?: string; event?: string; subject?: string; body?: string; jd?: string }): string {
  const head = [parts.role, parts.event, parts.subject].filter(Boolean).join(" ");
  let hints = "";
  for (const [re, h] of ROLE_HINTS) if (re.test(head + " " + (parts.jd || "").slice(0, 1500))) hints += " " + h;
  // role/title words count extra; JD text counts fully
  return `${head} ${head} ${hints} ${parts.jd || ""} ${(parts.body || "").slice(0, 2500)}`;
}

type Doc = { id: string; name: string; tokens: string[] };

export function rankResumes(
  resumes: { id: string; name: string; text: string; tags: string }[],
  query: string
): { id: string; name: string; score: number; terms: string[] }[] {
  if (!resumes.length) return [];
  const docs: Doc[] = resumes.map((r) => ({
    id: r.id,
    name: r.name,
    // user tags are repeated so they weigh in like headline skills
    tokens: tokenize(`${r.text} ${(r.tags + " ").repeat(3)}`),
  }));
  const q = tokenize(query);
  const N = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d.tokens)) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w: string) => Math.log((N + 1) / ((df.get(w) || 0) + 0.5)) + 1;

  const qtf = new Map<string, number>();
  for (const w of q) qtf.set(w, (qtf.get(w) || 0) + 1);

  const out = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const w of d.tokens) tf.set(w, (tf.get(w) || 0) + 1);
    let dot = 0, dn = 0, qn = 0;
    const contrib: [string, number][] = [];
    for (const [w, c] of tf) dn += (1 + Math.log(c)) ** 2 * idf(w) ** 2;
    for (const [w, c] of qtf) {
      const qw = (1 + Math.log(c)) * idf(w);
      qn += qw ** 2;
      const dc = tf.get(w);
      if (dc) {
        const v = qw * (1 + Math.log(dc)) * idf(w);
        dot += v;
        contrib.push([w, v]);
      }
    }
    const score = dn && qn ? dot / Math.sqrt(dn * qn) : 0;
    contrib.sort((a, b) => b[1] - a[1]);
    return { id: d.id, name: d.name, score, terms: contrib.slice(0, 6).map((c) => c[0]) };
  });
  out.sort((a, b) => b.score - a.score);
  return out.map((o) => ({ ...o, score: Math.round(o.score * 1000) / 10 }));
}
