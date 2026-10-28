import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { QUESTION_TYPES, questionTypeMeta } from "@/lib/constants";
import type { Question, QuestionType } from "@/lib/types";
import { changeQuestionType } from "./templates";
import { Toggle } from "@/components/ui/Field";

interface Props {
  question: Question;
  index: number;
  total: number;
  onChange(q: Question): void;
  onMove(dir: -1 | 1): void;
  onDuplicate(): void;
  onDelete(): void;
}

export function QuestionEditor({ question: q, index, total, onChange, onMove, onDuplicate, onDelete }: Props) {
  const meta = questionTypeMeta(q.type);
  const patch = (p: Partial<Question>) => onChange({ ...q, ...p });
  const setOption = (i: number, v: string) => patch({ options: q.options!.map((o, j) => (j === i ? v : o)) });

  return (
    <article className="card p-5" aria-label={`Soru ${index + 1}`}>
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
        <span className="text-sm font-semibold text-brand-600">Soru {index + 1}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn label="Yukarı taşı" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Aşağı taşı" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconBtn>
          <IconBtn label="Soruyu çoğalt" onClick={onDuplicate}><Copy className="h-4 w-4" /></IconBtn>
          <IconBtn label="Soruyu sil" onClick={onDelete} danger><Trash2 className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <input className="input font-medium" placeholder="Soru metnini yazın" value={q.title} onChange={(e) => patch({ title: e.target.value })} aria-label={`Soru ${index + 1} metni`} />
        <select className="input" value={q.type} onChange={(e) => onChange(changeQuestionType(q, e.target.value as QuestionType))} aria-label={`Soru ${index + 1} tipi`}>
          {QUESTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </div>
      <input className="input mt-3 text-slate-600" placeholder="Açıklama (isteğe bağlı)" value={q.description ?? ""} onChange={(e) => patch({ description: e.target.value || undefined })} aria-label={`Soru ${index + 1} açıklaması`} />

      {meta.hasOptions && (
        <div className="mt-4 space-y-2">
          {q.options!.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`h-4 w-4 shrink-0 border border-slate-300 ${q.type === "coklu_secim" ? "rounded" : "rounded-full"}`} aria-hidden />
              <input className="input py-2" value={o} onChange={(e) => setOption(i, e.target.value)} aria-label={`Seçenek ${i + 1}`} />
              <IconBtn label={`Seçenek ${i + 1} sil`} disabled={q.options!.length <= 2} onClick={() => patch({ options: q.options!.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></IconBtn>
            </div>
          ))}
          <button type="button" className="btn-ghost px-2 py-1.5 text-brand-600" onClick={() => patch({ options: [...q.options!, `Seçenek ${q.options!.length + 1}`] })}>
            <Plus className="h-4 w-4" />Seçenek ekle
          </button>
        </div>
      )}

      {q.type === "derecelendirme" && (
        <label className="mt-4 flex items-center gap-3 text-sm text-slate-600">
          En yüksek puan
          <select className="input w-24 py-1.5" value={q.scaleMax ?? 5} onChange={(e) => patch({ scaleMax: Number(e.target.value) })}>
            {[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <Toggle label="Zorunlu soru" checked={q.required} onChange={(v) => patch({ required: v })} />
      </div>
    </article>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick(): void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={`rounded-md p-1.5 disabled:opacity-30 ${danger ? "text-slate-400 hover:bg-red-50 hover:text-red-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
