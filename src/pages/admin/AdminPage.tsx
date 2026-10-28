import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, CreditCard, Landmark, LayoutDashboard, LogOut, Package, Search, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Alert, TextField } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/Badge";
import { categoryById, suggestedCategory } from "@/components/survey/categories";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { ORG_STATUS_LABEL, ORG_STATUS_STYLE, formatIban, formatTL, isExpired, isValidIban } from "@/lib/platform";
import type { AccountStatus, AdminOrganization, AdminUser, OrgStatus, Payment, PaymentSettings, Plan } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, formatDate } from "@/lib/utils";

type Tab = "ozet" | "kurumlar" | "kullanicilar" | "odemeler" | "paketler" | "banka";
type Msg = { kind: "error" | "success"; text: string } | null;

const TABS: Array<[Tab, string, typeof Building2]> = [
  ["ozet", "Genel Bakış", LayoutDashboard],
  ["kurumlar", "Kurumlar", Building2],
  ["kullanicilar", "Kullanıcılar", Users],
  ["odemeler", "Ödemeler", CreditCard],
  ["paketler", "Paketler", Package],
  ["banka", "Ödeme Bilgileri", Landmark],
];

const USER_STATUS: Record<AccountStatus, { label: string; style: string }> = {
  aktif: { label: "Aktif", style: "bg-emerald-50 text-emerald-700" },
  donduruldu: { label: "Donduruldu", style: "bg-sky-50 text-sky-700" },
  engellendi: { label: "Engellendi", style: "bg-red-50 text-red-700" },
};

