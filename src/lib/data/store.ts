import type {
  ID,
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
 * Uygulamanın veri katmanı sözleşmesi. Şu an yalnızca tarayıcıda çalışan
 * LocalStore uygulanmıştır; Supabase uygulaması kullanıcı onayından sonra
 * aynı arayüzle eklenecektir (bkz. docs/SUPABASE-PLANI.md).
 */
export interface DataStore {
  // Kimlik doğrulama
  signUp(input: SignUpInput): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  currentUser(): Promise<User | null>;
  requestPasswordReset(email: string): Promise<void>;
  updateProfile(userId: ID, patch: Partial<Pick<User, "fullName">>): Promise<User>;

  // Kurumlar
  createOrganization(userId: ID, input: OrganizationInput): Promise<Organization>;
  updateOrganization(orgId: ID, patch: Partial<OrganizationInput>): Promise<Organization>;
  listMyOrganizations(userId: ID): Promise<Array<Organization & { role: OrgRole }>>;
  listMembers(orgId: ID): Promise<Array<Membership & { user: User }>>;

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
      | "unauthorized",
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}
