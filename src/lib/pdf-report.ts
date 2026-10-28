import type { jsPDF as JsPDF } from "jspdf";
import { fmt, type DailyPoint, type OptionStat, type QuestionReport } from "./report";

/**
 * Rapor PDF'i (A4, dikey). Grafikler vektör olarak çizilir; Türkçe karakterler
 * için DejaVu Sans gömülür. jsPDF ve yazı tipleri yalnızca PDF üretilirken yüklenir.
 */

export interface ReportPdfInput {
  title: string;
  rangeLabel: string;
  generatedAt: Date;
  summary: { count: number; dailyAvg: number | null; last: string | null; nps: number | null; npsCount: number };
  daily: DailyPoint[];
  reports: QuestionReport[];
  /** Koşullu sorular için gösterilme sayısı (soru kimliği → kişi) */
  shown: Record<string, number>;
}

export interface PdfFonts {
  regular: string; // base64 TTF
  bold: string;
}

const C = {
  ink: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  seq: "#2a78d6",
  neg: "#e34948",
  neutral: "#c3c2b7",
  brand: "#1d56f1",
  tile: "#f8fafc",
};

const PAGE = { w: 210, h: 297, m: 16 };
const CONTENT_W = PAGE.w - PAGE.m * 2;
const BOTTOM = PAGE.h - 18;
const MAX_TEXT_ANSWERS = 15;

export async function buildReportPdf(input: ReportPdfInput, fonts: PdfFonts): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
  doc.setProperties({ title: `${input.title} — Rapor`, creator: "Anket360", subject: input.rangeLabel });

  const w = new Writer(doc);
  header(w, input);
  summary(w, input);
  if (input.summary.count > 0) {
    dailyChart(w, input.daily);
    input.reports.forEach((r, i) => question(w, r, i, input.shown[r.question.id]));
  } else {
    w.text("Bu aralıkta yanıt yok.", { size: 11, color: C.muted });
  }
  footers(doc, input);
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Satır takibi ve sayfa sonu yönetimi */
class Writer {
  y = PAGE.m;
  constructor(public doc: JsPDF) {}

  ensure(height: number) {
    if (this.y + height > BOTTOM) {
      this.doc.addPage();
      this.y = PAGE.m;
    }
  }

