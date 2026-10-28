import { visibleQuestionIds } from "./conditions";
import type { AnswerValue, Answers, Question } from "./types";

export function isAnswered(v: AnswerValue | null | undefined): boolean {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Yanıtlanmamış zorunlu soruların kimliklerini döner (koşulu sağlanmadığı için gizli sorular hariç). */
export function missingRequired(questions: Question[], answers: Answers): string[] {
  const visible = visibleQuestionIds(questions, answers);
  return questions.filter((q) => q.required && visible.has(q.id) && !isAnswered(answers[q.id])).map((q) => q.id);
}

/** Boş yanıtları ve gizli soruların yanıtlarını atar; yalnızca görünen soruların yanıtları kalır. */
export function cleanAnswers(questions: Question[], answers: Answers): Answers {
  const ids = visibleQuestionIds(questions, answers);
  return Object.fromEntries(Object.entries(answers).filter(([k, v]) => ids.has(k) && isAnswered(v)));
}

/** Bitiş tarihi (YYYY-AA-GG) geçti mi? Bitiş günü dahil yanıt kabul edilir. */
export function isPastEndDate(endsAt: string | undefined, today = new Date()): boolean {
  if (!endsAt) return false;
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return endsAt < t;
}
