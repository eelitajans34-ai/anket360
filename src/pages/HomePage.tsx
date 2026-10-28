import { Link } from "react-router-dom";
import {
  BarChart3, Check, 
  LayoutTemplate, Lock, Send, Smartphone, Star, Users,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CATEGORIES } from "@/components/survey/categories";
import { db } from "@/lib/data";
import { DEFAULT_PLANS, formatTL } from "@/lib/platform";
import { useAsync } from "@/lib/use-async";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  { icon: LayoutTemplate, title: "Hazır anketler", text: "Belediye, siyasi parti, STK ve işletmeler için hazır sorularla dakikalar içinde başlayın." },
  { icon: Users, title: "Kurum ve ekip yönetimi", text: "Kurumunuzu oluşturun, ekip arkadaşlarınızı rol bazlı yetkilerle davet edin." },
  { icon: BarChart3, title: "Anlık raporlar", text: "Yanıtları grafiklerle izleyin, NPS ve memnuniyet skorlarını takip edin." },
  { icon: Lock, title: "KVKK uyumlu", text: "Veriler Türkiye mevzuatına uygun saklanır; anonim anket seçeneği sunulur." },
  { icon: Smartphone, title: "Mobil uyumlu", text: "Katılımcılar anketleri telefon, tablet veya bilgisayardan rahatça yanıtlar." },
  { icon: Send, title: "Kolay paylaşım", text: "Bağlantı, QR kod veya e-posta ile anketinizi hedef kitlenize ulaştırın." },
];

const STEPS = [
  { n: 1, title: "Kurumunuzu oluşturun", text: "Ücretsiz hesap açın ve kurum bilgilerinizi girin. Kredi kartı gerekmez." },
  { n: 2, title: "Alanınızı seçin", text: "Belediye, siyasi parti, STK, işletme… Size uygun hazır anketi seçin, dilerseniz soruları değiştirin." },
  { n: 3, title: "Sonuçları analiz edin", text: "Gelen yanıtları panelden anlık izleyin, raporları dışa aktarın." },
];



const FAQ = [
  { q: "Anket360'ı kullanmak ücretli mi?", a: "Başlangıç paketi ücretsizdir; aynı anda 3 anket yayınlayabilirsiniz. Daha fazlası için paketinizi panelden havale/EFT ile yükseltebilirsiniz." },
  { q: "Verilerim nerede saklanıyor?", a: "Verileriniz şifrelenmiş olarak güvenli sunucularda saklanır ve KVKK hükümlerine uygun şekilde işlenir." },
  { q: "Anonim anket oluşturabilir miyim?", a: "Evet. Anket ayarlarından anonim modu açtığınızda katılımcıların kimlik bilgileri kaydedilmez." },
  { q: "Ekibimi nasıl eklerim?", a: "Yönetim panelindeki Kurum sayfasından ekip arkadaşlarınızı Yönetici veya Üye rolüyle davet edebilirsiniz." },
  { q: "Hangi soru tiplerini kullanabilirim?", a: "Kısa ve uzun metin, tek ve çoklu seçim, açılır liste, derecelendirme, NPS, evet/hayır ve tarih sorularını kullanabilirsiniz." },
];

