import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Building2, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Menu, Plus, UserCircle, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { to: "/panel", label: "Genel Bakış", icon: LayoutDashboard, end: true },
  { to: "/panel/anketler", label: "Anketler", icon: ClipboardList },
  { to: "/panel/kurum", label: "Kurum", icon: Building2 },
  { to: "/panel/profil", label: "Profilim", icon: UserCircle },
];

export default function PanelLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="btn-ghost absolute right-2 top-3 px-2" onClick={() => setMobileOpen(false)} aria-label="Menüyü kapat"><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button className="btn-ghost -ml-2 px-2" onClick={() => setMobileOpen(true)} aria-label="Menüyü aç"><Menu className="h-6 w-6" /></button>
          <Logo />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, organizations, activeOrg, setActiveOrg, signOut } = useAuth();
  const navigate = useNavigate();
  const [orgMenu, setOrgMenu] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Logo /></div>

      <div className="relative px-3">
        <button
          onClick={() => setOrgMenu(!orgMenu)}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50"
          aria-haspopup="listbox"
          aria-expanded={orgMenu}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">{activeOrg ? initials(activeOrg.name) : "?"}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{activeOrg?.name}</span>
            <span className="block text-xs text-slate-500">{activeOrg && ROLE_LABEL[activeOrg.role]}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
        {orgMenu && (
          <div className="absolute inset-x-3 top-full z-10 mt-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" role="listbox">
            {organizations.map((o) => (
              <button
                key={o.id}
                role="option"
                aria-selected={o.id === activeOrg?.id}
                onClick={() => { setActiveOrg(o.id); setOrgMenu(false); onNavigate?.(); navigate("/panel"); }}
                className={cn("block w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50", o.id === activeOrg?.id && "bg-brand-50 font-medium text-brand-700")}
              >
                {o.name}
              </button>
            ))}
            <Link to="/kurum/olustur" onClick={onNavigate} className="mt-1 flex items-center gap-2 rounded-md border-t border-slate-100 px-3 py-2 text-sm text-brand-600 hover:bg-slate-50">
              <Plus className="h-4 w-4" /> Yeni kurum oluştur
            </Link>
          </div>
        )}
      </div>

      <div className="px-3 pt-4">
        <Link to="/panel/anketler/yeni" onClick={onNavigate} className="btn-primary w-full"><Plus className="h-4 w-4" />Yeni anket</Link>
      </div>

      <nav className="mt-4 flex-1 space-y-1 px-3" aria-label="Panel menüsü">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}
          >
            <Icon className="h-5 w-5" />{label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">{user && initials(user.fullName)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button className="btn-ghost px-2" onClick={() => signOut().then(() => navigate("/"))} aria-label="Çıkış yap" title="Çıkış yap"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
