const ENT: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'",
  ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "...", rupee: "₹", le: "≤", ge: "≥",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

/** Small dependency-free HTML -> text converter that keeps table rows on one line. */
export function htmlToText(html: string): string {
  let h = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol|section|blockquote)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  h = decodeEntities(h).replace(/ /g, " ");
  return h
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, a) => l || (a[i - 1] && a[i - 1] !== ""))
    .join("\n")
    .trim();
}

export function extractLinks(html: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]);
    if (!/^https?:/i.test(href)) continue;
    const text = htmlToText(m[2]).replace(/\s+/g, " ").trim();
    out.push({ text, href });
  }
  return out;
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
