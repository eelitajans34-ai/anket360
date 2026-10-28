import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus, AdminOrganization, AdminUser, Answers, Benchmark, ID, Invitation, OrganizationInput, OrgRole, OrgStatus, Payment, PaymentSettings, Plan, PublicSurvey, SignUpInput, Survey, SurveyInput, User } from "@/lib/types";
import { cleanAnswers } from "@/lib/answers";
import { appUrl, isValidEmail, passwordIssues, slugify } from "@/lib/utils";
import { validateOrg, validateSurvey } from "./local-store";
import { DataError, type DataStore } from "./store";
import {
  fromPlan, toDataError, toInvitation, toMembership, toOrganization, toPayment, toPaymentSettings, toPlan, toResponse, toSurvey, toUser,
  type InvitationRow, type MembershipRow, type OrganizationRow, type PaymentRow, type PaymentSettingsRow, type PlanRow, type ProfileRow, type ResponseRow, type SurveyRow,
} from "./supabase-mappers";

/**
 * Supabase (Auth + PostgREST) üzerinde çalışan veri katmanı.
 * Yetkilendirme veritabanındaki RLS kurallarıyla yapılır (bkz. supabase/schema.sql);
 * istemcideki doğrulamalar yalnızca kullanıcıya hızlı geri bildirim içindir.
 */
