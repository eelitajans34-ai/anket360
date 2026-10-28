import type {
  AccountStatus,
  AdminOrganization,
  AdminUser,
  Answers,
  Benchmark,
  ID,
  Invitation,
  Membership,
  Organization,
  OrganizationInput,
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
import { isValidEmail, passwordIssues, slugify, uid } from "@/lib/utils";
import { cleanAnswers, isPastEndDate, missingRequired } from "@/lib/answers";
import { conditionError } from "@/lib/conditions";
import { DEFAULT_PLANS, SUPER_ADMIN_EMAILS, orgUsable } from "@/lib/platform";
import { isBankMethod, type PaymentMethodId } from "@/lib/payments/methods";
import { DataError, type DataStore } from "./store";

/**
 * Tarayıcının localStorage alanını kullanan geliştirme/demo veri katmanı.
 * Şifreler tuzlanmış SHA-256 ile saklanır; bu yalnızca yerel geliştirme
 * içindir, gerçek kimlik doğrulama Supabase Auth ile yapılacaktır.
 */

interface StoredUser extends User {
  passwordHash: string;
  salt: string;
}

interface DB {
  version: 1;
  users: StoredUser[];
  organizations: Organization[];
  memberships: Membership[];
  invitations: Invitation[];
  surveys: Survey[];
  responses: Array<SurveyResponse & { respondentId?: ID }>;
  plans: Plan[];
  paymentSettings: PaymentSettings;
  payments: Payment[];
}

const DB_KEY = "anket360:db";
const SESSION_KEY = "anket360:session";

function emptyDB(): DB {
  return {
    version: 1, users: [], organizations: [], memberships: [], invitations: [], surveys: [], responses: [],
    plans: structuredClone(DEFAULT_PLANS),
    paymentSettings: { bankName: "", accountHolder: "", iban: "", note: "" },
    payments: [],
  };
}

function now() {
  return new Date().toISOString();
}

async function hash(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function publicUser(u: StoredUser): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    createdAt: u.createdAt,
    phone: u.phone,
    status: u.status ?? "aktif",
    frozenBy: u.frozenBy,
    kvkkConsentAt: u.kvkkConsentAt,
    isSuperAdmin: SUPER_ADMIN_EMAILS.includes(u.email),
  };
}

/** Eski kayıtlarda bulunmayan alanları varsayılanlarla tamamlar */
function normalizeOrg(o: Organization): Organization {
  return { ...o, planId: o.planId ?? "baslangic", status: o.status ?? "aktif" };
}

const LIMIT_MSG = (n: number) => `Paketinizde aynı anda en fazla ${n} anket yayında olabilir. Bir anketi kapatın ya da paketinizi yükseltin.`;

export class LocalStore implements DataStore {
  constructor(private storage: Storage = localStorage) {}