  font(size: number, bold = false, color = C.ink) {
    this.doc.setFont("DejaVu", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
  }

  /** Satır yüksekliği (mm) — punto × 0.3528 × 1.35 */
  lh(size: number) {
    return size * 0.3528 * 1.35;
  }

  lines(text: string, width: number, size: number, bold = false): string[] {
    this.font(size, bold);
    return this.doc.splitTextToSize(text, width) as string[];
  }

  text(text: string, o: { size?: number; bold?: boolean; color?: string; x?: number; width?: number; gapAfter?: number } = {}) {
    const size = o.size ?? 10;
    const ls = this.lines(text, o.width ?? CONTENT_W, size, o.bold);
    const h = ls.length * this.lh(size);
    this.ensure(h);
    this.font(size, o.bold, o.color);
    ls.forEach((l, i) => this.doc.text(l, o.x ?? PAGE.m, this.y + this.lh(size) * (i + 0.8)));
    this.y += h + (o.gapAfter ?? 0);
  }
}

function header(w: Writer, input: ReportPdfInput) {
  const d = w.doc;
  d.setFillColor(C.brand);
  d.roundedRect(PAGE.m, w.y, 6, 6, 1.2, 1.2, "F");
  w.font(10, true, C.ink);
  d.text("Anket360", PAGE.m + 8, w.y + 4.6);
  w.font(8, false, C.muted);
  d.text(`Oluşturma: ${input.generatedAt.toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" })}`, PAGE.w - PAGE.m, w.y + 4.6, { align: "right" });
  w.y += 12;
  w.text(input.title, { size: 18, bold: true, gapAfter: 1 });
  w.text(`Anket raporu · ${input.rangeLabel}`, { size: 10, color: C.muted, gapAfter: 6 });
}

function summary(w: Writer, input: ReportPdfInput) {
  const s = input.summary;
  const tiles: Array<[string, string, string]> = [
    ["Yanıt sayısı", s.count.toLocaleString("tr-TR"), input.rangeLabel],
    ["Günlük ortalama", s.dailyAvg === null ? "—" : fmt.num(s.dailyAvg), input.daily.length ? `${input.daily.length} gün` : ""],
    ["Son yanıt", s.last ? new Date(s.last).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "—", s.last ? new Date(s.last).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : ""],
    ["NPS", s.nps === null ? "—" : fmt.signed(s.nps), s.nps === null ? "NPS sorusu yok" : `${s.npsCount} kişi`],
  ];
  const gap = 4;
  const tw = (CONTENT_W - gap * 3) / 4;
  const th = 22;
  w.ensure(th + 8);
  tiles.forEach(([label, value, hint], i) => {
    const x = PAGE.m + i * (tw + gap);
    w.doc.setFillColor(C.tile);
    w.doc.setDrawColor(C.line);
    w.doc.roundedRect(x, w.y, tw, th, 2, 2, "FD");
    w.font(7.5, false, C.muted);
    w.doc.text(label, x + 4, w.y + 6);
    w.font(15, true, C.ink);
    w.doc.text(value, x + 4, w.y + 14);
    if (hint) {
      w.font(7, false, C.muted);
      w.doc.text(hint, x + 4, w.y + 19);
    }
  });
  w.y += th + 8;
}

function sectionTitle(w: Writer, title: string, meta: string, minBody: number) {
  const titleLines = w.lines(title, CONTENT_W, 11.5, true);
  const h = titleLines.length * w.lh(11.5) + w.lh(8) + 3;
  w.ensure(h + minBody);
  w.doc.setDrawColor(C.line);
  w.doc.line(PAGE.m, w.y, PAGE.w - PAGE.m, w.y);
  w.y += 4;
  w.text(title, { size: 11.5, bold: true });
  if (meta) w.text(meta, { size: 8, color: C.muted, gapAfter: 3 });
  else w.y += 3;
}

/** Tek serili sütun grafik */
function columns(w: Writer, points: Array<{ label: string; count: number }>, height: number, labelEvery = 1) {
  const d = w.doc;
  w.ensure(height + 8);
  const max = Math.max(1, ...points.map((p) => p.count));
  const top = niceMax(max);
  const axisW = 8;
  const x0 = PAGE.m + axisW;
  const width = CONTENT_W - axisW;
  const y0 = w.y;
  const yBase = y0 + height;

  d.setDrawColor(C.grid);
  d.setLineWidth(0.2);
  d.line(x0, y0, x0 + width, y0);
  d.setDrawColor(C.axis);
  d.line(x0, yBase, x0 + width, yBase);
  w.font(6.5, false, C.faint);
  d.text(String(top), x0 - 1.5, y0 + 1, { align: "right" });
  d.text("0", x0 - 1.5, yBase + 1, { align: "right" });

  const slot = width / points.length;
  const barW = Math.min(slot - 0.6, 6.5);
  const peak = points.findIndex((p) => p.count === max);
  points.forEach((p, i) => {
    const cx = x0 + slot * (i + 0.5);
    const h = (p.count / top) * height;
    if (h > 0) {
      // PDF'te metin rengi dolgu rengini de değiştirir; her çubuktan önce yeniden ayarla
      d.setFillColor(C.seq);
      const r = Math.min(1, barW / 2, h);
      d.roundedRect(cx - barW / 2, yBase - h, barW, h, r, r, "F");
      if (h > r) d.rect(cx - barW / 2, yBase - r, barW, r, "F"); // taban köşeleri düz
    }
    if (i === peak && p.count > 0) {
      w.font(6.5, true, C.ink);
      d.text(String(p.count), cx, yBase - h - 1.2, { align: "center" });
    }
    if (i % labelEvery === 0) {
      w.font(6.5, false, C.faint);
      d.text(p.label, cx, yBase + 4, { align: "center" });
    }
  });
  w.y = yBase + 8;
}

function niceMax(n: number): number {
  if (n <= 5) return Math.max(n, 1);
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= n) return m * pow;
  return n;
}

