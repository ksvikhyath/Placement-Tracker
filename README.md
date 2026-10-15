<<<<<<< HEAD
# Placement Tracker

A private dashboard (works on your phone) that reads your college placement mails from Gmail and tells you:

- every company that has come, with deadline countdown, pay, rounds and **whether you're eligible**
- whether you're **shortlisted**, by scanning PDF / Excel / CSV / Word attachments (and the mail body) for your **SRN** or name
- who **rejected** you: you tick it manually, and it also flags "not in the latest list" when you applied and your name is missing from a later round
- **which resume to upload** for each company (local TF-IDF scoring, no paid API)

Stack: Next.js 14 (App Router) on Vercel, Google sign-in (only your email), Upstash Redis for storage, Gmail API read-only.

---

## 1. Google Cloud (one-time, ~10 min)

1. Go to <https://console.cloud.google.com> and create a project (e.g. `placement-tracker`).
2. **APIs & Services → Library →** enable **Gmail API**.
3. **APIs & Services → OAuth consent screen** (may be called "Google Auth Platform"):
   - User type **External**, fill app name + your email.
   - Add scope `.../auth/gmail.readonly`.
   - Add yourself under **Test users**.
   - **IMPORTANT – click "Publish app" (move to *In production*).** While an app is in *Testing*, Google expires the refresh token after **7 days**, and the daily sync would silently die. In production, Google shows an "unverified app" warning when you sign in: click *Advanced → Go to … (unsafe)*. That is fine, it's your own app and only you can use it.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorized redirect URIs (add both):
   - `https://YOUR-APP.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
5. Copy the **Client ID** and **Client secret**.

## 2. Deploy to Vercel

```bash
cd placement-tracker-app
git init && git add . && git commit -m "init"
# push to a PRIVATE GitHub repo, then import it at vercel.com/new
```

(or `npm i -g vercel && vercel` from this folder, with no GitHub.)

In the Vercel project:

1. **Storage → Create / Connect Database → Upstash Redis** (free plan). Connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically (both naming schemes work).
2. **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `ALLOWED_EMAIL` | your personal Gmail address (the only account that can sign in) |
| `NEXTAUTH_URL` | `https://YOUR-APP.vercel.app` (no trailing slash) |
| `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` |
| `CRON_SECRET` | any long random string |

3. **Redeploy.** Then update the redirect URI in step 1.4 if your final domain differs.

## 3. First run

1. Open the site → **Sign in with Google** (approve Gmail read-only).
2. **Settings**: check your SRN / name / marks (pre-filled with what you told me), confirm the sender `placementsupport@pes.edu`, and **upload your resume PDFs**. Give each a name and a few tags, e.g. `ml ai python pytorch nlp` or `react node fullstack web`. Tags are the strongest lever on the recommendation.
3. Dashboard → **Sync mail**. The first scan reads every mail from the sender (it works in batches, so leave the page open until it says done).
4. For each drive, press **Mark applied** when you apply. The site then watches for shortlists.

A daily auto-sync runs at 06:00 IST (Vercel cron). **Sync mail** gives instant refresh.

---

## How the logic works (and its limits)

**Drive emails** are recognised by the `Event:` + `Application Deadline:` fields in your college template. Company = first part of the Event line. A later mail with the same company name updates the same drive.

**Shortlist / update emails** (anything else from the sender) are linked to a drive when the company name appears in the subject or the first lines. If it can't tell, the mail appears under *Emails I couldn't link*; pick the company from the dropdown.

**Finding you**: SRN match (ignores spaces/dashes/case) is trusted; name match needs ≥60% of your name tokens on one row/line and is labelled "name match", so verify those. Each match shows the row it matched so you can sanity check.

**Status per drive**

| Status | Meaning |
|---|---|
| Open | deadline in future and you haven't applied |
| Not eligible | your 10th/12th/CGPA/backlogs/branch fail the mail's criteria |
| Deadline passed | not applied, deadline gone |
| Applied – waiting | you ticked applied, no lists yet |
| Shortlisted – *round* | you appear in the newest list for that drive |
| Not in latest list (auto) | you applied (or were in an earlier list) but you're missing from the newest list. **Heuristic**: press *Not out – keep* if it's wrong (e.g. a supplementary list is coming) |
| Check attachment manually | a list attachment couldn't be read (scanned image / password-protected), so absence can't be trusted |
| Rejected / Skipped | you set it |

Lists whose mail mentions the same round (Aptitude, Technical, GD, Interview, HR, Final) are treated as one round and merged; rounds are ordered by email date.

**Known limits**
- No OCR: image-only PDFs and screenshots are flagged "couldn't read".
- Resume match is keyword/TF-IDF, so generic roles ("Trainee Software Engineer") can be a close call; the card says so. Tags and JD attachments improve it.
- Eligibility "Departments" parsing is best-effort; read the line on the card if it says Unknown.
- Single user by design. If you change your SRN/name in Settings, press **Re-scan everything** on the dashboard.
- Changing your sender address later is fine; old mails already scanned are kept.

## Local development

```bash
cp .env.example .env.local   # fill in values (use your Upstash URL/token)
npm install
npm run dev                  # http://localhost:3000
npm run selftest             # offline test of parsing/matching/status logic with fake emails
```

## Files

- `lib/process.ts` – one Gmail message → parsed record (drive fields, attachment scan, your match)
- `lib/aggregate.ts` – groups records into drives, computes status, eligibility, resume ranking
- `lib/resume.ts` – TF-IDF ranking · `lib/match.ts` – SRN/name finder · `lib/parse.ts` – template parsing
- `lib/sync.ts`, `lib/gmail.ts` – incremental Gmail sync (time-boxed for Vercel's 60 s limit)
- `app/` – dashboard, settings page, API routes
=======
# Placement-Tracker
>>>>>>> 67b2a8d7689640625623d2d6dafbe2f26f8f7500