  private read(): DB {
    try {
      const raw = this.storage.getItem(DB_KEY);
      if (!raw) return emptyDB();
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version !== 1) return emptyDB();
      const db = { ...emptyDB(), ...parsed };
      db.organizations = db.organizations.map(normalizeOrg);
      db.payments = db.payments.map((p) => ({ ...p, method: p.method ?? "havale" }));
      return db;
    } catch {
      return emptyDB();
    }
  }

  private write(db: DB) {
    this.storage.setItem(DB_KEY, JSON.stringify(db));
  }

  private mutate<T>(fn: (db: DB) => T): T {
    const db = this.read();
    const result = fn(db);
    this.write(db);
    return result;
  }

  // ---------- Kimlik doğrulama ----------

  async signUp(input: SignUpInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (fullName.length < 2) throw new DataError("validation", "Ad soyad en az 2 karakter olmalı.");
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    const issues = passwordIssues(input.password);
    if (issues.length) throw new DataError("validation", `Şifre: ${issues.join(", ").toLocaleLowerCase("tr-TR")}.`);

    const db = this.read();
    if (db.users.some((u) => u.email === email)) {
      throw new DataError("email_in_use", "Bu e-posta adresiyle kayıtlı bir hesap zaten var.");
    }
    const salt = uid();
    const user: StoredUser = {
      id: uid(),
      email,
      fullName,
      createdAt: now(),
      status: "aktif",
      kvkkConsentAt: input.kvkkConsent ? now() : undefined,
      salt,
      passwordHash: await hash(input.password, salt),
    };
    db.users.push(user);
    this.write(db);
    this.storage.setItem(SESSION_KEY, user.id);
    return publicUser(user);
  }

  async signIn(emailRaw: string, password: string): Promise<User> {
    const email = emailRaw.trim().toLowerCase();
    const user = this.read().users.find((u) => u.email === email);
    if (!user || (await hash(password, user.salt)) !== user.passwordHash) {
      throw new DataError("invalid_credentials", "E-posta veya şifre hatalı.");
    }
    this.storage.setItem(SESSION_KEY, user.id);
    return publicUser(user);
  }

  async signOut(): Promise<void> {
    this.storage.removeItem(SESSION_KEY);
  }

  async currentUser(): Promise<User | null> {
    const id = this.storage.getItem(SESSION_KEY);
    if (!id) return null;
    const user = this.read().users.find((u) => u.id === id);
    return user ? publicUser(user) : null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    // Yerel modda e-posta gönderilmez. Güvenlik gereği hesabın var olup
    // olmadığı bilgisi dışarı verilmez.
  }

  async updatePassword(newPassword: string): Promise<void> {
    const issues = passwordIssues(newPassword);
    if (issues.length) throw new DataError("validation", `Şifre: ${issues.join(", ").toLocaleLowerCase("tr-TR")}.`);
    const id = this.storage.getItem(SESSION_KEY);
    const db = this.read();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new DataError("unauthorized", "Şifre değiştirmek için oturum açın.");
    user.salt = uid();
    user.passwordHash = await hash(newPassword, user.salt);
    this.write(db);
  }

  async updateProfile(userId: ID, patch: Partial<Pick<User, "fullName" | "phone">>): Promise<User> {
    return this.mutate((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new DataError("not_found", "Kullanıcı bulunamadı.");
      if (patch.fullName !== undefined) {
        if (patch.fullName.trim().length < 2) throw new DataError("validation", "Ad soyad en az 2 karakter olmalı.");
        user.fullName = patch.fullName.trim();
      }
      if (patch.phone !== undefined) {
        const phone = patch.phone.trim();
        if (phone && !/^[\d\s()+-]{10,}$/.test(phone)) throw new DataError("validation", "Geçerli bir telefon numarası girin.");
        user.phone = phone || undefined;
      }
      return publicUser(user);
    });
  }

  async freezeMyAccount(): Promise<void> {
    this.mutate((db) => {
      const u = this.sessionUser(db);
      if (u.status === "aktif") Object.assign(u, { status: "donduruldu", frozenBy: "kullanici" });
    });
  }

  async reactivateMyAccount(): Promise<void> {
    this.mutate((db) => {
      const u = this.sessionUser(db);
      if (u.status !== "donduruldu" || u.frozenBy !== "kullanici") {
        throw new DataError("forbidden", "Hesabınız platform yöneticisi tarafından kısıtlandı. Destek ile iletişime geçin.");
      }
      Object.assign(u, { status: "aktif", frozenBy: undefined });
    });
  }

  async deleteMyAccount(): Promise<void> {
    const id = this.storage.getItem(SESSION_KEY);
    if (!id) throw new DataError("unauthorized", "Oturum gerekli.");
    this.mutate((db) => removeUser(db, id));
    this.storage.removeItem(SESSION_KEY);
  }

  private sessionUser(db: DB): StoredUser {
    const u = db.users.find((x) => x.id === this.storage.getItem(SESSION_KEY));
    if (!u) throw new DataError("unauthorized", "Oturum gerekli.");
    return u;
  }

  private isSuperAdmin(db: DB): boolean {
    const u = db.users.find((x) => x.id === this.storage.getItem(SESSION_KEY));
    return !!u && SUPER_ADMIN_EMAILS.includes(u.email) && (u.status ?? "aktif") === "aktif";
  }

  private requireSuperAdmin(db: DB) {
    if (!this.isSuperAdmin(db)) throw new DataError("forbidden", "Bu işlem için platform yöneticisi yetkisi gerekir.");
  }

  /** Anket ekleme/düzenlemede kurum kuralları (süper yönetici hariç) */
  private checkSurveyWrite(db: DB, orgId: ID, surveyId: ID | null, status: string) {
    if (this.isSuperAdmin(db)) return;
    const org = db.organizations.find((o) => o.id === orgId);
    if (!org) throw new DataError("not_found", "Kurum bulunamadı.");
    if (!orgUsable(org)) throw new DataError("forbidden", "Kurumunuzun aboneliği aktif değil. Abonelik sayfasından paketinizi yenileyin.");
    const was = surveyId ? db.surveys.find((s) => s.id === surveyId)?.status : undefined;
    if (status === "yayinda" && was !== "yayinda") {
      const limit = db.plans.find((p) => p.id === org.planId)?.maxActiveSurveys ?? null;
      const active = db.surveys.filter((s) => s.orgId === orgId && s.status === "yayinda" && s.id !== surveyId).length;
      if (limit !== null && active >= limit) throw new DataError("forbidden", LIMIT_MSG(limit));
    }
  }

  // ---------- Kurumlar ----------

  async createOrganization(userId: ID, input: OrganizationInput): Promise<Organization> {
    validateOrg(input);
    return this.mutate((db) => {
      const owner = db.users.find((u) => u.id === userId);
      if (!owner) throw new DataError("unauthorized", "Oturum bulunamadı.");
      if ((owner.status ?? "aktif") !== "aktif") throw new DataError("forbidden", "Hesabınız aktif değil.");
      const base = slugify(input.name) || "kurum";
      let slug = base;
      for (let i = 2; db.organizations.some((o) => o.slug === slug); i++) slug = `${base}-${i}`;
      const org: Organization = {
        id: uid(),
        name: input.name.trim(),
        slug,
        sector: input.sector,
        size: input.size,
        city: input.city.trim(),
        phone: input.phone?.trim() || undefined,
        website: input.website?.trim() || undefined,
        ownerId: userId,
        createdAt: now(),
        planId: "baslangic",
        status: "aktif",
      };
      db.organizations.push(org);
      db.memberships.push({ orgId: org.id, userId, role: "sahip", createdAt: now() });
      return org;
    });
  }

  async updateOrganization(orgId: ID, patch: Partial<OrganizationInput>): Promise<Organization> {
    return this.mutate((db) => {
      const org = db.organizations.find((o) => o.id === orgId);
      if (!org) throw new DataError("not_found", "Kurum bulunamadı.");
      const merged = { ...org, ...patch };
      validateOrg(merged);
      Object.assign(org, {
        name: merged.name.trim(),
        sector: merged.sector,
        size: merged.size,
        city: merged.city.trim(),
        phone: merged.phone?.trim() || undefined,
        website: merged.website?.trim() || undefined,
      });
      return { ...org };
    });
  }

  async listMyOrganizations(userId: ID) {
    const db = this.read();
    // Dondurulan / engellenen hesap kurum verilerine erişemez
    if ((db.users.find((u) => u.id === userId)?.status ?? "aktif") !== "aktif") return [];
    return db.memberships
      .filter((m) => m.userId === userId)
      .flatMap((m) => {
        const org = db.organizations.find((o) => o.id === m.orgId);
        return org ? [{ ...org, role: m.role }] : [];
      });
  }

  async listMembers(orgId: ID) {
    const db = this.read();
    return db.memberships
      .filter((m) => m.orgId === orgId)
      .flatMap((m) => {
        const u = db.users.find((x) => x.id === m.userId);
        return u ? [{ ...m, user: publicUser(u) }] : [];
      });
  }

  async removeMember(orgId: ID, userId: ID): Promise<void> {
    this.mutate((db) => {
      const m = db.memberships.find((x) => x.orgId === orgId && x.userId === userId);
      if (!m) throw new DataError("not_found", "Üye bulunamadı.");
      if (m.role === "sahip") throw new DataError("forbidden", "Kurum sahibi kurumdan çıkarılamaz.");
      db.memberships = db.memberships.filter((x) => x !== m);
    });
  }

  // ---------- Davetler ----------

  async createInvitation(orgId: ID, invitedBy: ID, emailRaw: string, role: Invitation["role"]): Promise<Invitation> {
    const email = emailRaw.trim().toLowerCase();
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    return this.mutate((db) => {
      const already = db.memberships.some((m) => m.orgId === orgId && db.users.find((u) => u.id === m.userId)?.email === email);
      if (already) throw new DataError("validation", "Bu kişi zaten kurumun üyesi.");
      if (db.invitations.some((i) => i.orgId === orgId && i.email === email && !i.acceptedAt)) {
        throw new DataError("validation", "Bu e-posta adresine bekleyen bir davet zaten var.");
      }
      const inv: Invitation = { id: uid(), orgId, email, role, token: uid().replace(/-/g, ""), invitedBy, createdAt: now() };
      db.invitations.push(inv);
      return inv;
    });
  }

  async listInvitations(orgId: ID): Promise<Invitation[]> {
    return this.read().invitations.filter((i) => i.orgId === orgId && !i.acceptedAt);
  }

  async revokeInvitation(id: ID): Promise<void> {
    this.mutate((db) => {
      db.invitations = db.invitations.filter((i) => i.id !== id);
    });
  }

  async sendInvitationEmail(): Promise<"kapali"> {
    // Demo modunda e-posta gönderilmez
    return "kapali";
  }

  async acceptInvitation(token: string, userId: ID): Promise<ID> {
    return this.mutate((db) => {
      const inv = db.invitations.find((i) => i.token === token && !i.acceptedAt);
      if (!inv) throw new DataError("not_found", "Davet bulunamadı veya daha önce kullanılmış.");
      const user = db.users.find((u) => u.id === userId);
      if (!user || user.email !== inv.email) {
        throw new DataError("forbidden", `Bu davet ${inv.email} adresine gönderildi. O adresle giriş yapın.`);
      }
      if (!db.memberships.some((m) => m.orgId === inv.orgId && m.userId === userId)) {
        db.memberships.push({ orgId: inv.orgId, userId, role: inv.role, createdAt: now() });
      }
      inv.acceptedAt = now();
      return inv.orgId;
    });
  }

  // ---------- Anketler ----------

  async listSurveys(orgId: ID): Promise<Survey[]> {
    return this.read()
      .surveys.filter((s) => s.orgId === orgId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSurvey(id: ID): Promise<Survey | null> {
    return this.read().surveys.find((s) => s.id === id) ?? null;
  }

  async createSurvey(orgId: ID, userId: ID, input: SurveyInput): Promise<Survey> {
    validateSurvey(input);
    return this.mutate((db) => {
      if (!db.organizations.some((o) => o.id === orgId)) throw new DataError("not_found", "Kurum bulunamadı.");
      this.checkSurveyWrite(db, orgId, null, input.status);
      const survey: Survey = {
        ...structuredClone(input),
        title: input.title.trim(),
        id: uid(),
        orgId,
        createdBy: userId,
        createdAt: now(),
        updatedAt: now(),
      };
      db.surveys.push(survey);
      return survey;
    });
  }

  async updateSurvey(id: ID, input: Partial<SurveyInput>): Promise<Survey> {
    return this.mutate((db) => {
      const s = db.surveys.find((x) => x.id === id);
      if (!s) throw new DataError("not_found", "Anket bulunamadı.");
      const merged = { ...s, ...structuredClone(input) };
      validateSurvey(merged);
      this.checkSurveyWrite(db, s.orgId, s.id, merged.status);
      Object.assign(s, merged, { title: merged.title.trim(), updatedAt: now() });
      return { ...s };
    });
  }

  async duplicateSurvey(id: ID, userId: ID): Promise<Survey> {
    const s = await this.getSurvey(id);
    if (!s) throw new DataError("not_found", "Anket bulunamadı.");
    return this.createSurvey(s.orgId, userId, {
      title: `${s.title} (kopya)`,
      description: s.description,
      status: "taslak",
      settings: s.settings,
      questions: s.questions.map((q) => ({ ...q, id: uid() })),
    });
  }

  async deleteSurvey(id: ID): Promise<void> {
    this.mutate((db) => {
      db.surveys = db.surveys.filter((s) => s.id !== id);
      db.responses = db.responses.filter((r) => r.surveyId !== id);
    });
  }

  async listResponses(surveyId: ID): Promise<SurveyResponse[]> {
    return this.read()
      .responses.filter((r) => r.surveyId === surveyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ---------- Katılımcı ----------

  async getPublicSurvey(id: ID): Promise<PublicSurvey | null> {
    const db = this.read();
    const s = db.surveys.find((x) => x.id === id);
    if (!s || s.status === "taslak") return null;
    const org = db.organizations.find((o) => o.id === s.orgId);
    if (s.status === "kapali" || isPastEndDate(s.settings.endsAt) || !org || !orgUsable(org)) return { id: s.id, status: "kapali", title: s.title };
    return {
      id: s.id,
      status: "yayinda",
      title: s.title,
      description: s.description,
      questions: s.questions,
      settings: s.settings,
      orgName: org?.name ?? "",
    };
  }

  async submitResponse(surveyId: ID, answers: Answers): Promise<void> {
    const sessionId = this.storage.getItem(SESSION_KEY);
    this.mutate((db) => {
      const s = db.surveys.find((x) => x.id === surveyId);
      if (!s || s.status !== "yayinda") throw new DataError("not_found", "Bu anket şu anda yanıt kabul etmiyor.");
      if (isPastEndDate(s.settings.endsAt)) throw new DataError("not_found", "Bu anketin süresi doldu.");
      const org = db.organizations.find((o) => o.id === s.orgId);
      if (!org || !orgUsable(org)) throw new DataError("not_found", "Bu anket şu anda yanıt kabul etmiyor.");
      const ids = new Set(s.questions.map((q) => q.id));
      if (Object.keys(answers).some((k) => !ids.has(k))) {
        throw new DataError("validation", "Yanıtlar ankette olmayan bir soru içeriyor.");
      }
      const missing = missingRequired(s.questions, answers);
      if (missing.length) {
        const q = s.questions.find((x) => x.id === missing[0])!;
        throw new DataError("validation", `Zorunlu soru yanıtlanmadı: ${q.title}`);
      }
      const respondentId = s.settings.anonymous ? undefined : (sessionId ?? undefined);
      if (respondentId && s.settings.singleResponse && db.responses.some((r) => r.surveyId === s.id && r.respondentId === respondentId)) {
        throw new DataError("validation", "Bu anketi daha önce yanıtladınız.");
      }
      db.responses.push({ id: uid(), surveyId: s.id, respondentId, answers: cleanAnswers(s.questions, answers), createdAt: now() });
    });
  }

  // ---------- Abonelik ve ödeme ----------

  async listPlans(): Promise<Plan[]> {
    const db = this.read();
    return db.plans.filter((p) => p.active || this.isSuperAdmin(db)).sort((a, b) => a.sort - b.sort);
  }

  async getPaymentSettings(): Promise<PaymentSettings> {
    return { ...this.read().paymentSettings };
  }

  async createPayment(orgId: ID, planId: string, note: string, method: PaymentMethodId = "havale"): Promise<Payment> {
    if (!isBankMethod(method)) throw new DataError("validation", "Bu ödeme yöntemi henüz kullanılamıyor.");
    return this.mutate((db) => {
      const u = this.sessionUser(db);
      const m = db.memberships.find((x) => x.orgId === orgId && x.userId === u.id);
      if (!m || m.role === "uye") throw new DataError("forbidden", "Ödeme bildirimini kurum yöneticisi yapabilir.");
      const plan = db.plans.find((p) => p.id === planId);
      if (!plan) throw new DataError("not_found", "Paket bulunamadı.");
      if (plan.price === 0) throw new DataError("validation", "Ücretsiz paket için ödeme bildirimi gerekmez.");
      const pay: Payment = {
        id: uid(), orgId, planId, amount: plan.price, reference: uid().replace(/-/g, "").slice(0, 8).toUpperCase(),
        status: "beklemede", method, note: note.trim(), adminNote: "", createdBy: u.id, createdAt: now(),
      };
      db.payments.push(pay);
      return pay;
    });
  }

  async listPayments(orgId?: ID): Promise<Payment[]> {
    const db = this.read();
    if (!orgId) this.requireSuperAdmin(db);
    return db.payments.filter((p) => !orgId || p.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getBenchmark(statKey: string): Promise<Benchmark> {
    const db = this.read();
    const values: string[] = [];
    let total = 0;
    for (const s of db.surveys) {
      for (const q of s.questions.filter((x) => x.statKey === statKey)) {
        for (const r of db.responses.filter((x) => x.surveyId === s.id)) {
          const a = r.answers[q.id];
          if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) continue;
          total++;
          for (const v of Array.isArray(a) ? a : [a]) values.push(String(v));
        }
      }
    }
    if (total < 10) return { total, insufficient: true };
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const nums = values.filter((v) => /^-?\d+(\.\d+)?$/.test(v)).map(Number);
    return {
      total,
      options: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
    };
  }

  // ---------- Süper yönetici ----------

  async adminListOrganizations(): Promise<AdminOrganization[]> {
    const db = this.read();
    this.requireSuperAdmin(db);
    return db.organizations.map((o) => {
      const owner = db.users.find((u) => u.id === o.ownerId);
      return {
        ...o,
        ownerEmail: owner?.email ?? "",
        ownerName: owner?.fullName ?? "",
        memberCount: db.memberships.filter((m) => m.orgId === o.id).length,
        surveyCount: db.surveys.filter((s) => s.orgId === o.id).length,
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminUpdateOrganization(orgId: ID, patch: { status?: OrgStatus; planId?: string; endsAt?: string | null; adminNote?: string }): Promise<void> {
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      const o = db.organizations.find((x) => x.id === orgId);
      if (!o) throw new DataError("not_found", "Kurum bulunamadı.");
      if (patch.status) o.status = patch.status;
      if (patch.planId) o.planId = patch.planId;
      if (patch.endsAt !== undefined) o.endsAt = patch.endsAt ?? undefined;
      if (patch.adminNote !== undefined) o.adminNote = patch.adminNote;
    });
  }

  async adminDeleteOrganization(orgId: ID): Promise<void> {
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      removeOrg(db, orgId);
    });
  }

  async adminListUsers(): Promise<AdminUser[]> {
    const db = this.read();
    this.requireSuperAdmin(db);
    return db.users.map((u) => ({
      ...publicUser(u),
      organizations: db.memberships.filter((m) => m.userId === u.id).flatMap((m) => {
        const o = db.organizations.find((x) => x.id === m.orgId);
        return o ? [{ id: o.id, name: o.name, role: m.role }] : [];
      }),
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminSetUserStatus(userId: ID, status: AccountStatus): Promise<void> {
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new DataError("not_found", "Kullanıcı bulunamadı.");
      u.status = status;
      u.frozenBy = status === "donduruldu" ? "yonetici" : undefined;
    });
  }

  async adminDeleteUser(userId: ID): Promise<void> {
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new DataError("not_found", "Kullanıcı bulunamadı.");
      if (SUPER_ADMIN_EMAILS.includes(u.email)) throw new DataError("forbidden", "Platform yöneticisi silinemez.");
      removeUser(db, userId);
    });
  }

  async adminDecidePayment(paymentId: ID, approve: boolean, note = ""): Promise<void> {
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      const p = db.payments.find((x) => x.id === paymentId);
      if (!p || p.status !== "beklemede") throw new DataError("not_found", "Bekleyen ödeme bulunamadı.");
      Object.assign(p, { status: approve ? "onaylandi" : "reddedildi", decidedAt: now(), adminNote: note });
      if (approve) {
        const o = db.organizations.find((x) => x.id === p.orgId);
        const plan = db.plans.find((x) => x.id === p.planId);
        if (o && plan) {
          const base = Math.max(Date.now(), o.endsAt ? new Date(o.endsAt).getTime() : 0);
          o.planId = plan.id;
          o.endsAt = new Date(base + plan.periodDays * 86_400_000).toISOString();
          if (o.status === "pasif") o.status = "aktif";
        }
      }
    });
  }

  async adminUpdatePlan(plan: Plan): Promise<void> {
    if (!plan.name.trim()) throw new DataError("validation", "Paket adı boş olamaz.");
    if (!(plan.price >= 0)) throw new DataError("validation", "Fiyat 0 veya daha büyük olmalı.");
    if (!(plan.periodDays > 0)) throw new DataError("validation", "Süre en az 1 gün olmalı.");
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      const i = db.plans.findIndex((p) => p.id === plan.id);
      if (i === -1) throw new DataError("not_found", "Paket bulunamadı.");
      db.plans[i] = { ...plan, name: plan.name.trim() };
    });
  }

  async adminUpdatePaymentSettings(s: PaymentSettings): Promise<void> {
    this.mutate((db) => {
      this.requireSuperAdmin(db);
      db.paymentSettings = { bankName: s.bankName.trim(), accountHolder: s.accountHolder.trim(), iban: s.iban.replace(/\s+/g, "").toUpperCase(), note: s.note.trim() };
    });
  }
}

