import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { buildReportPdf, toBase64 } from "@/lib/pdf-report";
import { dailyCounts, questionReport } from "@/lib/report";
import type { Question, SurveyResponse } from "@/lib/types";

const font = (f: string) => {
  const b = readFileSync(`node_modules/dejavu-fonts-ttf/ttf/${f}`);
  return toBase64(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fonts = { regular: font("DejaVuSans.ttf"), bold: font("DejaVuSans-Bold.ttf") };

const questions: Question[] = [
  { id: "n", type: "nps", title: "Şirketimizi bir arkadaşınıza önerme olasılığınız nedir?", required: true },
  { id: "h", type: "coklu_secim", title: "Hangi hizmetleri kullandınız?", required: false, options: ["Satış", "Teknik destek", "Kurulum ve eğitim çalışmaları için uzun bir seçenek adı"] },
  { id: "p", type: "derecelendirme", title: "Genel memnuniyet", required: false, scaleMax: 5 },
  { id: "y", type: "uzun_metin", title: "Neden düşük puan verdiniz?", required: false, showIf: { questionId: "n", operator: "kucuk_esit", value: 6 } },
];

function responses(n: number): SurveyResponse[] {
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, (_, i) => {
    const nps = Math.round(rnd() * 10);
    return {
      id: String(i),
      surveyId: "s",
      createdAt: new Date(Date.now() - Math.floor(rnd() * 29) * 86_400_000).toISOString(),
      answers: {
        n: nps,
        h: ["Satış", "Teknik destek", "Kurulum ve eğitim çalışmaları için uzun bir seçenek adı"].filter(() => rnd() > 0.5),
        p: 1 + Math.floor(rnd() * 5),
        ...(nps <= 6 ? { y: `Çok uzun bir şikâyet metni: ğüşıöç ĞÜŞİÖÇ — teslimat gecikti, iletişim zayıftı ve fiyat yüksekti (${i}).` } : {}),
      },
    };
  });
}

describe("PDF raporu", () => {
  it("Türkçe karakterli, çok sayfalı geçerli bir PDF üretir", async () => {
    const rs = responses(80);
    const reports = questions.map((q) => questionReport(q, rs));
    const nps = reports[0]!;
    const bytes = await buildReportPdf(
      {
        title: "Çalışan Memnuniyeti Anketi — Ekim",
        rangeLabel: "Son 30 gün",
        generatedAt: new Date(2026, 9, 28, 14, 30),
        summary: { count: rs.length, dailyAvg: rs.length / 30, last: rs[0]!.createdAt, nps: nps.kind === "nps" ? nps.score : null, npsCount: nps.answered },
        daily: dailyCounts(rs, "30"),
        reports,
        shown: { n: 80, h: 80, p: 80, y: rs.filter((r) => (r.answers.n as number) <= 6).length },
      },
      fonts,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeLessThan(600_000);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
  });
});
