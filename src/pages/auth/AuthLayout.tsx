import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>
      <aside className="hidden flex-col justify-center bg-gradient-to-br from-brand-700 to-brand-950 p-12 text-white lg:flex">
        <div className="max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight">Geri bildirimi karara dönüştürün.</h2>
          <p className="mt-4 text-brand-100">Anket360 ile kurumunuzun tüm anketlerini tek bir panelden yönetin.</p>
          <ul className="mt-8 space-y-3">
            {["Dakikalar içinde anket oluşturun", "Ekibinizle birlikte çalışın", "Sonuçları anlık takip edin", "KVKK uyumlu veri saklama"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm"><CheckCircle2 className="h-5 w-5 text-brand-300" />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
