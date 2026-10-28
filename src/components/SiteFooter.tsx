import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-slate-500">Kurumlar için yerli, KVKK uyumlu anket ve geri bildirim platformu.</p>
        </div>
        <FooterCol title="Ürün" links={[["Özellikler", "#ozellikler"], ["Fiyatlar", "#fiyatlar"], ["Nasıl Çalışır?", "#nasil-calisir"]]} />
        <FooterCol title="Destek" links={[["Sıkça Sorulanlar", "#sss"], ["İletişim", "mailto:destek@anket360.com.tr"]]} />
        <FooterCol title="Yasal" links={[["KVKK Aydınlatma Metni", "#kvkk"], ["Gizlilik Politikası", "#gizlilik"], ["Kullanım Koşulları", "#kosullar"]]} />
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Anket360. Tüm hakları saklıdır.
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={label}><a href={href} className="text-sm text-slate-500 hover:text-slate-900">{label}</a></li>
        ))}
      </ul>
    </div>
  );
}