export class SupabaseStore implements DataStore {
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string, private link: (path: string) => string = appUrl) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  // ---------- Kimlik doğrulama ----------

  async signUp(input: SignUpInput): Promise<User | null> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (fullName.length < 2) throw new DataError("validation", "Ad soyad en az 2 karakter olmalı.");
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    const issues = passwordIssues(input.password);
    if (issues.length) throw new DataError("validation", `Şifre: ${issues.join(", ").toLocaleLowerCase("tr-TR")}.`);

    const { data, error } = await this.sb.auth.signUp({
      email,
      password: input.password,
      options: { data: { full_name: fullName, kvkk_onay: input.kvkkConsent === true }, emailRedirectTo: this.link("/panel") },
    });
    if (error) throw toDataError(error, "Kayıt oluşturulamadı.");
    // E-posta doğrulaması açıksa ve adres zaten kayıtlıysa Supabase kimlik listesi boş bir kullanıcı döner.
    if (data.user && data.user.identities?.length === 0) {
      throw new DataError("email_in_use", "Bu e-posta adresiyle kayıtlı bir hesap zaten var.");
    }
    if (!data.session) return null; // doğrulama e-postası gönderildi
    return this.currentUser();
  }

  async signIn(email: string, password: string): Promise<User> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw toDataError(error, "Giriş yapılamadı.");
    const user = await this.currentUser();
    if (!user) throw new DataError("unknown", "Profil bilgileri yüklenemedi.");
    return user;
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    if (error) throw toDataError(error);
  }

  async currentUser(): Promise<User | null> {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return null;
    const [{ data, error }, admin] = await Promise.all([
      this.sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle<ProfileRow>(),
      this.sb.rpc("is_super_admin"),
    ]);
    if (error) throw toDataError(error);
    return data ? toUser(data, admin.data === true) : null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: this.link("/sifre-yenile") });
    if (error) throw toDataError(error, "Sıfırlama e-postası gönderilemedi.");
  }

  async updatePassword(newPassword: string): Promise<void> {
    const issues = passwordIssues(newPassword);
    if (issues.length) throw new DataError("validation", `Şifre: ${issues.join(", ").toLocaleLowerCase("tr-TR")}.`);
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) throw toDataError(error, "Şifre güncellenemedi.");
  }

  onAuthChange(cb: () => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      if (event !== "INITIAL_SESSION") cb();
    });
    return () => data.subscription.unsubscribe();
  }

  async updateProfile(userId: ID, patch: Partial<Pick<User, "fullName" | "phone">>): Promise<User> {
    const row: Partial<ProfileRow> = {};
    if (patch.phone !== undefined) {
      const phone = patch.phone.trim();
      if (phone && !/^[\d\s()+-]{10,}$/.test(phone)) throw new DataError("validation", "Geçerli bir telefon numarası girin.");
      row.phone = phone || null;
    }
    if (patch.fullName !== undefined) {
      if (patch.fullName.trim().length < 2) throw new DataError("validation", "Ad soyad en az 2 karakter olmalı.");
      row.full_name = patch.fullName.trim();
    }
    const { data, error } = await this.sb.from("profiles").update(row).eq("id", userId).select().single<ProfileRow>();
    if (error) throw toDataError(error, "Profil güncellenemedi.");
    return toUser(data);
  }

  async freezeMyAccount(): Promise<void> {
    const { error } = await this.sb.rpc("hesabimi_dondur");
    if (error) throw toDataError(error, "Hesap dondurulamadı.");
  }

  async reactivateMyAccount(): Promise<void> {
    const { error } = await this.sb.rpc("hesabimi_etkinlestir");
    if (error) throw toDataError(error, "Hesap açılamadı.");
  }

  async deleteMyAccount(): Promise<void> {
    const { error } = await this.sb.rpc("hesabimi_sil");
    if (error) throw toDataError(error, "Hesap silinemedi.");
    await this.sb.auth.signOut({ scope: "local" });
  }

  // ---------- Kurumlar ----------

  async createOrganization(_userId: ID, input: OrganizationInput) {
    validateOrg(input);
    const { data, error } = await this.sb
      .rpc("create_organization", {
        p_name: input.name,
        p_slug: slugify(input.name) || "kurum",
        p_sector: input.sector,
        p_size: input.size,
        p_city: input.city,
        p_phone: input.phone ?? null,
        p_website: input.website ?? null,
      })
      .single<OrganizationRow>();
    if (error) throw toDataError(error, "Kurum oluşturulamadı.");
    return toOrganization(data);
  }

  async updateOrganization(orgId: ID, patch: Partial<OrganizationInput>) {
    const { data: current, error: readError } = await this.sb.from("organizations").select("*").eq("id", orgId).maybeSingle<OrganizationRow>();
    if (readError) throw toDataError(readError);
    if (!current) throw new DataError("not_found", "Kurum bulunamadı.");
    validateOrg({ ...toOrganization(current), ...patch });
    const row: Partial<OrganizationRow> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.sector !== undefined) row.sector = patch.sector;
    if (patch.size !== undefined) row.size = patch.size;
    if (patch.city !== undefined) row.city = patch.city.trim();
    if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
    if (patch.website !== undefined) row.website = patch.website.trim() || null;
    const { data, error } = await this.sb.from("organizations").update(row).eq("id", orgId).select().single<OrganizationRow>();
    if (error) throw toDataError(error, "Kurum güncellenemedi.");
    return toOrganization(data);
  }

  async listMyOrganizations(userId: ID) {
    const { data, error } = await this.sb
      .from("memberships")
      .select("role, organizations(*)")
      .eq("user_id", userId)
      .order("created_at")
      .returns<Array<{ role: MembershipRow["role"]; organizations: OrganizationRow | null }>>();
    if (error) throw toDataError(error);
    return data.flatMap((m) => (m.organizations ? [{ ...toOrganization(m.organizations), role: m.role }] : []));
  }

  async listMembers(orgId: ID) {
    const { data, error } = await this.sb
      .from("memberships")
      .select("*, profiles(*)")
      .eq("org_id", orgId)
      .order("created_at")
      .returns<Array<MembershipRow & { profiles: ProfileRow | null }>>();
    if (error) throw toDataError(error);
    return data.flatMap((m) => (m.profiles ? [{ ...toMembership(m), user: toUser(m.profiles) }] : []));
  }

  async removeMember(orgId: ID, userId: ID): Promise<void> {
    const { data, error } = await this.sb.from("memberships").delete().eq("org_id", orgId).eq("user_id", userId).select();
    if (error) throw toDataError(error, "Üye çıkarılamadı.");
    if (!data.length) throw new DataError("forbidden", "Bu üyeyi çıkarma yetkiniz yok.");
  }

  // ---------- Davetler ----------

  async createInvitation(orgId: ID, invitedBy: ID, emailRaw: string, role: Invitation["role"]): Promise<Invitation> {
    const email = emailRaw.trim().toLowerCase();
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    const members = await this.listMembers(orgId);
    if (members.some((m) => m.user.email === email)) throw new DataError("validation", "Bu kişi zaten kurumun üyesi.");
    const { data, error } = await this.sb
      .from("invitations")
      .insert({ org_id: orgId, email, role, invited_by: invitedBy })
      .select()
      .single<InvitationRow>();
    if (error) {
      if (error.code === "23505") throw new DataError("validation", "Bu e-posta adresine bekleyen bir davet zaten var.");
      throw toDataError(error, "Davet oluşturulamadı.");
    }
    return toInvitation(data);
  }

  async listInvitations(orgId: ID): Promise<Invitation[]> {
    const { data, error } = await this.sb
      .from("invitations")
      .select("*")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .returns<InvitationRow[]>();
    if (error) throw toDataError(error);
    return data.map(toInvitation);
  }

  async revokeInvitation(id: ID): Promise<void> {
    const { error } = await this.sb.from("invitations").delete().eq("id", id);
    if (error) throw toDataError(error, "Davet iptal edilemedi.");
  }

  async sendInvitationEmail(id: ID): Promise<"gonderildi" | "kapali"> {
    const { error } = await this.sb.functions.invoke("davet-e-postasi", { body: { invitationId: id } });
    if (!error) return "gonderildi";
    // FunctionsHttpError: fonksiyonun döndüğü yanıt context'te
    const res = (error as { context?: Response }).context;
    if (res && typeof res.status === "number") {
      const body = await safeJson(res);
      // 503: sağlayıcı tanımlı değil · kodsuz 404: fonksiyon henüz yüklenmemiş
      if (res.status === 503 || body?.code === "eposta_kapali" || (res.status === 404 && !body?.code)) return "kapali";
      throw new DataError(res.status === 429 ? "validation" : "unknown", body?.message ?? "Davet e-postası gönderilemedi.");
    }
    throw toDataError(error, "Davet e-postası gönderilemedi.");
  }

  async acceptInvitation(token: string): Promise<ID> {
    const { data, error } = await this.sb.rpc("accept_invitation", { p_token: token });
    if (error) throw toDataError(error, "Davet kabul edilemedi.");
    return data as ID;
  }

  // ---------- Anketler ----------

  async listSurveys(orgId: ID): Promise<Survey[]> {
    const { data, error } = await this.sb.from("surveys").select("*").eq("org_id", orgId).order("updated_at", { ascending: false }).returns<SurveyRow[]>();
    if (error) throw toDataError(error);
    return data.map(toSurvey);
  }

  async getSurvey(id: ID): Promise<Survey | null> {
    const { data, error } = await this.sb.from("surveys").select("*").eq("id", id).maybeSingle<SurveyRow>();
    if (error) {
      if (error.code === "22P02") return null; // geçersiz UUID
      throw toDataError(error);
    }
    return data ? toSurvey(data) : null;
  }

  async createSurvey(orgId: ID, userId: ID, input: SurveyInput): Promise<Survey> {
    validateSurvey(input);
    const { data, error } = await this.sb
      .from("surveys")
      .insert({
        org_id: orgId,
        created_by: userId,
        title: input.title.trim(),
        description: input.description,
        status: input.status,
        questions: input.questions,
        settings: input.settings,
      })
      .select()
      .single<SurveyRow>();
    if (error) throw toDataError(error, "Anket kaydedilemedi.");
    return toSurvey(data);
  }

  async updateSurvey(id: ID, input: Partial<SurveyInput>): Promise<Survey> {
    const current = await this.getSurvey(id);
    if (!current) throw new DataError("not_found", "Anket bulunamadı.");
    const merged = { ...current, ...input };
    validateSurvey(merged);
    const { data, error } = await this.sb
      .from("surveys")
      .update({
        title: merged.title.trim(),
        description: merged.description,
        status: merged.status,
        questions: merged.questions,
        settings: merged.settings,
      })
      .eq("id", id)
      .select()
      .single<SurveyRow>();
    if (error) throw toDataError(error, "Anket kaydedilemedi.");
    return toSurvey(data);
  }

  async duplicateSurvey(id: ID, userId: ID): Promise<Survey> {
    const s = await this.getSurvey(id);
    if (!s) throw new DataError("not_found", "Anket bulunamadı.");
    return this.createSurvey(s.orgId, userId, {
      title: `${s.title} (kopya)`,
      description: s.description,
      status: "taslak",
      settings: s.settings,
      questions: s.questions.map((q) => ({ ...q, id: crypto.randomUUID() })),
    });
  }

  async deleteSurvey(id: ID): Promise<void> {
    const { data, error } = await this.sb.from("surveys").delete().eq("id", id).select("id");
    if (error) throw toDataError(error, "Anket silinemedi.");
    if (!data.length) throw new DataError("forbidden", "Anketi silme yetkiniz yok. Yalnızca kurum yöneticileri silebilir.");
  }

  async getPublicSurvey(id: ID): Promise<PublicSurvey | null> {
    const { data, error } = await this.sb.rpc("get_public_survey", { p_id: id });
    if (error) {
      if (error.code === "22P02") return null; // geçersiz UUID
      throw toDataError(error, "Anket yüklenemedi.");
    }
    return (data as PublicSurvey | null) ?? null;
  }

  async submitResponse(surveyId: ID, answers: Answers): Promise<void> {
    const survey = await this.getPublicSurvey(surveyId);
    if (!survey || survey.status !== "yayinda") throw new DataError("not_found", "Bu anket şu anda yanıt kabul etmiyor.");
    const { error } = await this.sb.rpc("submit_response", { p_survey: surveyId, p_answers: cleanAnswers(survey.questions, answers) });
    if (error) {
      if (error.code === "23502" || error.code === "22023") throw new DataError("validation", error.message);
      if (error.code === "23505") throw new DataError("validation", "Bu anketi daha önce yanıtladınız.");
      throw toDataError(error, "Yanıtınız gönderilemedi.");
    }
  }

  /** Tüm yanıtlar; PostgREST'in satır sınırı (varsayılan 1000) nedeniyle sayfa sayfa çekilir. */
  async listResponses(surveyId: ID) {
    const page = 1000;
    const rows: ResponseRow[] = [];
    for (let from = 0; ; from += page) {
      const { data, error } = await this.sb
        .from("responses")
        .select("*")
        .eq("survey_id", surveyId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + page - 1)
        .returns<ResponseRow[]>();
      if (error) throw toDataError(error);
      rows.push(...data);
      if (data.length < page) break;
    }
    return rows.map(toResponse);
  }

  // ---------- Abonelik ve ödeme ----------

  async listPlans(): Promise<Plan[]> {
    const { data, error } = await this.sb.from("plans").select("*").order("sort").returns<PlanRow[]>();
    if (error) throw toDataError(error);
    return data.map(toPlan);
  }

  async getPaymentSettings(): Promise<PaymentSettings> {
    const { data, error } = await this.sb.from("payment_settings").select("*").maybeSingle<PaymentSettingsRow>();
    if (error) throw toDataError(error);
    return toPaymentSettings(data);
  }

  async createPayment(orgId: ID, planId: string, note: string): Promise<Payment> {
    const { data, error } = await this.sb.from("payments").insert({ org_id: orgId, plan_id: planId, note: note.trim() }).select().single<PaymentRow>();
    if (error) throw toDataError(error, "Ödeme bildirimi gönderilemedi.");
    return toPayment(data);
  }

  async listPayments(orgId?: ID): Promise<Payment[]> {
    let q = this.sb.from("payments").select("*").order("created_at", { ascending: false });
    if (orgId) q = q.eq("org_id", orgId);
    const { data, error } = await q.returns<PaymentRow[]>();
    if (error) throw toDataError(error);
    return data.map(toPayment);
  }

  async getBenchmark(statKey: string): Promise<Benchmark> {
    const { data, error } = await this.sb.rpc("genel_istatistik", { p_key: statKey });
    if (error) throw toDataError(error);
    const d = data as { toplam: number; yetersiz?: boolean; secenekler?: Array<{ label: string; count: number }>; ortalama?: number | string | null };
    return {
      total: d.toplam,
      insufficient: d.yetersiz,
      options: d.secenekler,
      average: d.ortalama === null || d.ortalama === undefined ? null : Number(d.ortalama),
    };
  }

  // ---------- Süper yönetici (yetki RLS ile denetlenir) ----------

  async adminListOrganizations(): Promise<AdminOrganization[]> {
    const { data, error } = await this.sb
      .from("organizations")
      .select("*, sahip:profiles!organizations_owner_id_fkey(email, full_name), memberships(count), surveys(count)")
      .order("created_at", { ascending: false })
      .returns<Array<OrganizationRow & { sahip: { email: string; full_name: string } | null; memberships: Array<{ count: number }>; surveys: Array<{ count: number }> }>>();
    if (error) throw toDataError(error);
    return data.map((r) => ({
      ...toOrganization(r),
      ownerEmail: r.sahip?.email ?? "",
      ownerName: r.sahip?.full_name ?? "",
      memberCount: r.memberships?.[0]?.count ?? 0,
      surveyCount: r.surveys?.[0]?.count ?? 0,
    }));
  }

  async adminUpdateOrganization(orgId: ID, patch: { status?: OrgStatus; planId?: string; endsAt?: string | null; adminNote?: string }): Promise<void> {
    const row: Partial<OrganizationRow> = {};
    if (patch.status) row.status = patch.status;
    if (patch.planId) row.plan_id = patch.planId;
    if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
    if (patch.adminNote !== undefined) row.admin_note = patch.adminNote;
    const { data, error } = await this.sb.from("organizations").update(row).eq("id", orgId).select("id");
    if (error) throw toDataError(error, "Kurum güncellenemedi.");
    if (!data.length) throw new DataError("forbidden", "Bu işlem için platform yöneticisi yetkisi gerekir.");
  }

  async adminDeleteOrganization(orgId: ID): Promise<void> {
    const { data, error } = await this.sb.from("organizations").delete().eq("id", orgId).select("id");
    if (error) throw toDataError(error, "Kurum silinemedi.");
    if (!data.length) throw new DataError("forbidden", "Bu işlem için platform yöneticisi yetkisi gerekir.");
  }

  async adminListUsers(): Promise<AdminUser[]> {
    const { data, error } = await this.sb
      .from("profiles")
      .select("*, memberships(role, organizations(id, name))")
      .order("created_at", { ascending: false })
      .returns<Array<ProfileRow & { memberships: Array<{ role: OrgRole; organizations: { id: string; name: string } | null }> }>>();
    if (error) throw toDataError(error);
    return data.map((r) => ({
      ...toUser(r),
      organizations: (r.memberships ?? []).flatMap((m) => (m.organizations ? [{ id: m.organizations.id, name: m.organizations.name, role: m.role }] : [])),
    }));
  }

  async adminSetUserStatus(userId: ID, status: AccountStatus): Promise<void> {
    const { data, error } = await this.sb
      .from("profiles")
      .update({ status, frozen_by: status === "donduruldu" ? "yonetici" : null })
      .eq("id", userId)
      .select("id");
    if (error) throw toDataError(error, "Kullanıcı güncellenemedi.");
    if (!data.length) throw new DataError("forbidden", "Bu işlem için platform yöneticisi yetkisi gerekir.");
  }

  async adminDeleteUser(userId: ID): Promise<void> {
    const { error } = await this.sb.rpc("admin_kullanici_sil", { p_user: userId });
    if (error) throw toDataError(error, "Kullanıcı silinemedi.");
  }

  async adminDecidePayment(paymentId: ID, approve: boolean, note = ""): Promise<void> {
    const { error } = await this.sb.rpc("admin_odeme_karar", { p_id: paymentId, p_onay: approve, p_not: note });
    if (error) throw toDataError(error, "Ödeme güncellenemedi.");
  }

  async adminUpdatePlan(plan: Plan): Promise<void> {
    if (!plan.name.trim()) throw new DataError("validation", "Paket adı boş olamaz.");
    if (!(plan.price >= 0)) throw new DataError("validation", "Fiyat 0 veya daha büyük olmalı.");
    if (!(plan.periodDays > 0)) throw new DataError("validation", "Süre en az 1 gün olmalı.");
    const { data, error } = await this.sb.from("plans").update(fromPlan(plan)).eq("id", plan.id).select("id");
    if (error) throw toDataError(error, "Paket güncellenemedi.");
    if (!data.length) throw new DataError("forbidden", "Bu işlem için platform yöneticisi yetkisi gerekir.");
  }

  async adminUpdatePaymentSettings(st: PaymentSettings): Promise<void> {
    const { data, error } = await this.sb
      .from("payment_settings")
      .update({ bank_name: st.bankName.trim(), account_holder: st.accountHolder.trim(), iban: st.iban.replace(/\s+/g, "").toUpperCase(), note: st.note.trim(), updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("id");
    if (error) throw toDataError(error, "Ödeme bilgileri kaydedilemedi.");
    if (!data.length) throw new DataError("forbidden", "Bu işlem için platform yöneticisi yetkisi gerekir.");
  }
}

async function safeJson(res: Response): Promise<{ code?: string; message?: string } | null> {
  try {
    return await res.clone().json();
  } catch {
    return null;
  }
}
