import type { Question, QuestionType, SurveyInput } from "@/lib/types";
import { DEFAULT_SETTINGS, TEMPLATES, newQuestion } from "./templates";

/**
 * Anket kategorileri ve her kategorinin hazır anketleri.
 * Yeni anket oluştururken önce kategori, sonra hazır anket seçilir.
 */

export type CategoryId = "belediye" | "siyasi" | "stk" | "isletme" | "genel";

export interface ReadySurvey {
  id: string;
  name: string;
  description: string;
  build(): SurveyInput;
}

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  emoji: string;
  /** Kurum sektörü bu listedeyse kategori önerilir */
  sectors: string[];
  surveys: ReadySurvey[];
}

// ---------- Yardımcılar ----------

const soru = (type: QuestionType, title: string, extra: Partial<Question> = {}): Question => ({
  ...newQuestion(type),
  title,
  required: true,
  ...extra,
});
const secim = (title: string, options: string[], extra: Partial<Question> = {}) => soru("tek_secim", title, { options, ...extra });
const coklu = (title: string, options: string[], extra: Partial<Question> = {}) => soru("coklu_secim", title, { options, ...extra });
const puan = (title: string, extra: Partial<Question> = {}) => soru("derecelendirme", title, { scaleMax: 5, ...extra });
const evetHayir = (title: string, extra: Partial<Question> = {}) => soru("evet_hayir", title, extra);
const acik = (title: string, extra: Partial<Question> = {}) => soru("uzun_metin", title, { required: false, ...extra });

const yasGrubu = () => secim("Yaş grubunuz", ["18–24", "25–34", "35–44", "45–54", "55–64", "65 ve üzeri"]);
const cinsiyet = () => secim("Cinsiyetiniz", ["Kadın", "Erkek", "Belirtmek istemiyorum"], { required: false });
const mahalle = () => soru("kisa_metin", "Oturduğunuz mahalle", { required: false });

function anket(category: CategoryId, title: string, description: string, questions: Question[], anonymous = true): SurveyInput {
  return { title, description, status: "taslak", settings: { ...DEFAULT_SETTINGS, anonymous, category }, questions };
}

const hazir = (category: CategoryId, id: string, name: string, description: string, build: () => Question[], title = name, intro = "", anonymous = true): ReadySurvey => ({
  id,
  name,
  description,
  build: () => anket(category, title, intro, build(), anonymous),
});

// ---------- Kategoriler ----------

