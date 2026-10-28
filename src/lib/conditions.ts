import { isAnswered } from "./answers";
import type { AnswerValue, Answers, ConditionOperator, Question, QuestionCondition, QuestionType } from "./types";

/**
 * Koşullu soru mantığı. supabase/migrations/*_kosullu_sorular.sql içindeki
 * kosul_saglandi / gorunur_sorular fonksiyonları bununla birebir aynı kuralları uygular.
 */

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  esittir: "şuna eşitse",
  esit_degil: "şuna eşit değilse",
  icerir: "şunu içeriyorsa",
  icermez: "şunu içermiyorsa",
  buyuk_esit: "en az şu ise",
  kucuk_esit: "en çok şu ise",
  yanitlandi: "yanıtlandıysa",
  yanitlanmadi: "yanıtlanmadıysa",
};

/** Bir soru tipine bağlanabilecek koşul türleri */
export function operatorsFor(type: QuestionType): ConditionOperator[] {
  switch (type) {
    case "tek_secim":
    case "acilir_liste":
    case "evet_hayir":
      return ["esittir", "esit_degil", "yanitlandi", "yanitlanmadi"];
    case "coklu_secim":
      return ["icerir", "icermez", "yanitlandi", "yanitlanmadi"];
    case "derecelendirme":
    case "nps":
      return ["esittir", "buyuk_esit", "kucuk_esit", "yanitlandi", "yanitlanmadi"];
    default:
      return ["yanitlandi", "yanitlanmadi"];
  }
}

export const needsValue = (op: ConditionOperator) => op !== "yanitlandi" && op !== "yanitlanmadi";

/** Koşulun değer seçenekleri (seçenekli ve puanlı sorular için) */
export function valueChoices(source: Question): Array<string | number> {
  switch (source.type) {
    case "evet_hayir":
      return ["Evet", "Hayır"];
    case "tek_secim":
    case "acilir_liste":
    case "coklu_secim":
      return source.options ?? [];
    case "derecelendirme":
      return Array.from({ length: source.scaleMax ?? 5 }, (_, i) => i + 1);
    case "nps":
      return Array.from({ length: 11 }, (_, i) => i);
    default:
      return [];
  }
}

const asNumber = (v: AnswerValue | undefined) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function conditionMet(cond: QuestionCondition, answer: AnswerValue | undefined): boolean {
  const answered = isAnswered(answer);
  switch (cond.operator) {
    case "yanitlandi":
      return answered;
    case "yanitlanmadi":
      return !answered;
    case "esittir":
      return answered && !Array.isArray(answer) && String(answer) === String(cond.value);
    case "esit_degil":
      return answered && !Array.isArray(answer) && String(answer) !== String(cond.value);
    case "icerir":
      return Array.isArray(answer) && answer.includes(String(cond.value));
    case "icermez":
      return answered && Array.isArray(answer) && !answer.includes(String(cond.value));
    case "buyuk_esit":
    case "kucuk_esit": {
      const a = asNumber(answer);
      const v = asNumber(cond.value as AnswerValue);
      if (a === null || v === null) return false;
      return cond.operator === "buyuk_esit" ? a >= v : a <= v;
    }
  }
}

/** Yanıtlara göre görünen soruların kimlikleri. Koşulun bağlı olduğu soru gizliyse soru da gizlidir. */
export function visibleQuestionIds(questions: Question[], answers: Answers): Set<string> {
  const visible = new Set<string>();
  for (const q of questions) {
    if (!q.showIf) {
      visible.add(q.id);
      continue;
    }
    if (visible.has(q.showIf.questionId) && conditionMet(q.showIf, answers[q.showIf.questionId])) visible.add(q.id);
  }
  return visible;
}

/** Ankette koşul yapısı geçerli mi? Hata mesajını döner, geçerliyse null. */
export function conditionError(questions: Question[], index: number): string | null {
  const q = questions[index]!;
  const c = q.showIf;
  if (!c) return null;
  const n = index + 1;
  const srcIndex = questions.findIndex((x) => x.id === c.questionId);
  if (srcIndex === -1) return `${n}. sorunun koşulu silinmiş bir soruya bağlı.`;
  if (srcIndex >= index) return `${n}. sorunun koşulu kendisinden sonra gelen bir soruya bağlı. Koşul yalnızca önceki sorulara bağlanabilir.`;
  const src = questions[srcIndex]!;
  if (!operatorsFor(src.type).includes(c.operator)) return `${n}. sorunun koşulu, ${srcIndex + 1}. sorunun tipiyle uyumlu değil.`;
  if (needsValue(c.operator)) {
    if (c.value === undefined || c.value === "") return `${n}. sorunun koşulu için bir değer seçin.`;
    const choices = valueChoices(src);
    if (choices.length && !choices.map(String).includes(String(c.value))) {
      return `${n}. sorunun koşulundaki "${c.value}" değeri ${srcIndex + 1}. soruda artık yok.`;
    }
  }
  return null;
}
