import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { dailyCounts, filterByRange, npsScore, questionReport } from "@/lib/report";
import { fileBaseName, responseRows, safeText, toCsv, toXlsx } from "@/lib/export";
import type { Question, SurveyResponse } from "@/lib/types";

const now = new Date(2026, 9, 28, 15, 0);
const at = (daysAgo: number, h = 10) => new Date(2026, 9, 28 - daysAgo, h).toISOString();
const resp = (answers: SurveyResponse["answers"], daysAgo = 0): SurveyResponse => ({ id: Math.random().toString(36), surveyId: "s", answers, createdAt: at(daysAgo) });

describe("rapor hesapları", () => {
  it("NPS skorunu hesaplar", () => {
    expect(npsScore([])).toBeNull();
    expect(npsScore([10, 9, 8, 7, 6, 0])).toBe(0);
    expect(npsScore([10, 10, 10, 6])).toBe(50);
    expect(npsScore([0, 1, 2])).toBe(-100);
  });

  it("seçenekli soruda sayıları ve yüzdeleri verir; çoklu seçimde kişi başına yüzde", () => {
    const q: Question = { id: "q", type: "coklu_secim", title: "Hizmet", required: false, options: ["Satış", "Destek", "Eğitim"] };
    const r = questionReport(q, [resp({ q: ["Satış", "Destek"] }), resp({ q: ["Destek"] }), resp({}), resp({ q: ["Eski seçenek"] })]);
    expect(r.kind).toBe("secenek");
    if (r.kind !== "secenek") return;
    expect(r.answered).toBe(3);
    expect(r.options.map((o) => [o.label, o.count, Math.round(o.percent)])).toEqual([
      ["Satış", 1, 33], ["Destek", 2, 67], ["Eğitim", 0, 0], ["Eski seçenek", 1, 33],
    ]);
  });

  it("evet/hayır sabit seçenekleri kullanır", () => {
    const r = questionReport({ id: "q", type: "evet_hayir", title: "?", required: false }, [resp({ q: "Evet" }), resp({ q: "Evet" }), resp({ q: "Hayır" })]);
    expect(r.kind === "secenek" && r.options.map((o) => o.count)).toEqual([2, 1]);
  });

  it("puan ortalaması ve dağılımı", () => {
    const r = questionReport({ id: "q", type: "derecelendirme", title: "?", required: false, scaleMax: 5 }, [resp({ q: 5 }), resp({ q: 4 }), resp({ q: 4 }), resp({ q: "" })]);
    expect(r.kind === "puan" && [r.answered, r.average?.toFixed(2), r.distribution.map((d) => d.count)]).toEqual([3, "4.33", [0, 0, 0, 2, 1]]);
  });

  it("NPS sorusu raporu (0 geçerli yanıttır)", () => {
    const r = questionReport({ id: "q", type: "nps", title: "?", required: false }, [resp({ q: 0 }), resp({ q: 8 }), resp({ q: 9 }), resp({ q: 10 })]);
    expect(r.kind === "nps" && [r.score, r.detractors, r.passives, r.promoters, r.distribution[0]!.count]).toEqual([25, 1, 1, 2, 1]);
  });

  it("metin yanıtlarını en yeni üstte listeler", () => {
    const r = questionReport({ id: "q", type: "uzun_metin", title: "?", required: false }, [resp({ q: "eski" }, 3), resp({ q: "yeni" }, 0), resp({})]);
    expect(r.kind === "metin" && r.answers.map((a) => a.value)).toEqual(["yeni", "eski"]);
  });

  it("tarih aralığı filtresi ve boş günleri dolduran günlük sayım", () => {
    const rs = [resp({}, 0), resp({}, 0), resp({}, 2), resp({}, 10)];
    expect(filterByRange(rs, "7", now)).toHaveLength(3);
    expect(filterByRange(rs, "tumu", now)).toHaveLength(4);
    const d7 = dailyCounts(filterByRange(rs, "7", now), "7", now);
    expect(d7).toHaveLength(7);
    expect(d7.map((d) => d.count)).toEqual([0, 0, 0, 0, 1, 0, 2]);
    expect(d7.at(-1)!.day).toBe("2026-10-28");
    expect(dailyCounts(rs, "tumu", now)).toHaveLength(11);
    expect(dailyCounts([], "tumu", now)).toEqual([]);
  });
});

describe("dışa aktarma", () => {
  const qs: Question[] = [
    { id: "a", type: "kisa_metin", title: "Görüş", required: false },
    { id: "b", type: "coklu_secim", title: "Seçim", required: false, options: ["X", "Y"] },
    { id: "c", type: "derecelendirme", title: "Puan", required: false },
  ];
  const rs = [resp({ a: '=HYPERLINK("kötü")', b: ["X", "Y"], c: 4.5 }, 1), resp({ a: "Çok iyi; teşekkürler\nikinci satır" }, 0)];

  it("formül enjeksiyonunu etkisizleştirir", () => {
    expect(safeText("=1+1")).toBe("'=1+1");
    expect(safeText("@SUM")).toBe("'@SUM");
    expect(safeText("normal")).toBe("normal");
  });

  it("satırları eskiden yeniye, başlıkla üretir", () => {
    const rows = responseRows(qs, rs);
    expect(rows[0]).toEqual(["Yanıt no", "Tarih", "1. Görüş", "2. Seçim", "3. Puan"]);
    expect(rows[1]!.slice(2)).toEqual(['=HYPERLINK("kötü")', "X, Y", 4.5]);
    expect(rows[2]![0]).toBe(2);
  });

  it("Türkçe Excel uyumlu CSV üretir", () => {
    const csv = toCsv(responseRows(qs, rs));
    expect(csv.startsWith("﻿Yanıt no;Tarih;1. Görüş")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""kötü"")"`);
    expect(csv).toContain(";4,5\r\n");
    expect(csv).toContain('"Çok iyi; teşekkürler\nikinci satır"');
  });

  it("geçerli bir xlsx paketi üretir", async () => {
    const files = unzipSync(new Uint8Array(await toXlsx(responseRows(qs, rs), "Yemekhane: Ekim/2026")));
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml",
    ]);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain('<c r="E2"><v>4.5</v></c>');
    // xlsx'te metin hücresi (inlineStr) formül olarak çalıştırılmaz; formül için <f> gerekir
    expect(sheet).toContain('<c r="C2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;kötü&quot;)</t></is></c>');
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('state="frozen"');
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain('name="Yemekhane  Ekim 2026"');
  });

  it("dosya adını Türkçe karakterlerden arındırır", () => {
    expect(fileBaseName("Çalışan Memnuniyeti Anketi")).toMatch(/^Calisan-Memnuniyeti-Anketi-yanitlar-\d{4}-\d{2}-\d{2}$/);
  });
});
