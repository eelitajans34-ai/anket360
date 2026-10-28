export type ID = string;

export interface User {
  id: ID;
  email: string;
  fullName: string;
  createdAt: string;
}

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

export interface Question {
  id: ID;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  options?: string[];
  /** derecelendirme için en yüksek puan (3–10) */
  scaleMax?: number;
}

export type SurveyStatus = "taslak" | "yayinda" | "kapali";

export interface SurveySettings {
  anonymous: boolean;
  singleResponse: boolean;
  showProgress: boolean;
  endsAt?: string;
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
