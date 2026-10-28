import { useState } from "react";
import { Star } from "lucide-react";
import { Alert } from "@/components/ui/Field";
import { isAnswered, missingRequired } from "@/lib/answers";
import type { Answers, AnswerValue, Question, SurveyInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type FormSurvey = Pick<SurveyInput, "title" | "description" | "questions" | "settings">;

interface SurveyFormProps {
  survey: FormSurvey;
  /** Kurum adı (katılımcı sayfasında başlığın üstünde gösterilir) */
  orgName?: string;
  /** Verilmezse önizleme modunda çalışır: hiçbir şey kaydedilmez. */
  onSubmit?(answers: Answers): Promise<void>;
}

/** Katılımcının gördüğü anket formu; panelde önizleme, /a/:id sayfasında gerçek yanıt için kullanılır. */
export function SurveyForm({ survey, orgName, onSubmit }: SurveyFormProps) {
  const preview = !onSubmit;
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (id: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    setMissing((m) => m.filter((x) => x !== id));
  };

  const answered = survey.questions.filter((q) => isAnswered(answers[q.id])).length;

  async function submit() {
    setError(null);
    const m = missingRequired(survey.questions, answers);
    setMissing(m);
    if (m.length) {
      document.getElementById(`soru-${m[0]}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    if (!onSubmit) return setSubmitted(true);
    setBusy(true);
    try {
      await onSubmit(answers);
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yanıtınız gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="card mx-auto max-w-2xl p-10 text-center" role="status">
        <p className="text-4xl">🎉</p>
        <h2 className="mt-3 text-xl font-semibold">Teşekkürler!</h2>
        <p className="mt-2 text-sm text-slate-600">
          {preview ? "Önizleme — gerçek yanıt kaydedilmedi." : "Yanıtlarınız kaydedildi. Katılımınız için teşekkür ederiz."}
        </p>
        {preview && <button className="btn-secondary mt-6" onClick={() => { setSubmitted(false); setAnswers({}); }}>Önizlemeyi sıfırla</button>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card overflow-hidden">
        <div className="h-2 bg-brand-600" />
        <div className="p-6">
          {orgName && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">{orgName}</p>}
          <h1 className="text-2xl font-bold">{survey.title || "Adsız anket"}</h1>
          {survey.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{survey.description}</p>}
          {survey.settings.anonymous && <p className="mt-3 text-xs font-medium text-emerald-700">🔒 Bu anket anonimdir; kimlik bilgileriniz kaydedilmez.</p>}
          {survey.questions.some((q) => q.required) && <p className="mt-3 text-xs text-slate-500"><span className="text-red-500">*</span> işaretli sorular zorunludur.</p>}
        </div>
      </div>
      {survey.settings.showProgress && survey.questions.length > 0 && (
        <div className="card sticky top-2 z-10 px-5 py-3">
          <div className="flex justify-between text-xs text-slate-500"><span>İlerleme</span><span>{answered}/{survey.questions.length}</span></div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-600 transition-all" style={{ width: `${(answered / survey.questions.length) * 100}%` }} /></div>
        </div>
      )}
      {survey.questions.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">Önizlemek için soru ekleyin.</p>}
      {survey.questions.map((q, i) => (
        <fieldset id={`soru-${q.id}`} key={q.id} className={cn("card scroll-mt-24 p-6", missing.includes(q.id) && "border-red-300 ring-1 ring-red-300")}>
          <legend className="sr-only">{q.title}</legend>
          <p className="font-medium">
            {i + 1}. {q.title || <span className="text-slate-400">(Soru metni yok)</span>}
            {q.required && <span className="text-red-500"> *</span>}
          </p>
          {q.description && <p className="mt-1 text-sm text-slate-500">{q.description}</p>}
          <div className="mt-4"><QuestionInput q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} /></div>
          {missing.includes(q.id) && <p className="mt-2 text-xs text-red-600">Bu soru zorunludur.</p>}
        </fieldset>
      ))}
      {error && <Alert>{error}</Alert>}
      {missing.length > 0 && <Alert>Lütfen {missing.length} zorunlu soruyu yanıtlayın.</Alert>}
      {survey.questions.length > 0 && (
        <div className="flex justify-end">
          <button className="btn-primary px-8" onClick={submit} disabled={busy}>{busy ? "Gönderiliyor…" : "Gönder"}</button>
        </div>
      )}
    </div>
  );
}

/** Panel önizlemesi için geriye dönük uyumlu ad. */
export function SurveyPreview({ survey }: { survey: FormSurvey }) {
  return <SurveyForm survey={survey} />;
}

function QuestionInput({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange(v: AnswerValue): void }) {
  const name = `q-${q.id}`;
  switch (q.type) {
    case "kisa_metin":
      return <input className="input" placeholder="Yanıtınız" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "uzun_metin":
      return <textarea className="input min-h-[100px]" placeholder="Yanıtınız" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "tarih":
      return <input type="date" className="input w-auto" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "tek_secim":
    case "evet_hayir": {
      const opts = q.type === "evet_hayir" ? ["Evet", "Hayır"] : q.options ?? [];
      return (
        <div className="space-y-2">
          {opts.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} className="text-brand-600" />{o}
            </label>
          ))}
        </div>
      );
    }
    case "coklu_secim": {
      const arr = (value as string[]) ?? [];
      return (
        <div className="space-y-2">
          {(q.options ?? []).map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} className="rounded text-brand-600" />{o}
            </label>
          ))}
        </div>
      );
    }
    case "acilir_liste":
      return (
        <select className="input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seçin</option>
          {(q.options ?? []).map((o) => <option key={o}>{o}</option>)}
        </select>
      );
    case "derecelendirme": {
      const max = q.scaleMax ?? 5;
      return (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Puan">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} puan`} onClick={() => onChange(n)} className="p-1">
              <Star className={cn("h-8 w-8", typeof value === "number" && n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
            </button>
          ))}
        </div>
      );
    }
    case "nps":
      return (
        <div>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-label="0-10 arası puan">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={cn("h-10 rounded-md border text-sm font-medium", value === n ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 hover:bg-slate-50")}>{n}</button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Hiç olası değil</span><span>Kesinlikle</span></div>
        </div>
      );
  }
}
