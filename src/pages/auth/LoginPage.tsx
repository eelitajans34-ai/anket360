import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { Alert, TextField } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { useAuth } from "@/lib/auth";
import { isValidEmail } from "@/lib/utils";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/panel";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) return setError("Geçerli bir e-posta adresi girin.");
    if (!password) return setError("Şifrenizi girin.");
    setBusy(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Tekrar hoş geldiniz"
      subtitle="Hesabınıza giriş yaparak anketlerinizi yönetin."
      footer={<>Hesabınız yok mu? <Link to="/kayit" className="font-semibold text-brand-600 hover:underline">Ücretsiz kaydolun</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <TextField label="E-posta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@kurum.com.tr" />
        <div>
          <PasswordField label="Şifre" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-2 text-right">
            <Link to="/sifremi-unuttum" className="text-sm font-medium text-brand-600 hover:underline">Şifremi unuttum</Link>
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}</button>
      </form>
    </AuthLayout>
  );
}
