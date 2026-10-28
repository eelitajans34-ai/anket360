import type {
  ID,
  Membership,
  Organization,
  OrganizationInput,
  SignUpInput,
  Survey,
  SurveyInput,
  SurveyResponse,
  User,
} from "@/lib/types";
import { isValidEmail, passwordIssues, slugify, uid } from "@/lib/utils";
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
  surveys: Survey[];
  responses: SurveyResponse[];
}

const DB_KEY = "anket360:db";
const SESSION_KEY = "anket360:session";

function emptyDB(): DB {
  return { version: 1, users: [], organizations: [], memberships: [], surveys: [], responses: [] };
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
  return { id: u.id, email: u.email, fullName: u.fullName, createdAt: u.createdAt };
}

export class LocalStore implements DataStore {
  constructor(private storage: Storage = localStorage) {}

  private read(): DB {
    try {
      const raw = this.storage.getItem(DB_KEY);
      if (!raw) return emptyDB();
      const parsed = JSON.parse(raw) as DB;
      return parsed.version === 1 ? parsed : emptyDB();
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

  async updateProfile(userId: ID, patch: Partial<Pick<User, "fullName">>): Promise<User> {
    return this.mutate((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new DataError("not_found", "Kullanıcı bulunamadı.");
      if (patch.fullName !== undefined) {
        if (patch.fullName.trim().length < 2) throw new DataError("validation", "Ad soyad en az 2 karakter olmalı.");
        user.fullName = patch.fullName.trim();
      }
      return publicUser(user);
    });
  }

  // ---------- Kurumlar ----------

  async createOrganization(userId: ID, input: OrganizationInput): Promise<Organization> {
    validateOrg(input);
    return this.mutate((db) => {
      if (!db.users.some((u) => u.id === userId)) throw new DataError("unauthorized", "Oturum bulunamadı.");
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
    return this.read().responses.filter((r) => r.surveyId === surveyId);
  }
}

function validateOrg(input: OrganizationInput) {
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
  if (input.status === "yayinda" && input.questions.length === 0) {
    throw new DataError("validation", "Yayınlamak için en az bir soru ekleyin.");
  }
}
