import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { safeRedirect } from "@/lib/utils";
import AccountStatusPage from "@/pages/AccountStatusPage";

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
  // Dondurulan ya da engellenen hesap yalnızca durum sayfasını görür
  if (user.status !== "aktif") return <AccountStatusPage />;
  return <Outlet />;
}

/** Yalnızca platform (süper) yöneticisi */
export function RequireSuperAdmin() {
  const { user } = useAuth();
  if (!user?.isSuperAdmin) return <Navigate to="/panel" replace />;
  return <Outlet />;
}

/** Kurumu olmayan kullanıcıyı kurum oluşturma sayfasına yönlendirir. */
export function RequireOrg() {
  const { organizations, user } = useAuth();
  const location = useLocation();
  if (organizations.length === 0) {
    // Kurumu olmayan süper yönetici başka kurumların anketlerini düzenleyebilir
    if (user?.isSuperAdmin && /^\/panel\/anketler\/[^/]+\/duzenle$/.test(location.pathname)) return <Outlet />;
    return <Navigate to={user?.isSuperAdmin ? "/yonetim" : "/kurum/olustur"} replace />;
  }
  return <Outlet />;
}

/** Giriş yapmış kullanıcıyı panele yönlendirir (giriş/kayıt sayfaları için). */
export function GuestOnly() {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to={safeRedirect((location.state as { from?: string } | null)?.from, "/panel")} replace />;
  return <Outlet />;
}