/** Kurumu ve tüm verilerini siler */
function removeOrg(db: DB, orgId: ID) {
  const surveyIds = new Set(db.surveys.filter((s) => s.orgId === orgId).map((s) => s.id));
  db.surveys = db.surveys.filter((s) => s.orgId !== orgId);
  db.responses = db.responses.filter((r) => !surveyIds.has(r.surveyId));
  db.memberships = db.memberships.filter((m) => m.orgId !== orgId);
  db.invitations = db.invitations.filter((i) => i.orgId !== orgId);
  db.payments = db.payments.filter((p) => p.orgId !== orgId);
  db.organizations = db.organizations.filter((o) => o.id !== orgId);
}

/** Kullanıcıyı ve sahibi olduğu kurumları siler; başka kurumlardaki izleri anonimleştirir */
function removeUser(db: DB, userId: ID) {
  for (const o of db.organizations.filter((x) => x.ownerId === userId)) removeOrg(db, o.id);
  db.memberships = db.memberships.filter((m) => m.userId !== userId);
  db.invitations = db.invitations.filter((i) => i.invitedBy !== userId);
  for (const r of db.responses) if (r.respondentId === userId) delete r.respondentId;
  for (const p of db.payments) if (p.createdBy === userId) delete p.createdBy;
  db.users = db.users.filter((u) => u.id !== userId);
}

