import { BarChart3 } from "lucide-react";
import { db } from "@/lib/data";
import type { Question } from "@/lib/types";
import { useAsync } from "@/lib/use-async";

/**
 * Genel eğilim göstergesi: aynı standart soruya tüm Anket360 anketlerinde verilen
 * yanıtların toplamı. Kişisel bilgi içermez; en az 10 yanıt yoksa gösterilmez.
 */
export function BenchmarkHint({ question }: { question: Question }) {
  const { data, loading, error } = useAsync(() => db.getBenchmark(question.statKey!), [question.statKey]);
  if (loading || error || !data) return null;

  let text: string;
  if (data.insufficient) {
    text = "Genel eğilim için henüz yeterli yanıt yok (en az 10 gerekli).";
  } else if (question.type === "derecelendirme" && data.average != null) {
    text = `Ortalama puan ${data.average.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} / ${question.scaleMax ?? 5}`;
  } else if (data.options?.length) {
    const multi = question.type === "coklu_secim";
    text = data.options
      .slice(0, 2)
      .map((o) => `%${Math.round((o.count / data.total) * 100)} "${o.label}"${multi ? " seçti" : " dedi"}`)
      .join(" · ");
  } else {
    return null;
  }

  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900" title="Tüm Anket360 anketlerindeki bu standart soruya verilen yanıtların toplamıdır; kişisel bilgi içermez.">
      <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <strong>Genel eğilim</strong>
        {!data.insufficient && <> · {data.total.toLocaleString("tr-TR")} yanıt</>}: {text}
      </span>
    </p>
  );
}
