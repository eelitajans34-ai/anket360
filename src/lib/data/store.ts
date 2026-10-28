import type {
  AdminOrganization,
  AdminUser,
  AccountStatus,
  Answers,
  Benchmark,
  ID,
  Invitation,
  Membership,
  Organization,
  OrganizationInput,
  OrgRole,
  OrgStatus,
  Payment,
  PaymentSettings,
  Plan,
  PublicSurvey,
  SignUpInput,
  Survey,
  SurveyInput,
  SurveyResponse,
  User,
} from "@/lib/types";

/**
 * Uygulamanın veri katmanı sözleşmesi. İki uygulaması vardır:
 * LocalStore (tarayıcı localStorage, geliştirme/test) ve SupabaseStore.
 * Hangisinin kullanılacağı src/lib/data/index.ts içinde seçilir.
 */
export interface DataStore {
  // Kimlik doğrulama
  /** E-posta doğrulaması gerekiyorsa oturum açılmaz ve null döner. */
  signUp(input: SignUpInput): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  currentUser(): Promise<User | null>;
  requestPasswordReset(email: string): Promise<void>;
  /** Oturumdaki kullanıcının şifresini değiştirir (şifre sıfırlama bağlantısından sonra). */
  updatePassword(newPassword: string): Promise<void>;
  /** Oturum dışarıdan değiştiğinde (başka sekme, token yenileme) haber verir. */
  onAuthChange?(cb: () => void): () => void;
  updateProfile(userId: ID, patch: Partial<Pick<User, "fullName" | "phone">>): Promise<User>;
  /** Hesabı dondurur (kullanıcı tekrar giriş yapıp açabilir) */
  freezeMyAccount(): Promise<void>;
  reactivateMyAccount(): Promise<void>;
  /** Hesabı ve sahibi olunan kurumları kalıcı olarak siler (KVKK silme hakkı) */
  deleteMyAccount(): Promise<void>;

  // Kurumlar
  createOrganization(userId: ID, input: OrganizationInput): Promise<Organization>;
  updateOrganization(orgId: ID, patch: Partial<OrganizationInput>): Promise<Organization>;
  listMyOrganizations(userId: ID): Promise<Array<Organization & { role: OrgRole }>>;
  listMembers(orgId: ID): Promise<Array<Membership & { user: User }>>;
  removeMember(orgId: ID, userId: ID): Promise<void>;

  // Davetler
  createInvitation(orgId: ID, invitedBy: ID, email: string, role: Invitation["role"]): Promise<Invitation>;
  listInvitations(orgId: ID): Promise<Invitation[]>;
  revokeInvitation(id: ID): Promise<void>;
  /**
   * Davet bağlantısını e-postayla gönderir. E-posta altyapısı yapılandırılmamışsa
   * "kapali" döner (bağlantı elle iletilir).
   */
  sendInvitationEmail(id: ID): Promise<"gonderildi" | "kapali">;
  /** Davet kodunu oturumdaki kullanıcı adına kabul eder, kurum kimliğini döner. */
  acceptInvitation(token: string, userId: ID): Promise<ID>;

  // Anketler
  listSurveys(orgId: ID): Promise<Survey[]>;
  getSurvey(id: ID): Promise<Survey | null>;
  createSurvey(orgId: ID, userId: ID, input: SurveyInput): Promise<Survey>;
  updateSurvey(id: ID, input: Partial<SurveyInput>): Promise<Survey>;
  duplicateSurvey(id: ID, userId: ID): Promise<Survey>;
  deleteSurvey(id: ID): Promise<void>;
  listResponses(surveyId: ID): Promise<SurveyResponse[]>;

  // Abonelik ve ödeme
  listPlans(): Promise<Plan[]>;
  getPaymentSettings(): Promise<PaymentSettings>;
  createPayment(orgId: ID, planId: string, note: string): Promise<Payment>;
  listPayments(orgId?: ID): Promise<Payment[]>;

  /** Genel eğilim istatistiği (en az 10 yanıt yoksa insufficient) */
  getBenchmark(statKey: string): Promise<Benchmark>;

  // Süper yönetici
  adminListOrganizations(): Promise<AdminOrganization[]>;
  adminUpdateOrganization(orgId: ID, patch: { status?: OrgStatus; planId?: string; endsAt?: string | null; adminNote?: string }): Promise<void>;
  adminDeleteOrganization(orgId: ID): Promise<void>;
  adminListUsers(): Promise<AdminUser[]>;
  adminSetUserStatus(userId: ID, status: AccountStatus): Promise<void>;
  adminDeleteUser(userId: ID): Promise<void>;
  adminDecidePayment(paymentId: ID, approve: boolean, note?: string): Promise<void>;
  adminUpdatePlan(plan: Plan): Promise<void>;
  adminUpdatePaymentSettings(s: PaymentSettings): Promise<void>;

  // Katılımcı (giriş gerektirmez)
  /** Taslak veya olmayan anket için null döner. */
  getPublicSurvey(id: ID): Promise<PublicSurvey | null>;
  submitResponse(surveyId: ID, answers: Answers): Promise<void>;
}

export class DataError extends Error {
  constructor(
    public code:
      | "email_in_use"
      | "invalid_credentials"
      | "not_found"
      | "validation"
      | "unauthorized"
      | "forbidden"
      | "network"
      | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}
