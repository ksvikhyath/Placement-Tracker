export type Settings = {
  srn: string;
  name: string;
  tenth: number;
  twelfth: number;
  cgpa: number;
  backlogs: number;
  branch: string;
  senders: string; // comma separated sender addresses
  label: string; // optional Gmail label
};

export const DEFAULT_SETTINGS: Settings = {
  srn: "PES2UG23CS253",
  name: "Kakanuru Shiva Vikhyath Redd",
  tenth: 82.4,
  twelfth: 92.3,
  cgpa: 8.43,
  backlogs: 0,
  branch: "cse",
  senders: "placementsupport@pes.edu",
  label: "",
};

export type Eligibility = {
  tenth: number | null;
  twelfth: number | null;
  ug: number | null;
  pg: number | null;
  backlogs: number | null;
  departments: string;
};

export type ParsedDrive = {
  company: string;
  event: string;
  role: string;
  type: string; // e.g. Internship + Full Time Employment
  location: string;
  stipend: string;
  ctc: string;
  rounds: string;
  date: string | null;
  deadlineText: string | null;
  deadlineISO: string | null;
  eligibility: Eligibility;
  links: { text: string; href: string }[];
};

export type EmailRec = {
  id: string;
  date: number; // ms
  subject: string;
  from: string;
  sh: string; // settings hash used when processed ("err" => retry)
  kind: "drive" | "update" | "other";
  bodyHead: string; // first ~700 chars of text, used for linking
  bodyText: string; // up to 4000 chars, used for resume matching (drive mails)
  jdText: string; // text from attachments of drive mails (JD pdfs etc.)
  drive?: ParsedDrive;
  files: { name: string; status: "ok" | "unreadable" | "skipped"; note?: string }[];
  matches: { file: string; via: "srn" | "name"; line: string }[];
  round: string | null;
  companyGuess: string | null;
  error?: string;
};

export type ManualState = {
  applied?: boolean;
  override?: "rejected" | "keep" | null;
  ignored?: boolean;
  notes?: string;
  resumeUsed?: string | null;
};

export type ResumeMeta = {
  id: string;
  name: string;
  tags: string;
  text: string;
  uploadedAt: number;
  size: number;
};
