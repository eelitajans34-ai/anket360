import { useState } from "react";
import { Lock, PauseCircle } from "lucide-react";
import { AuthLayout } from "./auth/AuthLayout";
import { Alert } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";

/** Dondurulmuş ya da engellenmiş hesapla giriş yapıldığında gösterilir. */
export default function AccountStatusPage() {
  const { user, refresh, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const selfFrozen = user.status === "donduruldu" && user.frozenBy === "kullanici";

  async function reactivate() {
    setBusy(true);
    setError(null);
    try {
      await db.reactivateMyAccount();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hesap açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={user.status === "engellendi" ? "Hesabınız engellendi" : "Hesabınız donduruldu"}
      footer={<button className="font-semibold text-brand-600 hover:underline" onClick={() => signOut()}>Çıkış yap</button>}
    >
      <div className="card space-y-4 p-6 text-center">
        <div className="flex justify-center">
          {user.status === "engellendi" ? <Lock className="h-12 w-12 text-red-500" /> : <PauseCircle className="h-12 w-12 text-sky-500" />}
        </div>
        {error && <Alert>{error}</Alert>}
        {selfFrozen ? (
          <>
            <p className="text-sm text-slate-600">Hesabınızı kendiniz dondurdunuz. Verileriniz korunuyor; dilediğiniz zaman yeniden açabilirsiniz.</p>
            <button className="btn-primary w-full" onClick={reactivate} disabled={busy}>{busy ? "Açılıyor…" : "Hesabımı yeniden aç"}</button>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Hesabınız platform yöneticisi tarafından {user.status === "engellendi" ? "engellendi" : "donduruldu"}. Bilgi için destek ile iletişime geçin:{" "}
            <a className="font-medium text-brand-600" href="mailto:destek@anket360.com.tr">destek@anket360.com.tr</a>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
