import { Settings } from "./types";

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Look for the user in a block of text (one logical row per line).
 * SRN match is exact (ignoring spaces/dashes/case). Name match needs >= 2 distinctive
 * tokens (prefix-tolerant, so "Reddy" matches "Redd") on the same line.
 */
export function findUser(
  text: string,
  s: Pick<Settings, "srn" | "name">
): { via: "srn" | "name"; line: string } | null {
  const srn = compact(s.srn || "");
  const tokens = (s.name || "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3);
  const distinctive = tokens.filter((t) => t.length >= 4);
  let nameHit: { via: "name"; line: string } | null = null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (srn.length >= 8 && compact(line).includes(srn)) {
      return { via: "srn", line: line.trim().slice(0, 240) };
    }
    if (!nameHit && distinctive.length >= 2) {
      const words = line.toLowerCase().split(/[^a-z]+/).filter(Boolean);
      let hits = 0;
      for (const t of tokens) {
        if (words.some((w) => w === t || (w.length >= 4 && t.length >= 4 && (w.startsWith(t) || t.startsWith(w))))) hits++;
      }
      const need = Math.max(2, Math.ceil(tokens.length * 0.6));
      if (hits >= need) nameHit = { via: "name", line: line.trim().slice(0, 240) };
    }
  }
  // SRN can be split across lines in some PDFs; check the whole text as a last resort
  if (srn.length >= 8 && compact(text).includes(srn)) {
    return { via: "srn", line: "(SRN found in document text)" };
  }
  return nameHit;
}
