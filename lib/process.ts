import { extractText } from "./attachments";
import { decodeBody, header, walkParts } from "./gmail";
import { findUser } from "./match";
import { detectRound, guessCompany, isDriveEmail, parseDrive } from "./parse";
import { htmlToText } from "./text";
import { EmailRec, Settings } from "./types";

export function settingsHash(s: Settings): string {
  return [s.srn, s.name, s.senders, s.label].join("|").toLowerCase();
}

/**
 * Turn one Gmail message (format=full) into an EmailRec.
 * `fetchAtt` downloads an attachment by id (injected so this can be tested offline).
 */
export async function processMessage(
  msg: any,
  settings: Settings,
  fetchAtt: (attId: string) => Promise<Buffer>
): Promise<EmailRec> {
  const parts = walkParts(msg.payload);
  const htmlPart = parts.find((p) => p.mimeType === "text/html" && !p.filename && p.body?.data);
  const textPart = parts.find((p) => p.mimeType === "text/plain" && !p.filename && p.body?.data);
  const html = htmlPart ? decodeBody(htmlPart) : "";
  const text = html ? htmlToText(html) : textPart ? decodeBody(textPart) : "";
  const subject = header(msg, "Subject");
  const from = header(msg, "From");
  const drive = isDriveEmail(text);

  const rec: EmailRec = {
    id: msg.id,
    date: Number(msg.internalDate) || Date.parse(header(msg, "Date")) || 0,
    subject,
    from,
    sh: "",
    kind: drive ? "drive" : "update",
    bodyHead: text.slice(0, 700),
    bodyText: drive ? text.slice(0, 4000) : "",
    jdText: "",
    files: [],
    matches: [],
    round: null,
    companyGuess: null,
  };

  // attachments
  let jd = "";
  for (const p of parts) {
    if (!p.filename) continue;
    let data: Buffer | null = null;
    try {
      if (p.body?.attachmentId) data = await fetchAtt(p.body.attachmentId);
      else if (p.body?.data) data = Buffer.from(p.body.data, "base64url");
    } catch (e: any) {
      rec.files.push({ name: p.filename, status: "unreadable", note: "download failed" });
      continue;
    }
    if (!data) continue;
    const ex = await extractText(p.filename, data);
    rec.files.push({ name: p.filename, status: ex.status, note: ex.note });
    if (drive) {
      jd += "\n" + ex.text;
    } else if (ex.text) {
      const hit = findUser(ex.text, settings);
      if (hit) rec.matches.push({ file: p.filename, ...hit });
    }
  }

  if (drive) {
    rec.drive = parseDrive(text, html) || undefined;
    rec.jdText = jd.slice(0, 6000);
    if (!rec.drive) rec.kind = "update";
  } else {
    // names are sometimes listed in the body itself
    const hit = findUser(text, settings);
    if (hit) rec.matches.push({ file: "(email body)", ...hit });
    rec.round = detectRound(subject, text);
    rec.companyGuess = guessCompany(subject);
    if (!rec.files.length && !rec.matches.length && !/shortlist|selected|result|round|interview|test/i.test(subject)) {
      rec.kind = "other";
    }
  }
  return rec;
}
