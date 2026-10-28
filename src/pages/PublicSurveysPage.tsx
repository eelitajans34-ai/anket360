import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Lock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CATEGORIES, type ReadySurvey } from "@/components/survey/categories";
import { useAuth } from "@/lib/auth";
import { questionTypeMeta } from "@/lib/constants";

/** Kamuya açık "Anketler" sayfası: kategoriler ve hazır anketler */
export default function PublicSurveysPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: "smooth" });
  }, [hash]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-gradient-to-b from-brand-50 to-white">
          <div className="mx-auto max-w-6xl px-4 py-14 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Hazır anketler</h1>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">Belediyeler, siyasi partiler, STK'lar ve işletmeler için hazırlanmış anketler. Birini seçin, isterseniz soruları değiştirin ve dakikalar içinde yayınlayın.</p>
            <nav className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Kategoriler">
              {CATEGORIES.map((c) => (
                <a key={c.id} href={`#${c.id}`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-brand-400">
                  <span aria-hidden>{c.emoji}</span> {c.name}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
          {CATEGORIES.map((c) => (
            <section key={c.id} id={c.id} className="scroll-mt-20" aria-labelledby={`baslik-${c.id}`}>
              <div className="mb-5 flex items-center gap-3">
                <span className="text-4xl" aria-hidden>{c.emoji}</span>
                <div>
                  <h2 id={`baslik-${c.id}`} className="text-2xl font-bold">{c.name}</h2>
                  <p className="text-sm text-slate-600">{c.description}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {c.surveys.map((s) => <SurveyCard key={s.id} survey={s} />)}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SurveyCard({ survey }: { survey: ReadySurvey }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const built = survey.build();
  return (
    <article className="card flex flex-col p-5">
      <h3 className="font-semibold">{survey.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{survey.description}</p>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        {built.questions.length} soru
        {built.settings.anonymous && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><Lock className="h-3 w-3" />anonim</span>}
      </p>
      <button className="mt-3 flex items-center gap-1 self-start text-sm font-medium text-brand-600" onClick={() => setOpen(!open)} aria-expanded={open}>
        Soruları {open ? "gizle" : "gör"} <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          {built.questions.map((q) => (
            <li key={q.id}>{q.title} <span className="text-xs text-slate-400">({questionTypeMeta(q.type).label})</span></li>
          ))}
        </ol>
      )}
      <div className="flex-1" />
      <Link to={user ? "/panel/anketler/yeni" : "/kayit"} className="btn-secondary mt-5">{user ? "Bu anketi kullan" : "Ücretsiz başla ve kullan"}</Link>
    </article>
  );
}
