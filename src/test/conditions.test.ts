import { describe, expect, it } from "vitest";
import ornekler from "../../supabase/tests/kosul-ornekleri.json";
import { conditionError, conditionMet, visibleQuestionIds } from "@/lib/conditions";
import { cleanAnswers, missingRequired } from "@/lib/answers";
import { validateSurvey } from "@/lib/data/local-store";
import type { AnswerValue, Question, QuestionCondition } from "@/lib/types";

const anket = ornekler.anket as Question[];

describe("koşul değerlendirme (SQL ile ortak örnekler)", () => {
  it.each(ornekler.kosullar.map((o) => [o.cond.operator, JSON.stringify(o.cond.value), JSON.stringify(o.answer), o.expected, o] as const))(
    "%s %s ← %s = %s",
    (_op, _v, _a, expected, o) => {
      expect(conditionMet(o.cond as QuestionCondition, (o.answer ?? undefined) as AnswerValue | undefined)).toBe(expected);
    },
  );

  it.each(ornekler.gorunurluk.map((o) => [JSON.stringify(o.answers), o.visible] as const))("görünür sorular %s → %j", (answers, visible) => {
    expect([...visibleQuestionIds(anket, JSON.parse(answers))]).toEqual(visible);
  });
});

describe("koşullu sorularda zorunluluk ve temizleme", () => {
  it("gizli zorunlu soru aranmaz, gizli soruların yanıtları atılır", () => {
    expect(missingRequired(anket, { a: 10 })).toEqual([]);
    expect(missingRequired(anket, { a: 2 })).toEqual(["b"]);
    expect(cleanAnswers(anket, { a: 10, b: "eski", c: "Evet", d: "Süper" })).toEqual({ a: 10, d: "Süper" });
  });
});

describe("koşul doğrulaması", () => {
  const base = (questions: Question[]) => ({ title: "T", status: "taslak" as const, questions });
  it("sonraki soruya bağlı koşulu reddeder", () => {
    const qs = [anket[1]!, anket[0]!];
    expect(conditionError(qs, 0)).toMatch(/kendisinden sonra gelen/);
    expect(() => validateSurvey(base(qs))).toThrow(/kendisinden sonra gelen/);
  });
  it("silinmiş soruya, uyumsuz türe ve artık olmayan seçeneğe bağlı koşulu reddeder", () => {
    const q = (showIf: QuestionCondition): Question => ({ id: "x", type: "kisa_metin", title: "X", required: false, showIf });
    const src: Question = { id: "s", type: "tek_secim", title: "S", required: false, options: ["A", "B"] };
    expect(conditionError([src, q({ questionId: "yok", operator: "yanitlandi" })], 1)).toMatch(/silinmiş/);
    expect(conditionError([src, q({ questionId: "s", operator: "icerir", value: "A" })], 1)).toMatch(/uyumlu değil/);
    expect(conditionError([src, q({ questionId: "s", operator: "esittir", value: "C" })], 1)).toMatch(/"C" değeri/);
    expect(conditionError([src, q({ questionId: "s", operator: "esittir" })], 1)).toMatch(/değer seçin/);
    expect(conditionError([src, q({ questionId: "s", operator: "esittir", value: "B" })], 1)).toBeNull();
    expect(() => validateSurvey(base(anket))).not.toThrow();
  });
});
