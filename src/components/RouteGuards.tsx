import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Yükleniyor">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  );
}

/** Giriş yapılmamışsa giriş sayfasına yönlendirir. */
export function RequireAuth() {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/giris" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Kurumu olmayan kullanıcıyı kurum oluşturma sayfasına yönlendirir. */
export function RequireOrg() {
  const { organizations } = useAuth();
  if (organizations.length === 0) return <Navigate to="/kurum/olustur" replace />;
  return <Outlet />;
}

/** Giriş yapmış kullanıcıyı panele yönlendirir (giriş/kayıt sayfaları için). */
export function GuestOnly() {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/panel"} replace />;
  return <Outlet />;
}
