import type {
  ID,
  Invitation,
  Membership,
  Organization,
  OrganizationInput,
  OrgRole,
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
  updateProfile(userId: ID, patch: Partial<Pick<User, "fullName">>): Promise<User>;

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
