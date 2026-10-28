import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { Alert, TextField } from "@/components/ui/Field";
import { PasswordField, PasswordStrength } from "@/components/ui/PasswordField";
import { useAuth } from "@/lib/auth";
import { isValidEmail, passwordIssues, safeRedirect } from "@/lib/utils";
import { DEFAULT_PLANS } from "@/lib/platform";

type Errors = Partial<Record<"fullName" | "email" | "password" | "confirm" | "kvkk", string>>;

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeRedirect((location.state as { from?: string } | null)?.from, "/kurum/olustur");
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const planMatch = /^\/panel\/odeme\/([a-z0-9-]+)$/.exec(from);
  const selectedPlan = planMatch ? (DEFAULT_PLANS.find((p) => p.id === planMatch[1])?.name ?? planMatch[1]) : null;
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirm: "", kvkk: false });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function validate(): Errors {
    const e: Errors = {};
    if (form.fullName.trim().length < 2) e.fullName = "Adınızı ve soyadınızı girin.";
    if (!isValidEmail(form.email)) e.email = "Geçerli bir e-posta adresi girin.";
    const pw = passwordIssues(form.password);
    if (pw.length) e.password = pw.join(", ");
    if (form.confirm !== form.password) e.confirm = "Şifreler eşleşmiyor.";
    if (!form.kvkk) e.kvkk = "Devam etmek için aydınlatma metnini onaylayın.";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const user = await signUp({ fullName: form.fullName, email: form.email, password: form.password, kvkkConsent: form.kvkk });
      if (!user) setConfirmSentTo(form.email.trim().toLowerCase());
      // Süper yönetici kurum oluşturmak zorunda değil; doğrudan yönetim paneline gider
      else navigate(user.isSuperAdmin && !(location.state as { from?: string } | null)?.from ? "/yonetim" : from, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kayıt oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmSentTo) {
    return (
      <AuthLayout title="E-postanızı doğrulayın" footer={<Link to="/giris" className="font-semibold text-brand-600 hover:underline">Giriş sayfasına git</Link>}>
        <div className="card p-6 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-brand-600" />
          <p className="mt-4 text-sm text-slate-700">
            <strong>{confirmSentTo}</strong> adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra hesabınız etkinleşecek.
          </p>
          <p className="mt-3 text-xs text-slate-500">E-posta birkaç dakika içinde gelmezse istenmeyen (spam) klasörünü kontrol edin.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Ücretsiz hesap oluşturun"
      subtitle="Kredi kartı gerekmez. Kurulum 2 dakika sürer."
      footer={<>Zaten hesabınız var mı? <Link to="/giris" state={location.state} className="font-semibold text-brand-600 hover:underline">Giriş yapın</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {selectedPlan && <Alert kind="info">Kayıt ve kurum bilgilerinden sonra <strong>{selectedPlan}</strong> paketi için ödeme sayfasına yönlendirileceksiniz.</Alert>}
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Ad Soyad" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} error={errors.fullName} />
        <TextField label="İş e-postası" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} placeholder="ornek@kurum.com.tr" />
        <div>
          <PasswordField label="Şifre" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} error={errors.password} />
          {form.password && <PasswordStrength password={form.password} />}
        </div>
        <PasswordField label="Şifre (tekrar)" autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} error={errors.confirm} />
        <div>
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" checked={form.kvkk} onChange={(e) => set("kvkk", e.target.checked)} />
            <span>
              <a href={`${import.meta.env.BASE_URL}#kvkk`} className="font-medium text-brand-600 hover:underline">KVKK Aydınlatma Metni</a>'ni okudum, kişisel verilerimin işlenmesini kabul ediyorum.
            </span>
          </label>
          {errors.kvkk && <p className="mt-1.5 text-xs text-red-600">{errors.kvkk}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Hesap oluşturuluyor…" : "Hesap oluştur"}</button>
      </form>
    </AuthLayout>
  );
}
