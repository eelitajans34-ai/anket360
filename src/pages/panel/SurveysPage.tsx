import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Copy, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "./PanelLayout";
import { StatusBadge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/constants";
import { db } from "@/lib/data";
import type { Survey, SurveyStatus } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, formatDate } from "@/lib/utils";

type Filter = "hepsi" | SurveyStatus;

export default function SurveysPage() {
  const { user, activeOrg } = useAuth();
  const navigate = useNavigate();
  const { data: surveys = [], loading, reload } = useAsync(() => (activeOrg ? db.listSurveys(activeOrg.id) : Promise.resolve([])), [activeOrg?.id]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("hepsi");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Survey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canDelete = activeOrg?.role === "sahip" || activeOrg?.role === "yonetici";

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return surveys.filter((s) => (filter === "hepsi" || s.status === filter) && (!q || s.title.toLocaleLowerCase("tr-TR").includes(q)));
  }, [surveys, query, filter]);

  async function duplicate(s: Survey) {
    setMenuFor(null);
    if (!user) return;
    try {
      const copy = await db.duplicateSurvey(s.id, user.id);
      navigate(`/panel/anketler/${copy.id}/duzenle`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kopyalanamadı.");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await db.deleteSurvey(toDelete.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi.");
    }
    setToDelete(null);
    await reload();
  }

  const filters: Filter[] = ["hepsi", "yayinda", "taslak", "kapali"];

  return (
    <>
      <PageHeader title="Anketler" description="Kurumunuzun tüm anketlerini buradan yönetin." actions={<Link to="/panel/anketler/yeni" className="btn-primary"><Plus className="h-4 w-4" />Yeni anket</Link>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Anket ara…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Anket ara" />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Durum filtresi">
          {filters.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium", filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {f === "hepsi" ? "Tümü" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-visible">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Yükleniyor…</p>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-medium">{surveys.length ? "Aramanızla eşleşen anket yok" : "Henüz anket oluşturmadınız"}</p>
            {!surveys.length && <Link to="/panel/anketler/yeni" className="btn-primary mt-5"><Plus className="h-4 w-4" />İlk anketi oluştur</Link>}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/panel/anketler/${s.id}/duzenle`} className="block truncate font-medium hover:text-brand-700">{s.title}</Link>
                  <p className="mt-0.5 text-xs text-slate-500">{s.questions.length} soru · Oluşturma: {formatDate(s.createdAt)} · Güncelleme: {formatDate(s.updatedAt)}</p>
                </div>
                <StatusBadge status={s.status} />
                <div className="relative">
                  <button className="btn-ghost px-2" onClick={() => setMenuFor(menuFor === s.id ? null : s.id)} aria-label={`${s.title} işlemleri`} aria-expanded={menuFor === s.id}>
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuFor === s.id && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" role="menu">
                      <Link role="menuitem" to={`/panel/anketler/${s.id}/duzenle`} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-50"><Pencil className="h-4 w-4" />Düzenle</Link>
                      <button role="menuitem" onClick={() => duplicate(s)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-50"><Copy className="h-4 w-4" />Kopyala</button>
                      {canDelete && <button role="menuitem" onClick={() => { setMenuFor(null); setToDelete(s); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Sil</button>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="sil-baslik">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setToDelete(null)} />
          <div className="card relative w-full max-w-sm p-6">
            <h2 id="sil-baslik" className="text-lg font-semibold">Anketi sil</h2>
            <p className="mt-2 text-sm text-slate-600"><strong>{toDelete.title}</strong> anketi ve tüm yanıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setToDelete(null)}>Vazgeç</button>
              <button className="btn-danger" onClick={confirmDelete}>Evet, sil</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
