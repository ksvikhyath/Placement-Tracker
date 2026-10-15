/* Extract searchable text from PDF / Excel / CSV / Word attachments. */

export type Extracted = { text: string; status: "ok" | "unreadable" | "skipped"; note?: string };

const MAX_BYTES = 12 * 1024 * 1024;

export async function extractText(name: string, data: Buffer): Promise<Extracted> {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (data.length > MAX_BYTES) return { text: "", status: "skipped", note: "file too large" };
  try {
    if (ext === "pdf") {
      // import the inner file: the package index runs a debug routine that fails in bundlers
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const r = await pdfParse(data);
      const t: string = r.text || "";
      if (t.replace(/\s/g, "").length < 20) {
        return { text: t, status: "unreadable", note: "PDF has no text layer (scanned image?)" };
      }
      return { text: t, status: "ok" };
    }
    if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "ods") {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(data, { type: "buffer" });
      const lines: string[] = [];
      for (const sn of wb.SheetNames) {
        const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: "" });
        for (const r of rows) {
          const l = r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" | ");
          if (l) lines.push(l);
        }
      }
      return { text: lines.join("\n"), status: "ok" };
    }
    if (ext === "csv" || ext === "tsv" || ext === "txt") {
      return { text: data.toString("utf8").replace(/[,\t;]/g, " | "), status: "ok" };
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      // Tables come out as one paragraph per cell; raw text keeps rows apart, so use HTML and rebuild rows
      const r = await mammoth.convertToHtml({ buffer: data });
      const html = r.value
        .replace(/<\/t[dh]>/gi, " | ")
        .replace(/<\/(tr|p|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
      const { decodeEntities } = await import("./text");
      return { text: decodeEntities(html).replace(/[ \t]+/g, " "), status: "ok" };
    }
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"].includes(ext)) {
      return { text: "", status: "unreadable", note: "image (needs OCR, not supported)" };
    }
    return { text: "", status: "skipped", note: `unsupported type .${ext}` };
  } catch (e: any) {
    return { text: "", status: "unreadable", note: String(e?.message || e).slice(0, 120) };
  }
}
