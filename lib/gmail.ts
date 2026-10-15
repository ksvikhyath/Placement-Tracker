import { Settings } from "./types";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function accessToken(): Promise<string> {
  const { redis } = await import("./redis");
  const refresh = await redis().get<string>("auth:refresh");
  if (!refresh) throw new Error("NO_REFRESH_TOKEN: sign out and sign in again to grant Gmail access");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j: any = await r.json();
  if (!r.ok || !j.access_token) {
    throw new Error(`TOKEN_REFRESH_FAILED: ${j.error_description || j.error || r.status}. Sign in again.`);
  }
  return j.access_token;
}

async function g(token: string, path: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 700 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`Gmail ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error("Gmail request failed after retries");
}

export function buildQuery(s: Settings): string {
  const senders = s.senders.split(/[,\s]+/).filter(Boolean);
  const parts: string[] = [];
  if (senders.length) parts.push(`from:(${senders.join(" OR ")})`);
  if (s.label.trim()) parts.push(`label:${s.label.trim().replace(/\s+/g, "-")}`);
  if (!parts.length) throw new Error("Set at least one sender or a label in Settings");
  // senders and label are alternatives, not both required
  return parts.length === 2 ? `{${parts.join(" ")}}` : parts[0];
}

export async function listMessageIds(token: string, q: string, max = 1500): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  do {
    const j = await g(token, `/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    for (const m of j.messages || []) ids.push(m.id);
    pageToken = j.nextPageToken || "";
  } while (pageToken && ids.length < max);
  return ids;
}

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};

export async function getMessage(token: string, id: string): Promise<any> {
  return g(token, `/messages/${id}?format=full`);
}

export async function getAttachment(token: string, msgId: string, attId: string): Promise<Buffer> {
  const j = await g(token, `/messages/${msgId}/attachments/${attId}`);
  return Buffer.from(j.data, "base64url");
}

export function header(msg: any, name: string): string {
  const h = (msg.payload?.headers || []).find((x: any) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

export function walkParts(p: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] {
  if (!p) return out;
  out.push(p);
  for (const c of p.parts || []) walkParts(c, out);
  return out;
}

export function decodeBody(p: GmailPart): string {
  return p.body?.data ? Buffer.from(p.body.data, "base64url").toString("utf8") : "";
}
