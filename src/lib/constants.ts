import type { QuestionType, SurveyStatus } from "./types";

export const SECTORS = [
  "Eğitim",
  "Sağlık",
  "Kamu / Belediye",
  "Siyasi Parti",
  "Perakende",
  "Üretim / Sanayi",
  "Bilişim / Yazılım",
  "Finans / Sigorta",
  "Turizm / Otelcilik",
  "Lojistik",
  "Danışmanlık",
  "Sivil Toplum / Dernek",
  "Diğer",
] as const;

export const ORG_SIZES = ["1–10", "11–50", "51–200", "201–1000", "1000+"] as const;

export const CITIES = [
  "Adana", "Ankara", "Antalya", "Bursa", "Diyarbakır", "Erzurum", "Eskişehir",
  "Gaziantep", "İstanbul", "İzmir", "Kayseri", "Kocaeli", "Konya", "Malatya",
  "Mersin", "Muğla", "Samsun", "Sakarya", "Trabzon", "Van",
] as const;

export interface QuestionTypeMeta {
  type: QuestionType;
  label: string;
  hint: string;
  hasOptions?: boolean;
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  { type: "kisa_metin", label: "Kısa yanıt", hint: "Tek satırlık metin" },
  { type: "uzun_metin", label: "Uzun yanıt", hint: "Paragraf metni" },
  { type: "tek_secim", label: "Tek seçim", hint: "Seçeneklerden biri", hasOptions: true },
  { type: "coklu_secim", label: "Çoklu seçim", hint: "Birden fazla seçenek", hasOptions: true },
  { type: "acilir_liste", label: "Açılır liste", hint: "Listeden seçim", hasOptions: true },
  { type: "derecelendirme", label: "Derecelendirme", hint: "Yıldız / puan" },
  { type: "nps", label: "NPS (0–10)", hint: "Tavsiye etme olasılığı" },
  { type: "evet_hayir", label: "Evet / Hayır", hint: "İki seçenekli" },
  { type: "tarih", label: "Tarih", hint: "Takvimden tarih" },
];

export const questionTypeMeta = (t: QuestionType) => QUESTION_TYPES.find((q) => q.type === t)!;

export const STATUS_LABEL: Record<SurveyStatus, string> = {
  taslak: "Taslak",
  yayinda: "Yayında",
  kapali: "Kapalı",
};

export const STATUS_STYLE: Record<SurveyStatus, string> = {
  taslak: "bg-amber-50 text-amber-700 ring-amber-600/20",
  yayinda: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  kapali: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export const ROLE_LABEL = { sahip: "Sahip", yonetici: "Yönetici", uye: "Üye" } as const;
