import { Inbox } from "lucide-react";
import { db } from "@/lib/data";
import type { AnswerValue, Question } from "@/lib/types";
import { useAsync } from "@/lib/use-async";

export function formatAnswer(q: Question, v: AnswerValue | undefined): string {
  if (v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (q.type === "derecelendirme") return `${v} / ${q.scaleMax ?? 5}`;
  if (q.type === "tarih" && typeof v === "string") {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR");
  }
  return String(v);
}

/** Bir anketin gelen yanıtlarının listesi (en yeni üstte). */
export function ResponsesTable({ surveyId, questions }: { surveyId: string; questions: Question[] }) {
  const { data: responses = [], loading, error } = useAsync(() => db.listResponses(surveyId), [surveyId]);

  if (loading) return <p className="card p-8 text-center text-sm text-slate-500">Yanıtlar yükleniyor…</p>;
  if (error) return <p className="card p-8 text-center text-sm text-red-600">{error.message}</p>;
  if (responses.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Inbox className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-medium">Henüz yanıt yok</p>
        <p className="mt-1 text-sm text-slate-500">Anketi yayınlayıp paylaştığınızda gelen yanıtlar burada görünecek.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium">Toplam {responses.length} yanıt</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">#</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">Tarih</th>
              {questions.map((q, i) => (
                <th key={q.id} scope="col" className="min-w-[160px] px-4 py-2.5" title={q.title}>
                  <span className="line-clamp-2">{i + 1}. {q.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {responses.map((r, n) => (
              <tr key={r.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-400">{responses.length - n}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                  {new Date(r.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                {questions.map((q) => (
                  <td key={q.id} className="px-4 py-2.5">{formatAnswer(q, r.answers[q.id])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
