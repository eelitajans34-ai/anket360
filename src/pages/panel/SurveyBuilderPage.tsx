import { useEffect, useState } from "react";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, LayoutTemplate, ListChecks, Plus, Save, Send, Settings2 } from "lucide-react";
import { QuestionEditor } from "@/components/survey/QuestionEditor";
import { SurveyPreview } from "@/components/survey/SurveyPreview";
import { DEFAULT_SETTINGS, TEMPLATES, newQuestion } from "@/components/survey/templates";
import { StatusBadge } from "@/components/ui/Badge";
import { Alert, Toggle } from "@/components/ui/Field";
import { FullPageSpinner } from "@/components/RouteGuards";
import { useAuth } from "@/lib/auth";
import { QUESTION_TYPES, STATUS_LABEL } from "@/lib/constants";
import { db } from "@/lib/data";
import type { Question, QuestionType, SurveyInput, SurveyStatus } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

type Tab = "sorular" | "onizleme" | "ayarlar";

export default function SurveyBuilderPage() {
  const { id } = useParams();
  const isNew = !id;
  const { user, activeOrg } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [draft, setDraft] = useState<SurveyInput | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("sorular");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(() =>
    (location.state as { saved?: SurveyStatus } | null)?.saved === "yayinda"
      ? { kind: "success", text: "Anket kaydedildi ve yayınlandı." }
      : (location.state as { saved?: SurveyStatus } | null)?.saved
        ? { kind: "success", text: "Anket kaydedildi." }
        : null,
  );

  useEffect(() => {
    if (isNew) {
      setDraft(null);
      setDirty(false);
      return;
    }
    let alive = true;
    setLoading(true);
    db.getSurvey(id).then((s) => {
      if (!alive) return;
      if (!s || s.orgId !== activeOrg?.id) setNotFound(true);
      else setDraft({ title: s.title, description: s.description, status: s.status, questions: s.questions, settings: { ...DEFAULT_SETTINGS, ...s.settings } });
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id, isNew, activeOrg?.id]);

  // Kaydedilmemiş değişiklik uyarısı
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function update(fn: (d: SurveyInput) => SurveyInput) {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
    setMsg(null);
  }
  const setQuestions = (fn: (qs: Question[]) => Question[]) => update((d) => ({ ...d, questions: fn(d.questions) }));

  async function save(status?: SurveyStatus) {
    if (!draft || !user || !activeOrg) return;
    const payload = { ...draft, status: status ?? draft.status };
    setSaving(true);
    setMsg(null);
    try {
      if (isNew) {
        const created = await db.createSurvey(activeOrg.id, user.id, payload);
        setDirty(false);
        setDraft(payload);
        // Engelleyicinin yönlendirmeyi durdurmaması için kirli durumu bir sonraki çizimde temizlenmiş olarak yönlendir
        setTimeout(() => navigate(`/panel/anketler/${created.id}/duzenle`, { replace: true, state: { saved: payload.status } }), 0);
      } else {
        await db.updateSurvey(id, payload);
        setDraft(payload);
        setDirty(false);
      }
      setMsg({ kind: "success", text: status === "yayinda" ? "Anket yayınlandı." : status === "kapali" ? "Anket yanıtlara kapatıldı." : "Değişiklikler kaydedildi." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Kaydedilemedi." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <FullPageSpinner />;
  if (notFound) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-lg font-semibold">Anket bulunamadı</h1>
        <p className="mt-2 text-sm text-slate-500">Bu anket silinmiş ya da başka bir kuruma ait olabilir.</p>
        <Link to="/panel/anketler" className="btn-primary mt-5">Anketlere dön</Link>
      </div>
    );
  }

  if (!draft) return <TemplatePicker onPick={(d) => { setDraft(d); setDirty(true); }} />;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/panel/anketler" className="btn-ghost px-2" aria-label="Anketlere dön"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold">{draft.title || "Adsız anket"}</h1>
              <StatusBadge status={draft.status} />
            </div>
            <p className="text-xs text-slate-500">{isNew ? "Henüz kaydedilmedi" : dirty ? "Kaydedilmemiş değişiklikler var" : "Tüm değişiklikler kaydedildi"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.status === "yayinda" && <button className="btn-secondary" disabled={saving} onClick={() => save("kapali")}>Yanıtlara kapat</button>}
          <button className="btn-secondary" disabled={saving} onClick={() => save()}><Save className="h-4 w-4" />{isNew ? "Taslak olarak kaydet" : "Kaydet"}</button>
          {draft.status !== "yayinda" && <button className="btn-primary" disabled={saving} onClick={() => save("yayinda")}><Send className="h-4 w-4" />Yayınla</button>}
        </div>
      </div>

      {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      <div className="mb-6 flex gap-1 border-b border-slate-200" role="tablist">
        {([["sorular", "Sorular", ListChecks], ["onizleme", "Önizleme", Eye], ["ayarlar", "Ayarlar", Settings2]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium", tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
            <Icon className="h-4 w-4" />{label}
            {k === "sorular" && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{draft.questions.length}</span>}
          </button>
        ))}
      </div>

      {tab === "sorular" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="h-1.5 bg-brand-600" />
              <div className="space-y-3 p-5">
                <input className="w-full border-0 border-b border-transparent p-0 text-2xl font-bold focus:border-brand-500 focus:outline-none focus:ring-0" value={draft.title} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} placeholder="Anket başlığı" aria-label="Anket başlığı" />
                <textarea className="w-full resize-none border-0 p-0 text-sm text-slate-600 focus:outline-none focus:ring-0" rows={2} value={draft.description} onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} placeholder="Katılımcılar için kısa bir açıklama ekleyin" aria-label="Anket açıklaması" />
              </div>
            </div>

            {draft.questions.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                Henüz soru yok. Sağdaki panelden bir soru tipi seçerek başlayın.
              </div>
            )}

            {draft.questions.map((q, i) => (
              <QuestionEditor
                key={q.id}
                question={q}
                index={i}
                total={draft.questions.length}
                onChange={(nq) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? nq : x)))}
                onMove={(dir) => setQuestions((qs) => { const a = [...qs]; [a[i], a[i + dir]] = [a[i + dir]!, a[i]!]; return a; })}
                onDuplicate={() => setQuestions((qs) => [...qs.slice(0, i + 1), { ...structuredClone(q), id: uid() }, ...qs.slice(i + 1)])}
                onDelete={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
              />
            ))}

            <AddQuestionMenu className="lg:hidden" onAdd={(t) => setQuestions((qs) => [...qs, newQuestion(t)])} />
          </div>

          <aside className="hidden lg:block">
            <div className="card sticky top-6 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" />Soru ekle</h2>
              <AddQuestionMenu onAdd={(t) => setQuestions((qs) => [...qs, newQuestion(t)])} vertical />
            </div>
          </aside>
        </div>
      )}

      {tab === "onizleme" && <SurveyPreview key={JSON.stringify(draft.questions.map((q) => q.id))} survey={draft} />}

      {tab === "ayarlar" && (
        <div className="card max-w-2xl divide-y divide-slate-100">
          <div className="p-5"><Toggle label="Anonim anket" description="Katılımcıların kimlik bilgileri kaydedilmez." checked={draft.settings.anonymous} onChange={(v) => update((d) => ({ ...d, settings: { ...d.settings, anonymous: v } }))} /></div>
          <div className="p-5"><Toggle label="Kişi başı tek yanıt" description="Aynı katılımcı anketi yalnızca bir kez yanıtlayabilir." checked={draft.settings.singleResponse} onChange={(v) => update((d) => ({ ...d, settings: { ...d.settings, singleResponse: v } }))} /></div>
          <div className="p-5"><Toggle label="İlerleme çubuğunu göster" checked={draft.settings.showProgress} onChange={(v) => update((d) => ({ ...d, settings: { ...d.settings, showProgress: v } }))} /></div>
          <div className="p-5">
            <label className="label" htmlFor="bitis">Bitiş tarihi (isteğe bağlı)</label>
            <input id="bitis" type="date" className="input w-auto" value={draft.settings.endsAt ?? ""} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, endsAt: e.target.value || undefined } }))} />
          </div>
          <div className="p-5 text-sm text-slate-600">
            Durum: <strong>{STATUS_LABEL[draft.status]}</strong>
            {draft.status !== "taslak" && <button className="btn-ghost ml-2 px-2 py-1 text-xs" onClick={() => update((d) => ({ ...d, status: "taslak" }))}>Taslağa geri al</button>}
          </div>
        </div>
      )}

      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="kaydedilmemis">
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="card relative w-full max-w-sm p-6">
            <h2 id="kaydedilmemis" className="text-lg font-semibold">Kaydedilmemiş değişiklikler</h2>
            <p className="mt-2 text-sm text-slate-600">Sayfadan ayrılırsanız yaptığınız değişiklikler kaybolacak.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => blocker.reset()}>Sayfada kal</button>
              <button className="btn-danger" onClick={() => blocker.proceed()}>Değişiklikleri at</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddQuestionMenu({ onAdd, vertical, className }: { onAdd(t: QuestionType): void; vertical?: boolean; className?: string }) {
  return (
    <div className={cn(vertical ? "space-y-1" : "card grid grid-cols-2 gap-2 p-4 sm:grid-cols-3", className)}>
      {!vertical && <p className="col-span-full text-sm font-semibold">Soru ekle</p>}
      {QUESTION_TYPES.map((t) => (
        <button key={t.type} type="button" onClick={() => onAdd(t.type)} className={cn("w-full rounded-lg text-left hover:bg-brand-50", vertical ? "px-3 py-2" : "border border-slate-200 px-3 py-2")}>
          <span className="block text-sm font-medium text-slate-800">{t.label}</span>
          <span className="block text-xs text-slate-500">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

function TemplatePicker({ onPick }: { onPick(d: SurveyInput): void }) {
  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <Link to="/panel/anketler" className="btn-ghost px-2" aria-label="Anketlere dön"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold">Yeni anket oluştur</h1>
          <p className="text-sm text-slate-600">Boş bir anketle başlayın ya da hazır şablonlardan birini seçin.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TEMPLATES.map((t) => {
          const preview = t.build();
          return (
            <button key={t.id} onClick={() => onPick(t.build())} className="card group flex flex-col p-5 text-left transition hover:border-brand-400 hover:shadow-md">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white">
                {t.id === "bos" ? <Plus className="h-5 w-5" /> : <LayoutTemplate className="h-5 w-5" />}
              </span>
              <span className="font-semibold">{t.name}</span>
              <span className="mt-1 flex-1 text-sm text-slate-500">{t.description}</span>
              <span className="mt-4 text-xs font-medium text-slate-400">{preview.questions.length} soru</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