function dailyChart(w: Writer, daily: DailyPoint[]) {
  sectionTitle(w, "Günlük yanıtlar", "", 40);
  const every = Math.max(1, Math.ceil(daily.length / 10));
  columns(
    w,
    daily.map((p) => ({ label: new Date(`${p.day}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), count: p.count })),
    32,
    every,
  );
}

function hbars(w: Writer, items: OptionStat[]) {
  const d = w.doc;
  const labelW = 58;
  const barMax = CONTENT_W - labelW - 22;
  const max = Math.max(1, ...items.map((i) => i.count));
  for (const it of items) {
    const ls = w.lines(it.label, labelW - 2, 9);
    const rowH = Math.max(6.5, ls.length * w.lh(9) + 1.5);
    w.ensure(rowH);
    w.font(9, false, C.ink);
    ls.forEach((l, i) => d.text(l, PAGE.m, w.y + 4.2 + i * w.lh(9)));
    const bw = (it.count / max) * barMax;
    if (bw > 0) {
      d.setFillColor(C.seq);
      d.roundedRect(PAGE.m + labelW, w.y + 1, bw, 4.4, Math.min(1, bw / 2), Math.min(1, bw / 2), "F");
      if (bw > 1) d.rect(PAGE.m + labelW, w.y + 1, Math.min(1, bw), 4.4, "F");
    }
    w.font(8.5, true, C.ink);
    const countTxt = String(it.count);
    d.text(countTxt, PAGE.m + labelW + bw + 2, w.y + 4.2);
    w.font(8.5, false, C.muted);
    d.text(` · ${fmt.pct(it.percent)}`, PAGE.m + labelW + bw + 2 + d.getTextWidth(countTxt), w.y + 4.2);
    w.y += rowH;
  }
  w.y += 3;
}

function bigNumber(w: Writer, label: string, value: string, sub?: string) {
  w.ensure(20);
  w.font(8, false, C.muted);
  w.doc.text(label, PAGE.m, w.y + 3);
  w.font(20, true, C.ink);
  w.doc.text(value, PAGE.m, w.y + 11);
  if (sub) {
    w.font(8, false, C.muted);
    w.doc.text(sub, PAGE.m, w.y + 16);
  }
  w.y += 20;
}

function npsBar(w: Writer, r: Extract<QuestionReport, { kind: "nps" }>) {
  const d = w.doc;
  const total = r.detractors + r.passives + r.promoters;
  const parts = [
    { label: "Kötüleyen (0–6)", n: r.detractors, color: C.neg, ink: "#ffffff" },
    { label: "Pasif (7–8)", n: r.passives, color: C.neutral, ink: "#0b0b0b" },
    { label: "Destekleyen (9–10)", n: r.promoters, color: C.seq, ink: "#ffffff" },
  ];
  w.ensure(16);
  const gap = 0.6;
  const visible = parts.filter((p) => p.n > 0);
  const usable = CONTENT_W - gap * (visible.length - 1);
  let x = PAGE.m;
  visible.forEach((p) => {
    const pw = (p.n / total) * usable;
    d.setFillColor(p.color);
    d.rect(x, w.y, pw, 7, "F");
    const share = (p.n / total) * 100;
    if (share >= 10) {
      w.font(8, true, p.ink);
      d.text(fmt.pct(share), x + pw / 2, w.y + 4.8, { align: "center" });
    }
    x += pw + gap;
  });
  w.y += 11;
  // Lejant
  x = PAGE.m;
  parts.forEach((p) => {
    d.setFillColor(p.color);
    d.rect(x, w.y - 2.4, 2.6, 2.6, "F");
    w.font(8, false, C.muted);
    const t = `${p.label}: `;
    d.text(t, x + 3.8, w.y);
    w.font(8, true, C.ink);
    d.text(String(p.n), x + 3.8 + d.getTextWidth(t), w.y);
    x += 3.8 + d.getTextWidth(t) + d.getTextWidth(String(p.n)) + 8;
  });
  w.y += 6;
}

function question(w: Writer, r: QuestionReport, index: number, shown: number | undefined) {
  const answeredBase = shown ?? undefined;
  const parts: string[] = [];
  if (r.question.showIf) parts.push(`Koşullu · ${shown ?? 0} kişiye gösterildi`);
  parts.push(`${r.answered} yanıt`);
  if (answeredBase !== undefined && answeredBase - r.answered > 0) parts.push(`${answeredBase - r.answered} boş`);
  if (r.kind === "secenek" && r.multi) parts.push("birden fazla seçilebilir");
  sectionTitle(w, `${index + 1}. ${r.question.title}`, parts.join(" · "), 14);

  if (r.answered === 0) {
    w.text("Bu soru bu aralıkta yanıtlanmadı.", { size: 9, color: C.muted, gapAfter: 4 });
    return;
  }
  switch (r.kind) {
    case "secenek":
      hbars(w, r.options);
      break;
    case "puan":
      bigNumber(w, "Ortalama", `${fmt.num(r.average!)} / ${r.max}`);
      columns(w, r.distribution.map((d) => ({ label: `${d.label} puan`, count: d.count })), 22);
      break;
    case "nps":
      bigNumber(w, "NPS skoru", fmt.signed(r.score!), `Ortalama ${fmt.num(r.average!)} / 10`);
      npsBar(w, r);
      columns(w, r.distribution.map((d) => ({ label: d.label, count: d.count })), 22);
      break;
    case "metin": {
      const list = r.answers.slice(0, MAX_TEXT_ANSWERS);
      for (const a of list) {
        const val = r.question.type === "tarih" ? new Date(`${a.value}T00:00:00`).toLocaleDateString("tr-TR") : a.value;
        const date = new Date(a.createdAt).toLocaleDateString("tr-TR");
        const ls = w.lines(val, CONTENT_W - 28, 9);
        const h = ls.length * w.lh(9) + 2.5;
        w.ensure(h);
        w.font(9, false, C.ink);
        ls.forEach((l, i) => w.doc.text(l, PAGE.m + 3, w.y + 3.6 + i * w.lh(9)));
        w.doc.setFillColor(C.faint);
        w.doc.circle(PAGE.m + 0.8, w.y + 2.6, 0.5, "F");
        w.font(7.5, false, C.faint);
        w.doc.text(date, PAGE.w - PAGE.m, w.y + 3.6, { align: "right" });
        w.y += h;
      }
      if (r.answers.length > list.length) {
        w.text(`+${r.answers.length - list.length} yanıt daha (tamamı Excel/CSV dışa aktarımında)`, { size: 8, color: C.muted });
      }
      w.y += 3;
      break;
    }
  }
}

function footers(doc: JsPDF, input: ReportPdfInput) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C.faint);
    doc.text(`${input.title} · ${input.rangeLabel}`, PAGE.m, PAGE.h - 9, { maxWidth: CONTENT_W - 30 });
    doc.text(`Sayfa ${i} / ${n}`, PAGE.w - PAGE.m, PAGE.h - 9, { align: "right" });
  }
}

/** Tarayıcıda yazı tiplerini yükler (yalnızca PDF üretilirken). */
export async function loadPdfFonts(): Promise<PdfFonts> {
  const [{ default: regularUrl }, { default: boldUrl }] = await Promise.all([
    import("dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url"),
    import("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url"),
  ]);
  const [regular, bold] = await Promise.all([regularUrl, boldUrl].map(async (u) => toBase64(await (await fetch(u)).arrayBuffer())));
  return { regular: regular!, bold: bold! };
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
