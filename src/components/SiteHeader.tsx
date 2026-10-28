import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#nasil-calisir", label: "Nasıl Çalışır?" },
  { href: "#fiyatlar", label: "Fiyatlar" },
  { href: "#sss", label: "SSS" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex" aria-label="Ana menü">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm font-medium text-slate-600 hover:text-slate-900">{n.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/panel" className="btn-primary">Panele git</Link>
          ) : (
            <>
              <Link to="/giris" className="btn-ghost">Giriş yap</Link>
              <Link to="/kayit" className="btn-primary">Ücretsiz başla</Link>
            </>
          )}
        </div>
        <button className="btn-ghost -mr-2 px-2 md:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Menüyü kapat" : "Menüyü aç"} aria-expanded={open}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2" aria-label="Mobil menü">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{n.label}</a>
            ))}
          </nav>
          <div className="grid grid-cols-2 gap-2">
            {user ? (
              <Link to="/panel" className="btn-primary col-span-2">Panele git</Link>
            ) : (
              <>
                <Link to="/giris" className="btn-secondary">Giriş yap</Link>
                <Link to="/kayit" className="btn-primary">Ücretsiz başla</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
