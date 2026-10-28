export type ID = string;

export type AccountStatus = "aktif" | "donduruldu" | "engellendi";

export interface User {
  id: ID;
  email: string;
  fullName: string;
  createdAt: string;
  phone?: string;
  status: AccountStatus;
  /** Hesabı kim dondurdu: kullanıcı kendisi mi, platform yöneticisi mi */
  frozenBy?: "kullanici" | "yonetici";
  /** KVKK aydınlatma metni onay zamanı */
  kvkkConsentAt?: string;
  /** Platform (süper) yöneticisi mi */
  isSuperAdmin?: boolean;
}

export type OrgStatus = "aktif" | "pasif" | "donduruldu" | "engellendi";

export type OrgRole = "sahip" | "yonetici" | "uye";

export interface Organization {
  id: ID;
  name: string;
  slug: string;
  sector: string;
  size: string;
  city: string;
  phone?: string;
  website?: string;
  ownerId: ID;
  createdAt: string;
  planId: string;
  status: OrgStatus;
  /** Ücretli paketin bitiş zamanı (ücretsiz pakette yok) */
  endsAt?: string;
  adminNote?: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  periodDays: number;
  /** Aynı anda yayında olabilecek anket sayısı (yoksa sınırsız) */
  maxActiveSurveys: number | null;
  description: string;
  features: string[];
  sort: number;
  active: boolean;
}

export interface PaymentSettings {
  bankName: string;
  accountHolder: string;
  iban: string;
  note: string;
}

export type PaymentStatus = "beklemede" | "onaylandi" | "reddedildi";

export interface Payment {
  id: ID;
  orgId: ID;
  planId: string;
  amount: number;
  reference: string;
  status: PaymentStatus;
  note: string;
  adminNote: string;
  createdBy?: ID;
  createdAt: string;
  decidedAt?: string;
}

/** Genel eğilim: aynı standart soruya tüm anketlerde verilen yanıtların toplamı */
export interface Benchmark {
  total: number;
  insufficient?: boolean;
  options?: Array<{ label: string; count: number }>;
  average?: number | null;
}

/** Süper yönetici listeleri */
export interface AdminOrganization extends Organization {
  ownerEmail: string;
  ownerName: string;
  memberCount: number;
  surveyCount: number;
}
export interface AdminUser extends User {
  organizations: Array<{ id: ID; name: string; role: OrgRole }>;
}

export interface Membership {
  orgId: ID;
  userId: ID;
  role: OrgRole;
  createdAt: string;
}

export type QuestionType =
  | "kisa_metin"
  | "uzun_metin"
  | "tek_secim"
  | "coklu_secim"
  | "acilir_liste"
  | "derecelendirme"
  | "nps"
  | "evet_hayir"
  | "tarih";

export type ConditionOperator =
  | "esittir"
  | "esit_degil"
  | "icerir"
  | "icermez"
  | "buyuk_esit"
  | "kucuk_esit"
  | "yanitlandi"
  | "yanitlanmadi";

/** Soru yalnızca önceki bir sorunun yanıtı bu koşulu sağlıyorsa gösterilir. */
export interface QuestionCondition {
  questionId: ID;
  operator: ConditionOperator;
  value?: string | number;
}

export interface Question {
  id: ID;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  options?: string[];
  /** derecelendirme için en yüksek puan (3–10) */
  scaleMax?: number;
  showIf?: QuestionCondition;
  /** Genel eğilim istatistiği için standart soru anahtarı */
  statKey?: string;
}

export type SurveyStatus = "taslak" | "yayinda" | "kapali";

export interface SurveySettings {
  anonymous: boolean;
  singleResponse: boolean;
  showProgress: boolean;
  endsAt?: string;
  /** Anketin kategorisi: belediye, siyasi, stk, isletme, genel */
  category?: string;
}

export interface Survey {
  id: ID;
  orgId: ID;
  title: string;
  description: string;
  status: SurveyStatus;
  questions: Question[];
  settings: SurveySettings;
  createdBy: ID;
  createdAt: string;
  updatedAt: string;
}

export type AnswerValue = string | string[] | number;
export type Answers = Record<ID, AnswerValue>;

export interface SurveyResponse {
  id: ID;
  surveyId: ID;
  answers: Answers;
  createdAt: string;
}

/** Katılımcıya gösterilen anket bilgisi. Kapalı anketlerde yalnızca başlık döner. */
export type PublicSurvey =
  | { id: ID; status: "kapali"; title: string }
  | (Pick<Survey, "id" | "title" | "description" | "questions" | "settings"> & { status: "yayinda"; orgName: string });

export interface Invitation {
  id: ID;
  orgId: ID;
  email: string;
  role: Exclude<OrgRole, "sahip">;
  token: string;
  invitedBy: ID;
  createdAt: string;
  acceptedAt?: string;
}

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  /** KVKK aydınlatma metni onayı (zamanı veritabanında saklanır) */
  kvkkConsent?: boolean;
}

export interface OrganizationInput {
  name: string;
  sector: string;
  size: string;
  city: string;
  phone?: string;
  website?: string;
}

export type SurveyInput = Pick<Survey, "title" | "description" | "status" | "questions" | "settings">;