/** Platform (süper) yönetici paneli: /yonetim */
export default function AdminPage() {
  const { user, organizations, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("ozet");
  const [msg, setMsg] = useState<Msg>(null);
  const orgs = useAsync(() => db.adminListOrganizations(), []);
  const users = useAsync(() => db.adminListUsers(), []);
  const payments = useAsync(() => db.listPayments(), []);
  const plans = useAsync(() => db.listPlans(), []);

  async function run(fn: () => Promise<void>, success: string, reload: Array<{ reload(): Promise<void> }>) {
    setMsg(null);
    try {
      await fn();
      await Promise.all(reload.map((r) => r.reload()));
      setMsg({ kind: "success", text: success });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "İşlem tamamlanamadı." });
    }
  }

  const pendingCount = payments.data?.filter((p) => p.status === "beklemede").length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" />Süper Yönetici</span>
          </div>
          <div className="flex items-center gap-2">
            {organizations.length > 0 && <Link to="/panel" className="btn-ghost text-sm">Kurum paneline dön</Link>}
            <span className="hidden text-sm text-slate-500 md:inline">{user?.email}</span>
            <button className="btn-ghost px-2" onClick={() => signOut().then(() => navigate("/"))} aria-label="Çıkış yap"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4" role="tablist" aria-label="Yönetim sekmeleri">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }}
              className={cn("-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", tab === k ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500 hover:text-slate-800")}>
              <Icon className="h-4 w-4" />{label}
              {k === "odemeler" && pendingCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{pendingCount}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        {tab === "ozet" && <Overview orgs={orgs.data ?? []} users={users.data ?? []} payments={payments.data ?? []} onGo={setTab} />}
        {tab === "kurumlar" && <Organizations orgs={orgs.data ?? []} plans={plans.data ?? []} loading={orgs.loading}
          onUpdate={(id, patch, text) => run(() => db.adminUpdateOrganization(id, patch), text, [orgs])}
          onDelete={(o) => run(() => db.adminDeleteOrganization(o.id), `${o.name} silindi.`, [orgs, users, payments])} />}
        {tab === "kullanicilar" && <UsersTab users={users.data ?? []} loading={users.loading} me={user!.id}
          onStatus={(u, s) => run(() => db.adminSetUserStatus(u.id, s), `${u.email}: ${USER_STATUS[s].label}`, [users])}
          onDelete={(u) => run(() => db.adminDeleteUser(u.id), `${u.email} silindi.`, [users, orgs, payments])} />}
        {tab === "odemeler" && <Payments payments={payments.data ?? []} orgs={orgs.data ?? []} plans={plans.data ?? []}
          onDecide={(p, ok, note) => run(() => db.adminDecidePayment(p.id, ok, note), ok ? `Ödeme onaylandı (${p.reference}); kurumun süresi uzatıldı.` : `Ödeme reddedildi (${p.reference}).`, [payments, orgs])} />}
        {tab === "paketler" && <Plans plans={plans.data ?? []} onSave={(p) => run(() => db.adminUpdatePlan(p), `${p.name} paketi kaydedildi.`, [plans])} />}
        {tab === "banka" && <BankSettings onSaved={(t) => setMsg(t)} />}
      </main>
    </div>
  );
}

function Stat({ label, value, hint, onClick }: { label: string; value: ReactNode; hint?: string; onClick?(): void }) {
  return (
    <button onClick={onClick} className="card p-4 text-left transition hover:border-violet-300" disabled={!onClick}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </button>
  );
}

function Overview({ orgs, users, payments, onGo }: { orgs: AdminOrganization[]; users: AdminUser[]; payments: Payment[]; onGo(t: Tab): void }) {
  const approved = payments.filter((p) => p.status === "onaylandi");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonth = approved.filter((p) => new Date(p.decidedAt ?? p.createdAt) >= monthStart).reduce((a, p) => a + p.amount, 0);
  const byCategory = new Map<string, number>();
  for (const o of orgs) {
    const c = categoryById(suggestedCategory(o.sector))?.name ?? "Genel";
    byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Kurum" value={orgs.length} hint={`${orgs.filter((o) => o.status === "aktif" && !isExpired(o)).length} aktif`} onClick={() => onGo("kurumlar")} />
        <Stat label="Kullanıcı" value={users.length} hint={`${users.filter((u) => u.status !== "aktif").length} kısıtlı`} onClick={() => onGo("kullanicilar")} />
        <Stat label="Bekleyen ödeme" value={payments.filter((p) => p.status === "beklemede").length} onClick={() => onGo("odemeler")} />
        <Stat label="Bu ay onaylanan" value={formatTL(thisMonth)} hint={`${approved.length} ödeme (toplam)`} />
      </div>
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Kurumlar — alanlara göre</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[...byCategory].map(([k, v]) => <li key={k} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-semibold">{v}</span> {k}</li>)}
          {byCategory.size === 0 && <li className="text-sm text-slate-500">Henüz kurum yok.</li>}
        </ul>
      </section>
    </div>
  );
}

function OrgStatusBadge({ o }: { o: AdminOrganization }) {
  const expired = o.status === "aktif" && isExpired(o);
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", expired ? "bg-amber-50 text-amber-700 ring-amber-600/20" : ORG_STATUS_STYLE[o.status])}>
      {expired ? "Süresi doldu" : ORG_STATUS_LABEL[o.status]}
    </span>
  );
}

function Organizations({ orgs, plans, loading, onUpdate, onDelete }: {
  orgs: AdminOrganization[]; plans: Plan[]; loading: boolean;
  onUpdate(id: string, patch: { status?: OrgStatus; planId?: string; endsAt?: string | null; adminNote?: string }, text: string): Promise<void>;
  onDelete(o: AdminOrganization): Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr-TR");
    return orgs.filter((o) => !s || `${o.name} ${o.ownerEmail} ${o.city} ${o.sector}`.toLocaleLowerCase("tr-TR").includes(s));
  }, [orgs, q]);
  if (loading) return <p className="text-sm text-slate-500">Yükleniyor…</p>;
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder="Kurum, e-posta, şehir ara…" />
      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Kurum bulunamadı.</p>}
        {filtered.map((o) => (
          <div key={o.id}>
            <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.name}</span>
                <span className="block truncate text-xs text-slate-500">{categoryById(suggestedCategory(o.sector))?.emoji} {o.sector} · {o.city} · {o.ownerEmail}</span>
              </span>
              <span className="text-xs text-slate-600">{plans.find((p) => p.id === o.planId)?.name ?? o.planId}{o.endsAt && ` · ${formatDate(o.endsAt)}`}</span>
              <span className="text-xs text-slate-500">{o.surveyCount} anket · {o.memberCount} üye</span>
              <OrgStatusBadge o={o} />
            </button>
            {open === o.id && <OrgDetail o={o} plans={plans} onUpdate={onUpdate} onDelete={onDelete} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgDetail({ o, plans, onUpdate, onDelete }: {
  o: AdminOrganization; plans: Plan[];
  onUpdate(id: string, patch: { status?: OrgStatus; planId?: string; endsAt?: string | null; adminNote?: string }, text: string): Promise<void>;
  onDelete(o: AdminOrganization): Promise<void>;
}) {
  const surveys = useAsync(() => db.listSurveys(o.id), [o.id]);
  const [note, setNote] = useState(o.adminNote ?? "");
  const [endDate, setEndDate] = useState(o.endsAt ? o.endsAt.slice(0, 10) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const extend = (days: number) => {
    const base = Math.max(Date.now(), o.endsAt ? new Date(o.endsAt).getTime() : 0);
    return onUpdate(o.id, { endsAt: new Date(base + days * 86_400_000).toISOString() }, `${o.name}: süre ${days} gün uzatıldı.`);
  };
  const statusBtn = (s: OrgStatus, label: string, cls = "btn-secondary") => (
    <button className={cn(cls, "px-3 py-1.5 text-xs")} disabled={o.status === s} onClick={() => onUpdate(o.id, { status: s }, `${o.name}: ${ORG_STATUS_LABEL[s]}`)}>{label}</button>
  );
  return (
    <div className="grid gap-5 bg-slate-50/60 px-4 py-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Durum</p>
          <div className="flex flex-wrap gap-2">
            {statusBtn("aktif", "Aktif yap")}
            {statusBtn("pasif", "Pasif yap")}
            {statusBtn("donduruldu", "Dondur")}
            {statusBtn("engellendi", "Engelle", "btn-danger")}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Paket ve süre</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto py-1.5 text-sm" value={o.planId} aria-label={`${o.name} paketi`}
              onChange={(e) => onUpdate(o.id, { planId: e.target.value }, `${o.name}: paket ${plans.find((p) => p.id === e.target.value)?.name}`)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {[30, 90, 365].map((d) => <button key={d} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => extend(d)}>+{d} gün</button>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="date" className="input w-auto py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label={`${o.name} bitiş tarihi`} />
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onUpdate(o.id, { endsAt: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null }, `${o.name}: bitiş tarihi ${endDate ? formatDate(endDate) : "kaldırıldı"}`)}>Tarihi kaydet</button>
            <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => { setEndDate(""); onUpdate(o.id, { endsAt: null }, `${o.name}: süresiz yapıldı`); }}>Süresiz yap</button>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`not-${o.id}`}>Yönetici notu (kuruma görünmez)</label>
          <div className="flex gap-2">
            <input id={`not-${o.id}`} className="input py-1.5 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onUpdate(o.id, { adminNote: note }, "Not kaydedildi.")}>Kaydet</button>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-3">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-red-700">{o.name} ve tüm anket/yanıtları kalıcı olarak silinsin mi?</span>
              <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => onDelete(o)}>Evet, sil</button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>Vazgeç</button>
            </div>
          ) : (
            <button className="btn-ghost px-2 py-1.5 text-xs text-red-600" onClick={() => setConfirmDelete(true)}>Kurumu sil</button>
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Anketler</p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {(surveys.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{s.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusBadge status={s.status} />
                <Link className="text-xs font-medium text-violet-700 hover:underline" to={`/panel/anketler/${s.id}/duzenle`}>Düzenle</Link>
              </span>
            </li>
          ))}
          {surveys.data?.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Anket yok.</li>}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Kayıt: {formatDate(o.createdAt)} · Sahip: {o.ownerName} ({o.ownerEmail})</p>
      </div>
    </div>
  );
}

function UsersTab({ users, loading, me, onStatus, onDelete }: {
  users: AdminUser[]; loading: boolean; me: string; onStatus(u: AdminUser, s: AccountStatus): Promise<void>; onDelete(u: AdminUser): Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const filtered = users.filter((u) => `${u.fullName} ${u.email} ${u.organizations.map((o) => o.name).join(" ")}`.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));
  if (loading) return <p className="text-sm text-slate-500">Yükleniyor…</p>;
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder="Ad, e-posta, kurum ara…" />
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr><th className="px-4 py-2.5">Kullanıcı</th><th className="px-4 py-2.5">Kurumlar</th><th className="px-4 py-2.5">Kayıt</th><th className="px-4 py-2.5">Durum</th><th className="px-4 py-2.5 text-right">İşlemler</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-4 py-2.5"><p className="font-medium">{u.fullName || "—"}{u.isSuperAdmin && <span className="ml-1 text-xs text-violet-700">(süper yönetici)</span>}</p><p className="text-xs text-slate-500">{u.email}{u.phone && ` · ${u.phone}`}</p></td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{u.organizations.map((o) => `${o.name} (${o.role})`).join(", ") || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", USER_STATUS[u.status].style)}>{USER_STATUS[u.status].label}</span></td>
                <td className="px-4 py-2.5">
                  {u.id === me || u.isSuperAdmin ? <span className="block text-right text-xs text-slate-400">—</span> : confirm === u.id ? (
                    <div className="flex justify-end gap-1">
                      <button className="btn-danger px-2 py-1 text-xs" onClick={() => onDelete(u)}>Kalıcı sil</button>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirm(null)}>Vazgeç</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1">
                      {u.status !== "aktif" && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => onStatus(u, "aktif")}>Aktif yap</button>}
                      {u.status !== "donduruldu" && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => onStatus(u, "donduruldu")}>Dondur</button>}
                      {u.status !== "engellendi" && <button className="btn-secondary px-2 py-1 text-xs text-red-700" onClick={() => onStatus(u, "engellendi")}>Engelle</button>}
                      <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => setConfirm(u.id)}>Sil</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Payments({ payments, orgs, plans, onDecide }: { payments: Payment[]; orgs: AdminOrganization[]; plans: Plan[]; onDecide(p: Payment, ok: boolean, note: string): Promise<void> }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const sorted = [...payments].sort((a, b) => Number(b.status === "beklemede") - Number(a.status === "beklemede") || b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="card overflow-x-auto">
      {sorted.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">Henüz ödeme bildirimi yok.</p> : (
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr><th className="px-4 py-2.5">Tarih</th><th className="px-4 py-2.5">Kurum</th><th className="px-4 py-2.5">Paket</th><th className="px-4 py-2.5">Tutar</th><th className="px-4 py-2.5">Kod / not</th><th className="px-4 py-2.5 text-right">Durum</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((p) => (
              <tr key={p.id} className={cn("align-top", p.status === "beklemede" && "bg-amber-50/40")}>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs">{new Date(p.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-4 py-2.5">{orgs.find((o) => o.id === p.orgId)?.name ?? "—"}</td>
                <td className="px-4 py-2.5">{plans.find((x) => x.id === p.planId)?.name ?? p.planId}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">{formatTL(p.amount)}</td>
                <td className="px-4 py-2.5"><span className="font-mono">{p.reference}</span>{p.note && <p className="text-xs text-slate-500">{p.note}</p>}</td>
                <td className="px-4 py-2.5 text-right">
                  {p.status === "beklemede" ? (
                    <div className="flex flex-col items-end gap-1">
                      <input className="input w-48 py-1 text-xs" placeholder="Not (isteğe bağlı)" value={notes[p.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} aria-label={`${p.reference} notu`} />
                      <div className="flex gap-1">
                        <button className="btn-primary px-2 py-1 text-xs" onClick={() => onDecide(p, true, notes[p.id] ?? "")}>Onayla</button>
                        <button className="btn-secondary px-2 py-1 text-xs text-red-700" onClick={() => onDecide(p, false, notes[p.id] ?? "")}>Reddet</button>
                      </div>
                    </div>
                  ) : (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", p.status === "onaylandi" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{p.status === "onaylandi" ? "Onaylandı" : "Reddedildi"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Plans({ plans, onSave }: { plans: Plan[]; onSave(p: Plan): Promise<void> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((p) => <PlanEditor key={`${p.id}-${p.price}-${p.name}`} plan={p} onSave={onSave} />)}
    </div>
  );
}

function PlanEditor({ plan, onSave }: { plan: Plan; onSave(p: Plan): Promise<void> }) {
  const [p, setP] = useState(plan);
  const [features, setFeatures] = useState(plan.features.join("\n"));
  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave({ ...p, features: features.split("\n").map((f) => f.trim()).filter(Boolean) });
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-5" aria-label={`${plan.name} paketi`}>
      <TextField label="Paket adı" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Fiyat (₺)" type="number" min={0} step="0.01" value={String(p.price)} onChange={(e) => setP({ ...p, price: Number(e.target.value) })} />
        <TextField label="Süre (gün)" type="number" min={1} value={String(p.periodDays)} onChange={(e) => setP({ ...p, periodDays: Number(e.target.value) })} />
      </div>
      <TextField label="Yayında anket sınırı" type="number" min={1} value={p.maxActiveSurveys === null ? "" : String(p.maxActiveSurveys)} hint="Boş bırakılırsa sınırsız"
        onChange={(e) => setP({ ...p, maxActiveSurveys: e.target.value ? Number(e.target.value) : null })} />
      <TextField label="Kısa açıklama" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
      <label className="block">
        <span className="label">Özellikler (her satıra bir tane)</span>
        <textarea className="input min-h-[96px]" value={features} onChange={(e) => setFeatures(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />Satışta (ana sayfada görünür)</label>
      <button className="btn-primary w-full">Kaydet</button>
    </form>
  );
}

function BankSettings({ onSaved }: { onSaved(m: Msg): void }) {
  const current = useAsync(() => db.getPaymentSettings(), []);
  if (current.loading) return <p className="text-sm text-slate-500">Yükleniyor…</p>;
  return <BankForm initial={current.data!} onSaved={async (m) => { onSaved(m); await current.reload(); }} />;
}

function BankForm({ initial, onSaved }: { initial: PaymentSettings; onSaved(m: Msg): void }) {
  const [s, setS] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!isValidIban(s.iban)) return setErr("Geçerli bir TR IBAN girin (TR + 24 rakam).");
    if (!s.bankName.trim() || !s.accountHolder.trim()) return setErr("Banka adı ve alıcı adı gerekli.");
    try {
      await db.adminUpdatePaymentSettings(s);
      onSaved({ kind: "success", text: "Ödeme bilgileri kaydedildi. Kurumlar ödeme ekranında bu bilgileri görür." });
    } catch (e2) {
      onSaved({ kind: "error", text: e2 instanceof Error ? e2.message : "Kaydedilemedi." });
    }
  }
  return (
    <form onSubmit={submit} className="card max-w-xl space-y-4 p-6" noValidate>
      <h2 className="font-semibold">Havale / EFT bilgileri</h2>
      {err && <Alert>{err}</Alert>}
      <TextField label="Banka" value={s.bankName} onChange={(e) => setS({ ...s, bankName: e.target.value })} placeholder="Örn. Ziraat Bankası" />
      <TextField label="Alıcı (hesap sahibi)" value={s.accountHolder} onChange={(e) => setS({ ...s, accountHolder: e.target.value })} />
      <TextField label="IBAN" value={formatIban(s.iban)} onChange={(e) => setS({ ...s, iban: e.target.value.replace(/\s+/g, "").toUpperCase() })} placeholder="TR00 0000 0000 0000 0000 0000 00" />
      <TextField label="Ödeme notu (kurumlara gösterilir)" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} placeholder="Örn. Açıklamaya kurum adını yazınız." />
      <div className="flex justify-end"><button className="btn-primary">Kaydet</button></div>
    </form>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <div className="relative sm:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Ara" />
    </div>
  );
}
