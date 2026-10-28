import { useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { PageHeader } from "./PanelLayout";
import { Alert, SelectField, TextField } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { CITIES, ORG_SIZES, ROLE_LABEL, SECTORS } from "@/lib/constants";
import { db } from "@/lib/data";
import type { OrganizationInput } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate, initials } from "@/lib/utils";

export default function OrgSettingsPage() {
  const { activeOrg, refresh } = useAuth();
  const [form, setForm] = useState<OrganizationInput>({ name: "", sector: "", size: "", city: "", phone: "", website: "" });
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: members = [] } = useAsync(() => (activeOrg ? db.listMembers(activeOrg.id) : Promise.resolve([])), [activeOrg?.id]);
  const canEdit = activeOrg?.role === "sahip" || activeOrg?.role === "yonetici";

  useEffect(() => {
    if (activeOrg) setForm({ name: activeOrg.name, sector: activeOrg.sector, size: activeOrg.size, city: activeOrg.city, phone: activeOrg.phone ?? "", website: activeOrg.website ?? "" });
  }, [activeOrg]);

  const set = (k: keyof OrganizationInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrg) return;
    setBusy(true);
    setMsg(null);
    try {
      await db.updateOrganization(activeOrg.id, form);
      await refresh();
      setMsg({ kind: "success", text: "Kurum bilgileri kaydedildi." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Kurum ayarları" description="Kurum bilgilerinizi ve ekibinizi yönetin." />
      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={onSubmit} className="card space-y-5 p-6 lg:col-span-3" noValidate>
          <h2 className="font-semibold">Kurum bilgileri</h2>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <fieldset disabled={!canEdit} className="space-y-5">
            <TextField label="Kurum adı" required value={form.name} onChange={(e) => set("name", e.target.value)} />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField label="Sektör" required options={SECTORS} value={form.sector} onChange={(e) => set("sector", e.target.value)} />
              <SelectField label="Çalışan sayısı" required options={ORG_SIZES} value={form.size} onChange={(e) => set("size", e.target.value)} />
            </div>
            <div>
              <TextField label="Şehir" required list="sehirler-ayar" value={form.city} onChange={(e) => set("city", e.target.value)} />
              <datalist id="sehirler-ayar">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Telefon" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              <TextField label="Web sitesi" type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            </div>
            <p className="text-xs text-slate-500">Kurum kısa adı: <code className="rounded bg-slate-100 px-1">{activeOrg?.slug}</code> · Oluşturma: {activeOrg && formatDate(activeOrg.createdAt)}</p>
          </fieldset>
          {canEdit && <div className="flex justify-end border-t border-slate-100 pt-5"><button className="btn-primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>}
        </form>

        <section className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Ekip ({members.length})</h2>
            <button className="btn-secondary px-3 py-2 text-xs" disabled title="Veritabanı bağlantısından sonra etkinleşecek"><UserPlus className="h-4 w-4" />Davet et</button>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold">{initials(m.user.fullName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.user.fullName}</p>
                  <p className="truncate text-xs text-slate-500">{m.user.email}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{ROLE_LABEL[m.role]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">E-posta ile ekip daveti, veritabanı ve e-posta altyapısı bağlandıktan sonra (Aşama 2) etkinleşecek.</p>
        </section>
      </div>
    </>
  );
}
