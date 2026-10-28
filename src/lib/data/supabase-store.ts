import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ID, Invitation, OrganizationInput, SignUpInput, Survey, SurveyInput, User } from "@/lib/types";
import { isValidEmail, passwordIssues, slugify } from "@/lib/utils";
import { validateOrg, validateSurvey } from "./local-store";
import { DataError, type DataStore } from "./store";
import {
  toDataError, toInvitation, toMembership, toOrganization, toResponse, toSurvey, toUser,
  type InvitationRow, type MembershipRow, type OrganizationRow, type ProfileRow, type ResponseRow, type SurveyRow,
} from "./supabase-mappers";

/**
 * Supabase (Auth + PostgREST) üzerinde çalışan veri katmanı.
 * Yetkilendirme veritabanındaki RLS kurallarıyla yapılır (bkz. supabase/schema.sql);
 * istemcideki doğrulamalar yalnızca kullanıcıya hızlı geri bildirim içindir.
 */
export class SupabaseStore implements DataStore {
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string, private origin = typeof window !== "undefined" ? window.location.origin : "") {
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
      options: { data: { full_name: fullName }, emailRedirectTo: `${this.origin}/panel` },
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
    const { data, error } = await this.sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle<ProfileRow>();
    if (error) throw toDataError(error);
    return data ? toUser(data) : null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!isValidEmail(email)) throw new DataError("validation", "Geçerli bir e-posta adresi girin.");
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${this.origin}/sifre-yenile` });
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

  async updateProfile(userId: ID, patch: Partial<Pick<User, "fullName">>): Promise<User> {
    const row: Partial<ProfileRow> = {};
    if (patch.fullName !== undefined) {
      if (patch.fullName.trim().length < 2) throw new DataError("validation", "Ad soyad en az 2 karakter olmalı.");
      row.full_name = patch.fullName.trim();
    }
    const { data, error } = await this.sb.from("profiles").update(row).eq("id", userId).select().single<ProfileRow>();
    if (error) throw toDataError(error, "Profil güncellenemedi.");
    return toUser(data);
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

  async listResponses(surveyId: ID) {
    const { data, error } = await this.sb.from("responses").select("*").eq("survey_id", surveyId).returns<ResponseRow[]>();
    if (error) throw toDataError(error);
    return data.map(toResponse);
  }
}
