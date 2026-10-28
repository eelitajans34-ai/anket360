import { useMemo, useState } from "react";
import { BarChart3, FileSpreadsheet, FileText } from "lucide-react";
import { ColumnChart, HBarList, NpsBar, StatTile } from "./charts";
import { db } from "@/lib/data";
import { download, fileBaseName, responseRows, toCsv, toXlsx } from "@/lib/export";
import { RANGE_LABEL, dailyCounts, filterByRange, fmt, questionReport, type QuestionReport, type RangeKey } from "@/lib/report";
import type { Question } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

const RANGES: RangeKey[] = ["tumu", "7", "30", "90"];
const dayLabel = (k: string) => new Date(`${k}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
const dayLong = (k: string) => new Date(`${k}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

/** Anket raporu: tarih filtresi, özet, günlük yanıtlar, soru bazında grafikler, dışa aktarma. */
export function ReportView({ surveyId, title, questions }: { surveyId: string; title: string; questions: Question[] }) {
  const { data: all = [], loading, error } = useAsync(() => db.listResponses(surveyId), [surveyId]);
  const [range, setRange] = useState<RangeKey>("tumu");

  const responses = useMemo(() => filterByRange(all, range), [all, range]);
  const daily = useMemo(() => dailyCounts(responses, range), [responses, range]);
  const reports = useMemo(() => questions.map((q) => questionReport(q, responses)), [questions, responses]);
  const last = responses.reduce<string | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), null);
  const nps = reports.find((r): r is Extract<QuestionReport, { kind: "nps" }> => r.kind === "nps" && r.score !== null);

  function exportAs(kind: "csv" | "xlsx") {
    const rows = responseRows(questions, responses);
    const name = fileBaseName(title);
    if (kind === "csv") download(toCsv(rows), `${name}.csv`, "text/csv;charset=utf-8");
    else download(toXlsx(rows), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  if (loading) return <p className="card p-8 text-center text-sm text-slate-500">Rapor hazırlanıyor…</p>;
  if (error) return <p className="card p-8 text-center text-sm text-red-600">{error.message}</p>;

  return (
    <div className="space-y-6">
      {/* Filtreler ve dışa aktarma — raporun tamamını kapsar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Tarih aralığı">
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={cn("whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium sm:px-3", range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary px-3 py-2" onClick={() => exportAs("xlsx")} disabled={!responses.length}><FileSpreadsheet className="h-4 w-4" />Excel</button>
          <button className="btn-secondary px-3 py-2" onClick={() => exportAs("csv")} disabled={!responses.length}><FileText className="h-4 w-4" />CSV</button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Özet">
        <StatTile label="Yanıt sayısı" value={responses.length.toLocaleString("tr-TR")} hint={RANGE_LABEL[range]} />
        <StatTile label="Günlük ortalama" value={daily.length ? fmt.num(responses.length / daily.length) : "—"} hint={daily.length ? `${daily.length} gün` : undefined} />
        <StatTile label="Son yanıt" value={last ? new Date(last).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "—"} hint={last ? new Date(last).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : undefined} />
        <StatTile
          label="NPS"
          value={nps ? fmt.signed(nps.score!) : "—"}
          hint={nps ? `${nps.answered} kişi · −100 ile +100 arası` : "NPS sorusu yok"}
          tone={nps ? (nps.score! > 0 ? "good" : nps.score! < 0 ? "bad" : undefined) : undefined}
        />
      </section>

      {responses.length === 0 ? (
        <div className="card p-10 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium">{all.length ? "Bu aralıkta yanıt yok" : "Henüz yanıt yok"}</p>
          <p className="mt-1 text-sm text-slate-500">{all.length ? "Farklı bir tarih aralığı seçin." : "Anketi paylaştığınızda rapor burada oluşacak."}</p>
        </div>
      ) : (
        <>
          <section className="card p-5">
            <h3 className="font-semibold">Günlük yanıtlar</h3>
            <p className="mb-5 text-xs text-slate-500">{RANGE_LABEL[range]}</p>
            <ColumnChart
              points={daily.map((d) => ({ key: d.day, count: d.count }))}
              tickLabel={dayLabel}
              tipLabel={dayLong}
              labelEvery={Math.ceil(daily.length / 7)}
              ariaLabel="Günlük yanıt sayıları"
            />
          </section>

          {reports.map((r, i) => <QuestionCard key={r.question.id} index={i} report={r} total={responses.length} />)}
        </>
      )}
    </div>
  );
}

function QuestionCard({ report: r, index, total }: { report: QuestionReport; index: number; total: number }) {
  const [showAll, setShowAll] = useState(false);
  const skipped = total - r.answered;
  return (
    <section className="card p-5" aria-labelledby={`rapor-${r.question.id}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`rapor-${r.question.id}`} className="font-semibold">{index + 1}. {r.question.title}</h3>
        <p className="text-xs text-slate-500">
          {r.answered} yanıt{skipped > 0 && ` · ${skipped} boş`}{r.kind === "secenek" && r.multi && " · birden fazla seçilebilir"}
        </p>
      </div>

      {r.answered === 0 ? (
        <p className="text-sm text-slate-500">Bu soru bu aralıkta yanıtlanmadı.</p>
      ) : r.kind === "secenek" ? (
        <HBarList items={r.options} />
      ) : r.kind === "puan" ? (
        <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
          <div>
            <p className="text-xs font-medium text-slate-500">Ortalama</p>
            <p className="text-3xl font-bold">{fmt.num(r.average!)}<span className="text-base font-medium text-slate-400"> / {r.max}</span></p>
          </div>
          <ColumnChart points={r.distribution.map((d) => ({ key: d.label, count: d.count }))} height={110} tickLabel={(k) => `${k}★`} tipLabel={(k) => `${k} puan`} ariaLabel="Puan dağılımı" />
        </div>
      ) : r.kind === "nps" ? (
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-[10rem_1fr] sm:items-center">
            <div>
              <p className="text-xs font-medium text-slate-500">NPS skoru</p>
              <p className="text-3xl font-bold">{fmt.signed(r.score!)}</p>
              <p className="text-xs text-slate-500">Ortalama {fmt.num(r.average!)} / 10</p>
            </div>
            <NpsBar detractors={r.detractors} passives={r.passives} promoters={r.promoters} />
          </div>
          <ColumnChart points={r.distribution.map((d) => ({ key: d.label, count: d.count }))} height={110} tickLabel={(k) => k} tipLabel={(k) => `${k} puan`} ariaLabel="0–10 puan dağılımı" />
        </div>
      ) : (
        <div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(showAll ? r.answers : r.answers.slice(0, 5)).map((a, i) => (
              <li key={i} className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="whitespace-pre-line text-sm text-slate-800">{r.question.type === "tarih" ? new Date(`${a.value}T00:00:00`).toLocaleDateString("tr-TR") : a.value}</span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(a.createdAt).toLocaleDateString("tr-TR")}</span>
              </li>
            ))}
          </ul>
          {r.answers.length > 5 && (
            <button className="btn-ghost mt-2 px-2 py-1 text-brand-600" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Daha az göster" : `Tüm ${r.answers.length} yanıtı göster`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
