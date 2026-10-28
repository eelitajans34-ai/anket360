import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Alert, SelectField, TextField } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { CITIES, ORG_SIZES, SECTORS } from "@/lib/constants";
import { db } from "@/lib/data";
import type { OrganizationInput } from "@/lib/types";
import { slugify } from "@/lib/utils";

type Errors = Partial<Record<keyof OrganizationInput, string>>;

export default function CreateOrgPage() {
  const { user, organizations, refresh, setActiveOrg, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<OrganizationInput>({ name: "", sector: "", size: "", city: "", phone: "", website: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof OrganizationInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function validate(): Errors {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = "Kurum adını girin.";
    if (!form.sector) e.sector = "Sektör seçin.";
    if (!form.size) e.size = "Çalışan sayısını seçin.";
    if (!form.city.trim()) e.city = "Şehir girin.";
    if (form.phone && !/^[\d\s()+-]{10,}$/.test(form.phone)) e.phone = "Geçerli bir telefon numarası girin.";
    if (form.website && !/^https?:\/\/\S+\.\S+/.test(form.website)) e.website = "Adres http:// veya https:// ile başlamalı.";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !user) return;
    setBusy(true);
    try {
      const org = await db.createOrganization(user.id, form);
      await refresh();
      setActiveOrg(org.id);
      navigate("/panel", { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kurum oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo />
          <button className="btn-ghost text-sm" onClick={() => signOut().then(() => navigate("/"))}>Çıkış yap</button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Building2 className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-medium text-brand-600">{organizations.length ? "Yeni kurum" : "Son adım"}</p>
            <h1 className="text-2xl font-bold">Kurumunuzu oluşturun</h1>
          </div>
        </div>
        <p className="mb-6 text-sm text-slate-600">
          Merhaba {user?.fullName.split(" ")[0]}, anketleriniz ve ekibiniz bu kurum altında toplanacak. Bilgileri daha sonra panelden değiştirebilirsiniz.
        </p>
        <form onSubmit={onSubmit} className="card space-y-5 p-6 sm:p-8" noValidate>
          {formError && <Alert>{formError}</Alert>}
          <TextField
            label="Kurum adı"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            error={errors.name}
            placeholder="Örn. Anadolu Eğitim Vakfı"
            hint={form.name ? `Kurum adresiniz: anket360.com.tr/${slugify(form.name) || "kurum"}` : undefined}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Sektör" required options={SECTORS} placeholder="Seçin" value={form.sector} onChange={(e) => set("sector", e.target.value)} error={errors.sector} />
            <SelectField label="Çalışan sayısı" required options={ORG_SIZES} placeholder="Seçin" value={form.size} onChange={(e) => set("size", e.target.value)} error={errors.size} />
          </div>
          <div>
            <TextField label="Şehir" required list="sehirler" value={form.city} onChange={(e) => set("city", e.target.value)} error={errors.city} />
            <datalist id="sehirler">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Telefon" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} placeholder="0 (212) 000 00 00" />
            <TextField label="Web sitesi" type="url" value={form.website} onChange={(e) => set("website", e.target.value)} error={errors.website} placeholder="https://" />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            {organizations.length > 0 && <button type="button" className="btn-secondary" onClick={() => navigate("/panel")}>Vazgeç</button>}
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Oluşturuluyor…" : "Kurumu oluştur ve devam et"}</button>
          </div>
        </form>
      </main>
    </div>
  );
}
