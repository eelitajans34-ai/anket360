import { isAnswered } from "./answers";
import type { AnswerValue, Question, SurveyResponse } from "./types";

/** Rapor hesaplamaları — arayüzden bağımsız, saf fonksiyonlar. */

export type RangeKey = "tumu" | "7" | "30" | "90";

export const RANGE_LABEL: Record<RangeKey, string> = {
  tumu: "Tüm zamanlar",
  "7": "Son 7 gün",
  "30": "Son 30 gün",
  "90": "Son 90 gün",
};

/** Yerel saatle YYYY-AA-GG */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function filterByRange(responses: SurveyResponse[], range: RangeKey, now = new Date()): SurveyResponse[] {
  if (range === "tumu") return responses;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (Number(range) - 1));
  return responses.filter((r) => new Date(r.createdAt) >= start);
}

export interface DailyPoint { day: string; count: number }

/** Günlük yanıt sayıları; boş günler 0 ile doldurulur. En fazla `maxDays` gün. */
export function dailyCounts(responses: SurveyResponse[], range: RangeKey, now = new Date(), maxDays = 90): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const r of responses) {
    const k = dayKey(new Date(r.createdAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let days: number;
  if (range === "tumu") {
    if (responses.length === 0) return [];
    const first = responses.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), responses[0]!.createdAt);
    const f = new Date(first);
    const firstDay = new Date(f.getFullYear(), f.getMonth(), f.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    days = Math.round((today.getTime() - firstDay.getTime()) / 86_400_000) + 1;
    days = Math.max(7, Math.min(days, maxDays));
  } else {
    days = Number(range);
  }
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    out.push({ day: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

export interface OptionStat { label: string; count: number; percent: number }

export type QuestionReport =
  | { kind: "secenek"; question: Question; answered: number; multi: boolean; options: OptionStat[] }
  | { kind: "puan"; question: Question; answered: number; average: number | null; max: number; distribution: OptionStat[] }
  | {
      kind: "nps";
      question: Question;
      answered: number;
      score: number | null;
      average: number | null;
      detractors: number;
      passives: number;
      promoters: number;
      distribution: OptionStat[];
    }
  | { kind: "metin"; question: Question; answered: number; answers: Array<{ value: string; createdAt: string }> };

const pct = (n: number, total: number) => (total === 0 ? 0 : (n / total) * 100);

function optionLabels(q: Question): string[] {
  if (q.type === "evet_hayir") return ["Evet", "Hayır"];
  return q.options ?? [];
}

function toNumber(v: AnswerValue | undefined): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Net Tavsiye Skoru: %destekleyen (9–10) − %kötüleyen (0–6), −100…+100 */
export function npsScore(values: number[]): number | null {
  if (values.length === 0) return null;
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  return Math.round(((promoters - detractors) / values.length) * 100);
}

export function questionReport(q: Question, responses: SurveyResponse[]): QuestionReport {
  const values = responses.map((r) => r.answers[q.id]).filter(isAnswered) as AnswerValue[];
  const answered = values.length;

  switch (q.type) {
    case "tek_secim":
    case "acilir_liste":
    case "evet_hayir":
    case "coklu_secim": {
      const labels = optionLabels(q);
      const counts = new Map(labels.map((l) => [l, 0]));
      for (const v of values) {
        for (const item of Array.isArray(v) ? v : [String(v)]) counts.set(item, (counts.get(item) ?? 0) + 1);
      }
      // Ankette artık bulunmayan seçenekler (soru sonradan düzenlendiyse) sona eklenir
      const options = [...counts.entries()].map(([label, count]) => ({ label, count, percent: pct(count, answered) }));
      return { kind: "secenek", question: q, answered, multi: q.type === "coklu_secim", options };
    }
    case "derecelendirme": {
      const max = q.scaleMax ?? 5;
      const nums = values.map(toNumber).filter((n): n is number => n !== null);
      const distribution = Array.from({ length: max }, (_, i) => {
        const count = nums.filter((n) => n === i + 1).length;
        return { label: String(i + 1), count, percent: pct(count, nums.length) };
      });
      const average = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      return { kind: "puan", question: q, answered: nums.length, average, max, distribution };
    }
    case "nps": {
      const nums = values.map(toNumber).filter((n): n is number => n !== null && n >= 0 && n <= 10);
      const distribution = Array.from({ length: 11 }, (_, i) => {
        const count = nums.filter((n) => n === i).length;
        return { label: String(i), count, percent: pct(count, nums.length) };
      });
      return {
        kind: "nps",
        question: q,
        answered: nums.length,
        score: npsScore(nums),
        average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        detractors: nums.filter((n) => n <= 6).length,
        passives: nums.filter((n) => n === 7 || n === 8).length,
        promoters: nums.filter((n) => n >= 9).length,
        distribution,
      };
    }
    default: {
      const answers = responses
        .filter((r) => isAnswered(r.answers[q.id]))
        .map((r) => ({ value: String(r.answers[q.id]), createdAt: r.createdAt }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { kind: "metin", question: q, answered: answers.length, answers };
    }
  }
}

/** Türkçe sayı biçimi: 4,2 · %38 */
export const fmt = {
  num: (n: number, digits = 1) => n.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  pct: (n: number) => `%${Math.round(n).toLocaleString("tr-TR")}`,
  signed: (n: number) => (n > 0 ? `+${n}` : String(n)),
};