export default function HomePage() {
  // Fiyatlar veritabanından (süper yönetici değiştirebilir); yüklenemezse varsayılanlar
  const { data: plans } = useAsync(() => db.listPlans().then((p) => p.filter((x) => x.active)), []);
  const shownPlans = plans?.length ? plans : DEFAULT_PLANS;
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 via-white to-white" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                <Star className="h-3.5 w-3.5" /> Türkiye'nin kurumsal anket platformu
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                Kurumunuzun sesini <span className="text-brand-600">360°</span> dinleyin
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                Belediyeler, siyasi partiler, STK'lar ve işletmeler için hazır anketler. Alanınızı seçin, bağlantıyı paylaşın,
                sonuçları anında görün. Tamamen Türkçe, KVKK uyumlu.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/kayit" className="btn-primary px-6 py-3 text-base">Ücretsiz hesap oluştur</Link>
                <a href="#nasil-calisir" className="btn-secondary px-6 py-3 text-base">Nasıl çalışır?</a>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                {["Kredi kartı gerekmez", "2 dakikada kurulum", "Türkçe destek"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />{t}</li>
                ))}
              </ul>
            </div>
            <HeroPreview />
          </div>
        </section>

        {/* Rakamlar */}
        <section className="border-y border-slate-100 bg-slate-50">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center sm:grid-cols-4">
            {[["9", "soru tipi"], ["%100", "Türkçe arayüz"], ["KVKK", "uyumlu altyapı"], ["7/24", "erişilebilir anketler"]].map(([v, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="text-3xl font-extrabold text-brand-700">{v}</dd>
                <dd className="text-sm text-slate-500">{l}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Özellikler */}
        <section id="ozellikler" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <SectionTitle eyebrow="Özellikler" title="İhtiyacınız olan her şey tek platformda" text="Anket hazırlamaktan sonuçları raporlamaya kadar tüm süreci Anket360 ile yönetin." />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-6 transition hover:shadow-md">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-6 w-6" /></div>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Nasıl çalışır */}
        <section id="nasil-calisir" className="scroll-mt-20 bg-slate-900 py-20 text-white">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle dark eyebrow="Nasıl Çalışır?" title="Üç adımda ilk anketiniz yayında" />
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="rounded-xl border border-white/10 bg-white/5 p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-bold">{s.n}</span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Kimler için — hazır anket kategorileri */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <SectionTitle eyebrow="Kimler İçin?" title="Her kesime uygun hazır anketler" text="Alanınızı seçin; sorular hazır gelsin. Dilediğiniz gibi değiştirebilirsiniz." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {CATEGORIES.map((c) => (
              <Link key={c.id} to={`/anketler#${c.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
                <span className="text-4xl" aria-hidden>{c.emoji}</span>
                <h3 className="mt-3 font-semibold">{c.name}</h3>
                <ul className="mt-2 flex-1 space-y-1 text-sm text-slate-600">
                  {c.surveys.slice(0, 3).map((s) => <li key={s.id}>• {s.name}</li>)}
                </ul>
                <span className="mt-4 text-sm font-medium text-brand-600 group-hover:underline">{c.surveys.length} hazır anket →</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Fiyatlar */}
        <section id="fiyatlar" className="scroll-mt-20 bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle eyebrow="Fiyatlar" title="Kurumunuza uygun paketi seçin" text="Ödemeler havale/EFT ile yapılır. Fiyatlara KDV dahil değildir." />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {shownPlans.map((p) => {
                const highlight = p.id === "profesyonel";
                return (
                <div key={p.id} className={`card relative flex flex-col p-7 ${highlight ? "border-brand-500 ring-2 ring-brand-500" : ""}`}>
                  {highlight && <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">En popüler</span>}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">{p.price === 0 ? "Ücretsiz" : formatTL(p.price)}</span>
                    <span className="text-sm text-slate-500">{p.price === 0 ? "" : p.periodDays === 30 ? "/ ay" : `/ ${p.periodDays} gün`}</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{f}</li>
                    ))}
                  </ul>
                  {/* Ücretli paket: ödeme sayfasına (giriş yoksa önce kayıt + kurum, sonra ödeme) */}
                  <Link
                    to={p.price === 0 ? (user ? "/panel" : "/kayit") : user ? `/panel/odeme/${p.id}` : "/kayit"}
                    state={p.price === 0 || user ? undefined : { from: `/panel/odeme/${p.id}` }}
                    className={`mt-8 ${highlight ? "btn-primary" : "btn-secondary"}`}
                  >
                    {p.price === 0 ? "Ücretsiz başla" : "Hemen başla"}
                  </Link>
                </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SSS */}
        <section id="sss" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
          <SectionTitle eyebrow="SSS" title="Sıkça sorulan sorular" />
          <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-slate-900">
                  {f.q}
                  <span className="text-xl text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20">
          <div className="mx-auto max-w-5xl rounded-2xl bg-brand-600 px-6 py-14 text-center text-white sm:px-12">
            <h2 className="text-3xl font-extrabold">Bugün ilk anketinizi oluşturun</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">Ücretsiz hesabınızı açın, kurumunuzu ekleyin ve dakikalar içinde geri bildirim toplamaya başlayın.</p>
            <Link to="/kayit" className="btn mt-8 bg-white px-6 py-3 text-base text-brand-700 hover:bg-brand-50">Hemen başla</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function SectionTitle({ eyebrow, title, text, dark }: { eyebrow: string; title: string; text?: string; dark?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className={`text-sm font-semibold uppercase tracking-wider ${dark ? "text-brand-300" : "text-brand-600"}`}>{eyebrow}</p>
      <h2 className={`mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-slate-900"}`}>{title}</h2>
      {text && <p className={`mt-4 ${dark ? "text-slate-300" : "text-slate-600"}`}>{text}</p>}
    </div>
  );
}

function HeroPreview() {
  const tiles = [
    { c: "belediye", bg: "from-sky-500 to-blue-700", stat: "%79", text: "vatandaş hizmetlerden memnun" },
    { c: "siyasi", bg: "from-rose-500 to-red-700", stat: "%54", text: "\"ekonomi\" en önemli sorun dedi" },
    { c: "stk", bg: "from-amber-400 to-orange-600", stat: "%88", text: "üye derneği tavsiye ediyor" },
    { c: "isletme", bg: "from-emerald-500 to-teal-700", stat: "+42", text: "müşteri tavsiye skoru (NPS)" },
  ];
  return (
    <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-brand-200/40 blur-2xl" />
      <p className="col-span-2 -mb-1 text-right text-[11px] text-slate-400">Örnek sonuçlar</p>
      {tiles.map((t, i) => {
        const cat = CATEGORIES.find((c) => c.id === t.c)!;
        return (
          <div key={t.c} className={`rounded-2xl bg-gradient-to-br ${t.bg} p-5 text-white shadow-lg ${i % 2 ? "translate-y-6" : ""}`}>
            <span className="text-3xl">{cat.emoji}</span>
            <p className="mt-2 text-sm font-semibold opacity-90">{cat.name}</p>
            <p className="mt-4 text-3xl font-extrabold">{t.stat}</p>
            <p className="text-xs opacity-90">{t.text}</p>
          </div>
        );
      })}
    </div>
  );
}
