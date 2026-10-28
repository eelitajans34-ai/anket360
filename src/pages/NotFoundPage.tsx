import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p className="mt-6 text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="text-xl font-semibold">Sayfa bulunamadı</h1>
      <p className="text-sm text-slate-600">Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.</p>
      <Link to="/" className="btn-primary mt-2">Ana sayfaya dön</Link>
    </div>
  );
}
