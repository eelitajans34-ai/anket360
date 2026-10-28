import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { Alert } from "@/components/ui/Field";
import { PasswordField, PasswordStrength } from "@/components/ui/PasswordField";
import { FullPageSpinner } from "@/components/RouteGuards";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { passwordIssues } from "@/lib/utils";

/** Şifre sıfırlama e-postasındaki bağlantının açtığı sayfa. */
export default function ResetPasswordPage() {
  const { loading, user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const issues = passwordIssues(password);
    if (issues.length) return setError(issues.join(", "));
    if (password !== confirm) return setError("Şifreler eşleşmiyor.");
    setBusy(true);
    try {
      await db.updatePassword(password);
      navigate("/panel", { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <FullPageSpinner />;

  if (!user) {
    return (
      <AuthLayout title="Bağlantı geçersiz" footer={<Link to="/sifremi-unuttum" className="font-semibold text-brand-600 hover:underline">Yeni bağlantı iste</Link>}>
        <Alert>Şifre yenileme bağlantısının süresi dolmuş ya da daha önce kullanılmış olabilir.</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Yeni şifre belirleyin" subtitle={<>{user.email} hesabı için yeni şifrenizi girin.</>}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <div>
          <PasswordField label="Yeni şifre" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {password && <PasswordStrength password={password} />}
        </div>
        <PasswordField label="Yeni şifre (tekrar)" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Kaydediliyor…" : "Şifremi güncelle"}</button>
      </form>
    </AuthLayout>
  );
}
