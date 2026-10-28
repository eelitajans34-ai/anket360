import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { AuthLayout } from "./auth/AuthLayout";
import { Alert } from "@/components/ui/Field";
import { FullPageSpinner } from "@/components/RouteGuards";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";

/** Ekip daveti bağlantısı: /davet/:token */
export default function InvitePage() {
  const { token = "" } = useParams();
  const { loading, user, refresh, setActiveOrg, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/davet/${token}`;

  async function accept() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const orgId = await db.acceptInvitation(token, user.id);
      await refresh();
      setActiveOrg(orgId);
      navigate("/panel", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Davet kabul edilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <FullPageSpinner />;

  return (
    <AuthLayout title="Ekip daveti" subtitle="Bir Anket360 kurumuna katılmaya davet edildiniz.">
      <div className="space-y-5">
        <div className="flex justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700"><UserPlus className="h-7 w-7" /></span></div>
        {error && <Alert>{error}</Alert>}
        {user ? (
          <>
            <p className="text-center text-sm text-slate-600"><strong>{user.email}</strong> olarak giriş yaptınız.</p>
            <button className="btn-primary w-full" onClick={accept} disabled={busy}>{busy ? "Katılınıyor…" : "Daveti kabul et ve katıl"}</button>
            <button className="btn-ghost w-full" onClick={() => signOut()}>Farklı bir hesapla devam et</button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-slate-600">Daveti kabul etmek için davetin gönderildiği e-posta adresiyle giriş yapın ya da hesap oluşturun.</p>
            <Link to="/giris" state={{ from: here }} className="btn-primary w-full">Giriş yap</Link>
            <Link to="/kayit" state={{ from: here }} className="btn-secondary w-full">Hesap oluştur</Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