export function validateOrg(input: OrganizationInput) {
  if (!input.name || input.name.trim().length < 2) throw new DataError("validation", "Kurum adı en az 2 karakter olmalı.");
  if (!input.sector) throw new DataError("validation", "Sektör seçin.");
  if (!input.size) throw new DataError("validation", "Çalışan sayısını seçin.");
  if (!input.city || !input.city.trim()) throw new DataError("validation", "Şehir girin.");
  if (input.website && input.website.trim() && !/^https?:\/\/\S+\.\S+/.test(input.website.trim())) {
    throw new DataError("validation", "Web sitesi http:// veya https:// ile başlamalı.");
  }
}

export function validateSurvey(input: Pick<SurveyInput, "title" | "questions" | "status">) {
  if (!input.title.trim()) throw new DataError("validation", "Anket başlığı boş olamaz.");
  input.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.title.trim()) throw new DataError("validation", `${n}. sorunun metni boş olamaz.`);
    if (["tek_secim", "coklu_secim", "acilir_liste"].includes(q.type)) {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) throw new DataError("validation", `${n}. soru için en az 2 seçenek girin.`);
      if (new Set(opts.map((o) => o.toLocaleLowerCase("tr-TR"))).size !== opts.length) {
        throw new DataError("validation", `${n}. sorudaki seçenekler birbirinden farklı olmalı.`);
      }
    }
  });
  input.questions.forEach((_, i) => {
    const err = conditionError(input.questions, i);
    if (err) throw new DataError("validation", err);
  });
  if (input.status === "yayinda" && input.questions.length === 0) {
    throw new DataError("validation", "Yayınlamak için en az bir soru ekleyin.");
  }
}
