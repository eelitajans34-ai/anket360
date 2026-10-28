import type { Question, QuestionType, SurveyInput } from "@/lib/types";
import { uid } from "@/lib/utils";
import { questionTypeMeta } from "@/lib/constants";

export function newQuestion(type: QuestionType): Question {
  const q: Question = { id: uid(), type, title: "", required: false };
  if (questionTypeMeta(type).hasOptions) q.options = ["Seçenek 1", "Seçenek 2"];
  if (type === "derecelendirme") q.scaleMax = 5;
  return q;
}

/** Soru tipi değiştiğinde uyumsuz alanları temizler, gerekli alanları ekler. */
export function changeQuestionType(q: Question, type: QuestionType): Question {
  const next: Question = { id: q.id, type, title: q.title, description: q.description, required: q.required, showIf: q.showIf };
  if (questionTypeMeta(type).hasOptions) next.options = q.options?.length ? q.options : ["Seçenek 1", "Seçenek 2"];
  if (type === "derecelendirme") next.scaleMax = q.scaleMax ?? 5;
  return next;
}

export const DEFAULT_SETTINGS: SurveyInput["settings"] = { anonymous: false, singleResponse: true, showProgress: true };

const q = (type: QuestionType, title: string, extra: Partial<Question> = {}): Question => ({ ...newQuestion(type), title, required: true, ...extra });

export interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  build(): SurveyInput;
}

export const TEMPLATES: SurveyTemplate[] = [
  {
    id: "bos",
    name: "Boş anket",
    description: "Sıfırdan kendi sorularınızı ekleyin.",
    build: () => ({ title: "Adsız anket", description: "", status: "taslak", settings: { ...DEFAULT_SETTINGS }, questions: [] }),
  },
  {
    id: "calisan",
    name: "Çalışan memnuniyeti",
    description: "Bağlılık, yönetim ve çalışma ortamı soruları.",
    build: () => ({
      title: "Çalışan Memnuniyeti Anketi",
      description: "Görüşleriniz çalışma ortamımızı geliştirmemize yardımcı olacak. Yanıtlarınız anonim olarak değerlendirilir.",
      status: "taslak",
      settings: { ...DEFAULT_SETTINGS, anonymous: true },
      questions: [
        q("acilir_liste", "Hangi departmanda çalışıyorsunuz?", { options: ["İnsan Kaynakları", "Satış", "Pazarlama", "Bilgi Teknolojileri", "Finans", "Operasyon", "Diğer"] }),
        q("derecelendirme", "Genel olarak işinizden ne kadar memnunsunuz?"),
        q("derecelendirme", "Yöneticinizden aldığınız geri bildirimin yeterliliğini nasıl değerlendirirsiniz?"),
        q("nps", "Kurumumuzu çalışılacak bir yer olarak tavsiye etme olasılığınız nedir?"),
        q("uzun_metin", "Çalışma ortamımızı iyileştirmek için önerileriniz nelerdir?", { required: false }),
      ],
    }),
  },
  {
    id: "musteri",
    name: "Müşteri memnuniyeti (NPS)",
    description: "NPS ve hizmet kalitesi ölçümü.",
    build: () => ({
      title: "Müşteri Memnuniyeti Anketi",
      description: "Hizmetimizi değerlendirdiğiniz için teşekkür ederiz.",
      status: "taslak",
      settings: { ...DEFAULT_SETTINGS },
      questions: [
        q("nps", "Bizi bir arkadaşınıza veya meslektaşınıza tavsiye etme olasılığınız nedir?"),
        q("coklu_secim", "Hangi hizmetlerimizi kullandınız?", { options: ["Satış", "Teknik destek", "Kurulum", "Eğitim"] }),
        q("tek_secim", "Sorununuz ilk iletişimde çözüldü mü?", { options: ["Evet", "Kısmen", "Hayır"] }),
        q("uzun_metin", "Puanınızın temel nedeni nedir?", { required: false }),
      ],
    }),
  },
  {
    id: "etkinlik",
    name: "Etkinlik geri bildirimi",
    description: "Etkinlik veya eğitim sonrası değerlendirme.",
    build: () => ({
      title: "Etkinlik Değerlendirme Formu",
      description: "Katılımınız için teşekkürler! Lütfen birkaç dakikanızı ayırın.",
      status: "taslak",
      settings: { ...DEFAULT_SETTINGS },
      questions: [
        q("kisa_metin", "Katıldığınız oturumun adı", { required: false }),
        q("derecelendirme", "Etkinliği genel olarak nasıl değerlendirirsiniz?"),
        q("evet_hayir", "Bir sonraki etkinliğimize katılmayı düşünür müsünüz?"),
        q("uzun_metin", "Eklemek istedikleriniz", { required: false }),
      ],
    }),
  },
];
