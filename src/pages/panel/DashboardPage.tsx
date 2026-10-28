import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardList, FileEdit, MessageSquare, Plus, Radio } from "lucide-react";
import { PageHeader } from "./PanelLayout";
import { StatusBadge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { useAsync } from "@/lib/use-async";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { user, activeOrg } = useAuth();
  const { data, loading } = useAsync(async () => {
    if (!activeOrg) return null;
    const [surveys, members] = await Promise.all([db.listSurveys(activeOrg.id), db.listMembers(activeOrg.id)]);
    const responseCounts = await Promise.all(surveys.map((s) => db.listResponses(s.id).then((r) => r.length)));
    return { surveys, members, totalResponses: responseCounts.reduce((a, b) => a + b, 0) };
  }, [activeOrg?.id]);

  const surveys = data?.surveys ?? [];
  const stats = [
    { label: "Toplam anket", value: surveys.length, icon: ClipboardList, tone: "bg-brand-50 text-brand-600" },
    { label: "Yayında", value: surveys.filter((s) => s.status === "yayinda").length, icon: Radio, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Taslak", value: surveys.filter((s) => s.status === "taslak").length, icon: FileEdit, tone: "bg-amber-50 text-amber-600" },
    { label: "Toplam yanıt", value: data?.totalResponses ?? 0, icon: MessageSquare, tone: "bg-violet-50 text-violet-600" },
  ];

  const onboarding = [
    { done: true, label: "Hesap oluştur" },
    { done: !!activeOrg, label: "Kurum bilgilerini gir" },
    { done: surveys.length > 0, label: "İlk anketini oluştur", to: "/panel/anketler/yeni" },
    { done: surveys.some((s) => s.status === "yayinda"), label: "Bir anketi yayınla", to: "/panel/anketler" },
    { done: (data?.members.length ?? 0) > 1, label: "Ekip arkadaşı ekle", to: "/panel/kurum" },
  ];
  const doneCount = onboarding.filter((o) => o.done).length;

  return (
    <>
      <PageHeader
        title={`Merhaba, ${user?.fullName.split(" ")[0] ?? ""} 👋`}
        description={`${activeOrg?.name} kurumunun genel görünümü`}
        actions={<Link to="/panel/anketler/yeni" className="btn-primary"><Plus className="h-4 w-4" />Yeni anket</Link>}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Özet">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-5">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
            <p className="text-2xl font-bold">{loading ? "–" : value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Son anketler</h2>
            <Link to="/panel/anketler" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">Tümü <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {!loading && surveys.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium">Henüz anketiniz yok</p>
              <p className="mt-1 text-sm text-slate-500">İlk anketinizi oluşturarak geri bildirim toplamaya başlayın.</p>
              <Link to="/panel/anketler/yeni" className="btn-primary mt-5"><Plus className="h-4 w-4" />Anket oluştur</Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {surveys.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link to={`/panel/anketler/${s.id}/duzenle`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.title}</p>
                      <p className="text-xs text-slate-500">{s.questions.length} soru · {formatDate(s.updatedAt)} tarihinde güncellendi</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Başlangıç adımları</h2>
          <p className="mt-1 text-sm text-slate-500">{doneCount}/{onboarding.length} tamamlandı</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / onboarding.length) * 100}%` }} />
          </div>
          <ul className="mt-5 space-y-3">
            {onboarding.map((o) => (
              <li key={o.label} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className={o.done ? "h-5 w-5 text-emerald-500" : "h-5 w-5 text-slate-300"} />
                {!o.done && o.to ? <Link to={o.to} className="font-medium text-brand-600 hover:underline">{o.label}</Link> : <span className={o.done ? "text-slate-500 line-through" : ""}>{o.label}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
