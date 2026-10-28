import type { AnswerValue, Question, SurveyResponse } from "./types";

/** Yanıtları tablo satırlarına çevirir: ilk satır başlık. */
export function responseRows(questions: Question[], responses: SurveyResponse[]): Array<Array<string | number>> {
  const header = ["Yanıt no", "Tarih", ...questions.map((q, i) => `${i + 1}. ${q.title}`)];
  const sorted = [...responses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows = sorted.map((r, i) => [
    i + 1,
    new Date(r.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }),
    ...questions.map((q) => cell(r.answers[q.id])),
  ]);
  return [header, ...rows];
}

function cell(v: AnswerValue | undefined): string | number {
  if (v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  return v;
}

/**
 * Hücre formül enjeksiyonu koruması (CSV/Excel "formula injection"):
 * katılımcı metni =, +, -, @, sekme veya CR ile başlıyorsa başına ' eklenir.
 */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Türkçe Excel uyumlu CSV: ; ayraç, UTF-8 BOM, CRLF. */
export function toCsv(rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => {
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = safeText(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}

const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // XML 1.0'da geçersiz kontrol karakterlerini at
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Tek sayfalı, başlığı kalın ve sabitlenmiş en küçük geçerli .xlsx dosyası.
 * Metinler inlineStr hücresidir; Excel bunları formül olarak çalıştırmaz (safeText gerekmez).
 */
export async function toXlsx(rows: Array<Array<string | number>>, sheetName = "Yanıtlar"): Promise<Uint8Array> {
  // Excel paketi yalnızca dışa aktarırken yüklenir
  const { strToU8, zipSync } = await import("fflate");
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          const style = ri === 0 ? ' s="1"' : "";
          if (typeof v === "number") return `<c r="${ref}"${style}><v>${v}</v></c>`;
          if (v === "") return "";
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const widths = (rows[0] ?? []).map((_, ci) => {
    const longest = Math.max(...rows.map((r) => String(r[ci] ?? "").length));
    return `<col min="${ci + 1}" max="${ci + 1}" width="${Math.min(60, Math.max(10, longest + 2))}" customWidth="1"/>`;
  });
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths.length ? `<cols>${widths.join("")}</cols>` : ""}<sheetData>${sheetRows}</sheetData></worksheet>`;
  const safeName = xmlEsc(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Yanıtlar");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  // Farklı JS ortamlarında (ör. jsdom) TextEncoder başka bir Uint8Array türü döndürebilir;
  // fflate dosyaları instanceof ile tanıdığı için hepsini bu ortamın Uint8Array'ine çevir.
  const normalized = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)]));
  return zipSync(normalized, { level: 6 });
}

export function fileBaseName(title: string): string {
  const base = title
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", İ: "I", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", Ö: "O", Ş: "S", Ü: "U" })[c]!)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${base || "anket"}-yanitlar-${new Date().toISOString().slice(0, 10)}`;
}

export function download(data: string | Uint8Array, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
