import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { Alert, TextField } from "@/components/ui/Field";
import { db } from "@/lib/data";
import { isValidEmail } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) return setError("Geçerli bir e-posta adresi girin.");
    setBusy(true);
    try {
      await db.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İstek gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Şifrenizi mi unuttunuz?"
      subtitle="E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim."
      footer={<Link to="/giris" className="font-semibold text-brand-600 hover:underline">← Girişe dön</Link>}
    >
      {sent ? (
        <Alert kind="success">
          Bu adrese kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı <strong>{email}</strong> adresine gönderildi.
          Gelen kutunuzu ve istenmeyen klasörünü kontrol edin.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          <TextField label="E-posta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}</button>
        </form>
      )}
    </AuthLayout>
  );
}
