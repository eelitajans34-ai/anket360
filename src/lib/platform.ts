import type { Organization, OrgStatus, Plan } from "./types";

/**
 * Platform kuralları. Supabase'de aynı kurallar SQL ile uygulanır
 * (supabase/migrations/*_yonetim_abonelik.sql); burası demo modu ve arayüz içindir.
 */

/** Süper yönetici e-postaları (Supabase'de platform_admins tablosu) */
export const SUPER_ADMIN_EMAILS = ["mustafasubasinin@gmail.com"];

export const DEFAULT_PLANS: Plan[] = [
  { id: "baslangic", name: "Başlangıç", price: 0, periodDays: 3650, maxActiveSurveys: 3, description: "Küçük ekipler ve denemeler için.", features: ["Aynı anda 3 yayında anket", "Hazır anketler", "Temel raporlar", "Excel / CSV / PDF"], sort: 1, active: true },
  { id: "profesyonel", name: "Profesyonel", price: 499, periodDays: 30, maxActiveSurveys: null, description: "Büyüyen kurumlar için.", features: ["Sınırsız anket", "Gelişmiş raporlar", "Ekip yönetimi", "Öncelikli destek"], sort: 2, active: true },
  { id: "kurumsal", name: "Kurumsal", price: 1999, periodDays: 30, maxActiveSurveys: null, description: "Belediyeler ve büyük kurumlar için.", features: ["Sınırsız anket ve yanıt", "Sınırsız ekip üyesi", "Kurulum ve eğitim desteği", "Özel destek hattı"], sort: 3, active: true },
];

export const ORG_STATUS_LABEL: Record<OrgStatus, string> = {
  aktif: "Aktif",
  pasif: "Pasif",
  donduruldu: "Donduruldu",
  engellendi: "Engellendi",
};

export const ORG_STATUS_STYLE: Record<OrgStatus, string> = {
  aktif: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pasif: "bg-slate-100 text-slate-600 ring-slate-500/20",
  donduruldu: "bg-sky-50 text-sky-700 ring-sky-600/20",
  engellendi: "bg-red-50 text-red-700 ring-red-600/20",
};

/** Süresi dolmuş mu? (ücretsiz pakette bitiş yok) */
export function isExpired(org: Pick<Organization, "endsAt">, now = new Date()): boolean {
  return !!org.endsAt && new Date(org.endsAt) <= now;
}

/** Kurum anket yayınlayıp yanıt alabilir mi? */
export function orgUsable(org: Pick<Organization, "status" | "endsAt">, now = new Date()): boolean {
  return org.status === "aktif" && !isExpired(org, now);
}

/** Kurum neden kısıtlı? (kullanıcıya gösterilecek açıklama) */
export function orgRestriction(org: Pick<Organization, "status" | "endsAt">): string | null {
  if (org.status === "engellendi") return "Kurumunuz platform yöneticisi tarafından engellendi. Destek ile iletişime geçin.";
  if (org.status === "donduruldu") return "Kurumunuzun hesabı donduruldu. Destek ile iletişime geçin.";
  if (org.status === "pasif") return "Kurumunuz pasif durumda. Abonelik sayfasından paketinizi etkinleştirin.";
  if (isExpired(org)) return "Paketinizin süresi doldu. Abonelik sayfasından ödeme yaparak yenileyin.";
  return null;
}

export const formatTL = (n: number) => n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: n % 1 ? 2 : 0 });

/** IBAN'ı 4'lü gruplar halinde gösterir */
export const formatIban = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

/** TR IBAN biçim denetimi (TR + 24 rakam, mod-97) */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}
