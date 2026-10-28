import { ArrowDown, ArrowUp, Copy, GitBranch, GripVertical, Plus, Trash2, X } from "lucide-react";
import { OPERATOR_LABEL, needsValue, operatorsFor, valueChoices } from "@/lib/conditions";
import { QUESTION_TYPES, questionTypeMeta } from "@/lib/constants";
import type { ConditionOperator, Question, QuestionCondition, QuestionType } from "@/lib/types";
import { changeQuestionType } from "./templates";
import { Toggle } from "@/components/ui/Field";
import { BenchmarkHint } from "./BenchmarkHint";

interface Props {
  question: Question;
  index: number;
  total: number;
  /** Bu sorudan önceki sorular (koşul yalnızca bunlara bağlanabilir) */
  previous: Question[];
  /** Koşul doğrulama hatası */
  conditionError?: string | null;
  onChange(q: Question): void;
  onMove(dir: -1 | 1): void;
  onDuplicate(): void;
  onDelete(): void;
}

export function QuestionEditor({ question: q, index, total, previous, conditionError, onChange, onMove, onDuplicate, onDelete }: Props) {
  const meta = questionTypeMeta(q.type);
  const patch = (p: Partial<Question>) => onChange({ ...q, ...p });
  const setOption = (i: number, v: string) => patch({ options: q.options!.map((o, j) => (j === i ? v : o)) });

  return (
    <article className="card p-5" aria-label={`Soru ${index + 1}`}>
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
        <span className="text-sm font-semibold text-brand-600">Soru {index + 1}</span>
        {q.showIf && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"><GitBranch className="h-3 w-3" />Koşullu</span>}
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
      {q.statKey && <BenchmarkHint question={q} />}
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

      <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
        <Toggle label="Zorunlu soru" checked={q.required} onChange={(v) => patch({ required: v })} />
        <ConditionEditor index={index} condition={q.showIf} previous={previous} error={conditionError} onChange={(c) => patch({ showIf: c })} />
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

function defaultCondition(src: Question): QuestionCondition {
  const operator = operatorsFor(src.type)[0]!;
  return { questionId: src.id, operator, value: needsValue(operator) ? valueChoices(src)[0] : undefined };
}

/** "Bu soruyu yalnızca … ise göster" düzenleyicisi */
function ConditionEditor({
  index,
  condition,
  previous,
  error,
  onChange,
}: {
  index: number;
  condition?: QuestionCondition;
  previous: Question[];
  error?: string | null;
  onChange(c: QuestionCondition | undefined): void;
}) {
  const n = index + 1;
  if (!condition) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Koşullu gösterim</p>
          <p className="text-xs text-slate-500">{previous.length ? "Bu soruyu yalnızca önceki bir yanıta göre gösterin." : "İlk soru koşula bağlanamaz."}</p>
        </div>
        <button type="button" className="btn-secondary shrink-0 px-3 py-1.5 text-xs" disabled={!previous.length} onClick={() => onChange(defaultCondition(previous[previous.length - 1]!))}>
          <GitBranch className="h-4 w-4" />Koşul ekle
        </button>
      </div>
    );
  }

  const src = previous.find((p) => p.id === condition.questionId);
  const ops = src ? operatorsFor(src.type) : [];
  const choices = src ? valueChoices(src) : [];
  return (
    <fieldset className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
      <legend className="sr-only">Soru {n} koşulu</legend>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-violet-900">Bu soruyu yalnızca şu durumda göster:</p>
        <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-red-600" aria-label={`Soru ${n} koşulunu kaldır`} onClick={() => onChange(undefined)}><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          className="input py-2"
          aria-label={`Soru ${n} koşulunun bağlı olduğu soru`}
          value={src ? condition.questionId : ""}
          onChange={(e) => onChange(defaultCondition(previous.find((p) => p.id === e.target.value)!))}
        >
          {!src && <option value="">(soru bulunamadı)</option>}
          {previous.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.title || "(başlıksız soru)"}</option>)}
        </select>
        <select
          className="input py-2"
          aria-label={`Soru ${n} koşul türü`}
          value={condition.operator}
          onChange={(e) => {
            const operator = e.target.value as ConditionOperator;
            onChange({ ...condition, operator, value: needsValue(operator) ? (condition.value ?? choices[0]) : undefined });
          }}
        >
          {ops.map((o) => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
        </select>
        {needsValue(condition.operator) && (
          <select
            className="input py-2"
            aria-label={`Soru ${n} koşul değeri`}
            value={condition.value === undefined ? "" : String(condition.value)}
            onChange={(e) => onChange({ ...condition, value: typeof choices[0] === "number" ? Number(e.target.value) : e.target.value })}
          >
            {!choices.map(String).includes(String(condition.value)) && <option value={String(condition.value ?? "")}>{String(condition.value ?? "Seçin")}</option>}
            {choices.map((c) => <option key={String(c)} value={String(c)}>{String(c)}</option>)}
          </select>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
    </fieldset>
  );
}