export const CATEGORIES: Category[] = [
  {
    id: "belediye",
    name: "Belediye",
    description: "Vatandaş memnuniyeti, mahalle ihtiyaçları, hizmet ve etkinlik değerlendirmesi",
    emoji: "🏛️",
    sectors: ["Kamu / Belediye"],
    surveys: [
      hazir("belediye", "bel-memnuniyet", "Vatandaş memnuniyeti", "Belediye hizmetlerinden genel memnuniyet", () => [
        puan("Belediyemizin hizmetlerinden genel olarak ne kadar memnunsunuz?"),
        coklu("Son bir yılda hangi hizmetlerimizden yararlandınız?", ["Temizlik ve çöp toplama", "Toplu taşıma", "Park ve bahçeler", "Su ve kanalizasyon", "Zabıta", "Sosyal yardımlar", "Kültür ve sanat etkinlikleri", "Spor tesisleri"]),
        secim("Sizce ilçemizin en önemli sorunu nedir?", ["Trafik ve ulaşım", "Altyapı ve yollar", "Temizlik", "Yeşil alan eksikliği", "Otopark", "Güvenlik", "İşsizlik", "Diğer"]),
        puan("Belediyeye ulaşmak ve sorununuzu iletmek ne kadar kolay?"),
        evetHayir("Son bir yılda belediyeye bir şikâyet ya da talep ilettiniz mi?"),
        mahalle(),
        yasGrubu(),
        acik("Belediyemize iletmek istediğiniz öneri ya da görüşleriniz"),
      ], "Vatandaş Memnuniyet Anketi", "Görüşleriniz hizmetlerimizi iyileştirmemize yardımcı olacak. Anket yaklaşık 3 dakika sürer ve anonimdir."),
      hazir("belediye", "bel-mahalle", "Mahalle ihtiyaç analizi", "Mahallede neye ihtiyaç var?", () => [
        mahalle(),
        coklu("Mahallenizde en çok neye ihtiyaç var?", ["Park ve oyun alanı", "Spor alanı", "Kreş", "Yol bakımı", "Sokak aydınlatması", "Otopark", "Kütüphane", "Sağlık hizmeti", "Toplu taşıma"]),
        puan("Mahallenizde kendinizi ne kadar güvende hissediyorsunuz?"),
        puan("Mahallenizin temizliğinden ne kadar memnunsunuz?"),
        secim("Mahallenizde ne kadar süredir yaşıyorsunuz?", ["1 yıldan az", "1–5 yıl", "5–10 yıl", "10 yıldan fazla"]),
        yasGrubu(),
        acik("Mahalleniz için önerileriniz"),
      ], "Mahalle İhtiyaç Anketi", "Mahallenizin ihtiyaçlarını birlikte belirleyelim. Anket anonimdir."),
      hazir("belediye", "bel-etkinlik", "Etkinlik değerlendirme", "Festival, konser, kurs gibi etkinlikler için", () => [
        soru("kisa_metin", "Katıldığınız etkinliğin adı", { required: false }),
        puan("Etkinliği genel olarak nasıl değerlendirirsiniz?"),
        secim("Etkinlikten nasıl haberdar oldunuz?", ["Sosyal medya", "Afiş / pano", "Belediye internet sitesi", "SMS", "Arkadaş / komşu", "Diğer"]),
        puan("Etkinliğin düzeni ve organizasyonu nasıldı?"),
        evetHayir("Benzer bir etkinliğe tekrar katılır mısınız?"),
        acik("Bir sonraki etkinlik için önerileriniz"),
      ], "Etkinlik Değerlendirme Anketi", "Katılımınız için teşekkürler! Görüşleriniz sonraki etkinliklerimize yön verecek."),
    ],
  },
  {
    id: "siyasi",
    name: "Siyasi Parti",
    description: "Gündem ve seçmen eğilimi, üye ve gönüllü görüşleri, etkinlik değerlendirmesi",
    emoji: "🗳️",
    sectors: ["Siyasi Parti"],
    surveys: [
      hazir("siyasi", "sp-gundem", "Gündem ve öncelikler", "Vatandaşların öncelikli sorunları ve beklentileri", () => [
        secim("Sizce ülkemizin en önemli sorunu nedir?", ["Ekonomi ve hayat pahalılığı", "İşsizlik", "Eğitim", "Sağlık", "Adalet ve hukuk", "Göç", "Çevre ve iklim", "Diğer"]),
        secim("Sizce yaşadığınız şehrin en önemli sorunu nedir?", ["Ulaşım ve trafik", "Konut ve kira", "Altyapı", "İşsizlik", "Çevre ve temizlik", "Eğitim imkânları", "Sağlık hizmetleri", "Diğer"]),
        secim("Oy verirken sizin için en önemli olan nedir?", ["Partinin programı ve vaatleri", "Aday", "Parti lideri", "Yerel hizmetler", "Ekonomi politikası", "Diğer"]),
        secim("Bir sonraki seçimde oy vereceğiniz partiye karar verdiniz mi?", ["Evet, kararımı verdim", "Henüz karar vermedim", "Oy kullanmayı düşünmüyorum"]),
        puan("Siyasetin sorunlarınızı çözebileceğine ne kadar inanıyorsunuz?"),
        yasGrubu(),
        cinsiyet(),
        acik("Siyasetçilerden en çok ne bekliyorsunuz?"),
      ], "Gündem ve Öncelikler Anketi", "Bu anket anonimdir; kimlik bilgileriniz kaydedilmez. Görüşleriniz yalnızca toplu olarak değerlendirilir."),
      hazir("siyasi", "sp-uye", "Üye ve gönüllü görüşü", "Teşkilat çalışmaları ve iletişim hakkında", () => [
        secim("Partimizle ilişkiniz nedir?", ["Üyeyim", "Gönüllüyüm", "Destekçiyim", "Görevliyim"]),
        puan("Teşkilat çalışmalarından ne kadar memnunsunuz?"),
        puan("Parti yönetimiyle iletişim ne kadar yeterli?"),
        coklu("Hangi çalışmalarda yer almak istersiniz?", ["Saha ve kapı kapı ziyaret", "Sosyal medya", "Etkinlik organizasyonu", "Gençlik çalışmaları", "Kadın çalışmaları", "Seçim günü görevleri", "Eğitim ve seminer"]),
        evetHayir("Görüşlerinizin dikkate alındığını düşünüyor musunuz?"),
        yasGrubu(),
        acik("Teşkilatımızın daha iyi çalışması için önerileriniz"),
      ], "Üye ve Gönüllü Görüş Anketi", "Görüşleriniz teşkilat çalışmalarımızı güçlendirmemize yardımcı olacak. Anket anonimdir."),
      hazir("siyasi", "sp-proje", "Proje / vaat görüşü", "Bir proje ya da politika önerisine destek ölçümü", () => [
        puan("Önerilen projeyi ne kadar destekliyorsunuz?", { description: "Projeyi kısaca buraya yazabilirsiniz." }),
        secim("Bu proje sizin ve ailenizin hayatını nasıl etkiler?", ["Olumlu etkiler", "Etkilemez", "Olumsuz etkiler", "Fikrim yok"]),
        coklu("Projede en önemli gördüğünüz konular hangileri?", ["Maliyeti", "Uygulanabilirliği", "Çevreye etkisi", "Herkese eşit fayda", "Hızlı sonuç vermesi"]),
        evetHayir("Bu proje oy tercihinizi etkiler mi?"),
        acik("Projeyle ilgili önerileriniz ya da endişeleriniz"),
      ], "Proje Görüş Anketi", "Bu anket anonimdir. Görüşleriniz projeyi şekillendirmemize yardımcı olacak."),
      hazir("siyasi", "sp-etkinlik", "Miting / etkinlik değerlendirme", "Miting, toplantı ve ziyaretler için", () => [
        soru("kisa_metin", "Katıldığınız etkinlik", { required: false }),
        puan("Etkinliği genel olarak nasıl değerlendirirsiniz?"),
        puan("Konuşmalar ve verilen mesajlar ne kadar açık ve anlaşılırdı?"),
        evetHayir("Etkinlikten sonra partimize bakışınız olumlu yönde değişti mi?"),
        acik("Eklemek istedikleriniz"),
      ], "Etkinlik Değerlendirme Anketi", "Katılımınız için teşekkür ederiz. Anket anonimdir."),
    ],
  },
  {
    id: "stk",
    name: "STK / Dernek",
    description: "Üye memnuniyeti, gönüllü ve bağışçı görüşleri, eğitim değerlendirmesi",
    emoji: "🤝",
    sectors: ["Sivil Toplum / Dernek"],
    surveys: [
      hazir("stk", "stk-uye", "Üye memnuniyeti", "Derneğin çalışmalarından memnuniyet", () => [
        secim("Ne kadar süredir üyemizsiniz?", ["1 yıldan az", "1–3 yıl", "3–5 yıl", "5 yıldan fazla"]),
        puan("Derneğimizin çalışmalarından genel olarak ne kadar memnunsunuz?"),
        puan("Dernekle ilgili gelişmelerden ne kadar haberdar oluyorsunuz?"),
        coklu("Hangi faaliyetlerimize katıldınız?", ["Genel kurul", "Eğitim ve seminerler", "Sosyal etkinlikler", "Yardım kampanyaları", "Proje çalışmaları"]),
        secim("Bizden haberleri hangi yolla almak istersiniz?", ["E-posta", "WhatsApp", "SMS", "Sosyal medya", "İnternet sitesi"]),
        evetHayir("Derneğimizi tanıdıklarınıza önerir misiniz?"),
        acik("Derneğimizin daha iyi olması için önerileriniz"),
      ], "Üye Memnuniyet Anketi", "Görüşleriniz derneğimizin çalışmalarını iyileştirmemize yardımcı olacak."),
      hazir("stk", "stk-gonullu", "Gönüllü geri bildirimi", "Gönüllülerin deneyimi ve beklentileri", () => [
        puan("Gönüllü olarak çalışmaktan ne kadar memnunsunuz?"),
        puan("Size verilen görev ve bilgilendirme ne kadar açıktı?"),
        coklu("Hangi alanlarda gönüllü olmak istersiniz?", ["Saha çalışması", "Sosyal medya ve tanıtım", "Eğitim verme", "Bağış toplama", "Etkinlik organizasyonu", "Ofis işleri"]),
        secim("Haftada ne kadar zaman ayırabilirsiniz?", ["2 saatten az", "2–5 saat", "5–10 saat", "10 saatten fazla"]),
        evetHayir("Gönüllülüğe devam etmeyi düşünüyor musunuz?"),
        acik("Gönüllü deneyimini iyileştirmek için önerileriniz"),
      ], "Gönüllü Geri Bildirim Anketi", "Emeğiniz için teşekkürler! Görüşleriniz bizim için çok değerli."),
      hazir("stk", "stk-bagis", "Bağışçı anketi", "Bağışçıların beklentileri ve güveni", () => [
        secim("Ne sıklıkla bağış yapıyorsunuz?", ["İlk kez yaptım", "Yılda bir", "Birkaç ayda bir", "Her ay düzenli"]),
        puan("Bağışlarınızın nasıl kullanıldığı konusunda ne kadar bilgilendiriliyorsunuz?"),
        puan("Kurumumuza ne kadar güveniyorsunuz?"),
        secim("Bağış yaparken en çok hangi yolu tercih edersiniz?", ["Banka havalesi / EFT", "Kredi kartı", "Elden", "SMS ile bağış"]),
        coklu("Hangi alanlara bağış yapmak istersiniz?", ["Eğitim", "Sağlık", "Gıda yardımı", "Afet yardımı", "Hayvan hakları", "Çevre"]),
        acik("Bağışçı deneyimini iyileştirmek için önerileriniz"),
      ], "Bağışçı Anketi", "Desteğiniz için teşekkür ederiz. Anket anonimdir."),
      hazir("stk", "stk-egitim", "Eğitim / seminer değerlendirme", "Verilen eğitimin değerlendirmesi", () => [
        soru("kisa_metin", "Katıldığınız eğitimin adı", { required: false }),
        puan("Eğitimi genel olarak nasıl değerlendirirsiniz?"),
        puan("Eğitmenin konuyu anlatışı nasıldı?"),
        evetHayir("Eğitimde öğrendiklerinizi kullanabileceğinizi düşünüyor musunuz?"),
        acik("Hangi konularda eğitim almak istersiniz?"),
      ], "Eğitim Değerlendirme Anketi", "Katılımınız için teşekkürler!"),
    ],
  },
  {
    id: "isletme",
    name: "İşletme",
    description: "Müşteri memnuniyeti, çalışan memnuniyeti, ürün ve hizmet geri bildirimi",
    emoji: "🏢",
    sectors: ["Perakende", "Üretim / Sanayi", "Bilişim / Yazılım", "Finans / Sigorta", "Turizm / Otelcilik", "Lojistik", "Danışmanlık", "Sağlık"],
    surveys: [
      fromTemplate("isletme", "musteri", "Müşteri memnuniyeti", "Tavsiye skoru (NPS) ve hizmet kalitesi"),
      fromTemplate("isletme", "calisan", "Çalışan memnuniyeti", "Çalışma ortamı ve bağlılık"),
      hazir("isletme", "isl-urun", "Ürün / hizmet geri bildirimi", "Bir ürün ya da hizmet hakkında görüş", () => [
        soru("kisa_metin", "Hangi ürün ya da hizmetimizi kullandınız?", { required: false }),
        puan("Ürün / hizmetin kalitesinden ne kadar memnunsunuz?"),
        puan("Fiyat–performans dengesini nasıl buluyorsunuz?"),
        secim("Bizi nereden duydunuz?", ["İnternet araması", "Sosyal medya", "Arkadaş tavsiyesi", "Reklam", "Mağaza / şube", "Diğer"]),
        evetHayir("Tekrar satın alır mısınız?"),
        acik("Neyi geliştirmemizi istersiniz?"),
      ], "Ürün ve Hizmet Geri Bildirim Anketi", "Görüşleriniz ürünlerimizi geliştirmemize yardımcı olacak.", false),
    ],
  },
  {
    id: "genel",
    name: "Genel",
    description: "Eğitim kurumları, etkinlikler ve diğer tüm konular için",
    emoji: "📋",
    sectors: ["Eğitim", "Diğer"],
    surveys: [
      fromTemplate("genel", "etkinlik", "Etkinlik değerlendirme", "Etkinlik veya eğitim sonrası"),
      hazir("genel", "gen-gorus", "Genel görüş anketi", "Herhangi bir konuda görüş toplama", () => [
        puan("Konu hakkında genel olarak ne düşünüyorsunuz?", { description: "1: Hiç olumlu değil · 5: Çok olumlu" }),
        secim("Bu konu sizin için ne kadar önemli?", ["Çok önemli", "Önemli", "Az önemli", "Önemli değil"]),
        evetHayir("Bu konuda daha fazla bilgi almak ister misiniz?"),
        yasGrubu(),
        acik("Görüş ve önerileriniz"),
      ], "Görüş Anketi", "Görüşleriniz bizim için önemli. Anket yaklaşık 2 dakika sürer."),
    ],
  },
];

function fromTemplate(category: CategoryId, templateId: string, name: string, description: string): ReadySurvey {
  const t = TEMPLATES.find((x) => x.id === templateId)!;
  return {
    id: `${category}-${templateId}`,
    name,
    description,
    build: () => {
      const s = t.build();
      return { ...s, settings: { ...s.settings, category } };
    },
  };
}

export const categoryById = (id: string | undefined) => CATEGORIES.find((c) => c.id === id);

/** Kurumun sektörüne göre önerilen kategori */
export function suggestedCategory(sector: string | undefined): CategoryId | undefined {
  return CATEGORIES.find((c) => sector && c.sectors.includes(sector))?.id;
}

export function blankSurvey(category?: CategoryId): SurveyInput {
  return { title: "Adsız anket", description: "", status: "taslak", settings: { ...DEFAULT_SETTINGS, category }, questions: [] };
}
