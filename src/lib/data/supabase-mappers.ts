import type { AccountStatus, Invitation, Membership, Organization, OrgRole, OrgStatus, Payment, PaymentSettings, Plan, Survey, SurveyResponse, User } from "@/lib/types";
import { DataError } from "./store";

/** Veritabanı satırları (snake_case) ↔ uygulama modelleri (camelCase). */

export interface ProfileRow {
  id: string; email: string; full_name: string; created_at: string;
  phone?: string | null; status?: AccountStatus; frozen_by?: "kullanici" | "yonetici" | null; kvkk_onay_at?: string | null;
}
export interface OrganizationRow {
  id: string; name: string; slug: string; sector: string; size: string; city: string;
  phone: string | null; website: string | null; owner_id: string; created_at: string;
  plan_id?: string; status?: OrgStatus; ends_at?: string | null; admin_note?: string;
}
export interface PlanRow {
  id: string; name: string; price: string | number; period_days: number; max_active_surveys: number | null;
  description: string; features: string[]; sort: number; active: boolean;
}
export interface PaymentRow {
  id: string; org_id: string; plan_id: string; amount: string | number; reference: string; status: Payment["status"];
  note: string; admin_note: string; created_by: string | null; created_at: string; decided_at: string | null;
}
export interface PaymentSettingsRow { bank_name: string; account_holder: string; iban: string; note: string }
export interface MembershipRow { org_id: string; user_id: string; role: OrgRole; created_at: string }
export interface InvitationRow {
  id: string; org_id: string; email: string; role: Invitation["role"]; token: string;
  invited_by: string; created_at: string; accepted_at: string | null;
}
export interface SurveyRow {
  id: string; org_id: string; title: string; description: string; status: Survey["status"];
  questions: Survey["questions"]; settings: Survey["settings"]; created_by: string; created_at: string; updated_at: string;
}
export interface ResponseRow { id: string; survey_id: string; answers: SurveyResponse["answers"]; created_at: string }

export const toUser = (r: ProfileRow, isSuperAdmin?: boolean): User => ({
  id: r.id, email: r.email, fullName: r.full_name, createdAt: r.created_at,
  phone: r.phone ?? undefined, status: r.status ?? "aktif", frozenBy: r.frozen_by ?? undefined,
  kvkkConsentAt: r.kvkk_onay_at ?? undefined, ...(isSuperAdmin !== undefined ? { isSuperAdmin } : {}),
});

export const toPlan = (r: PlanRow): Plan => ({
  id: r.id, name: r.name, price: Number(r.price), periodDays: r.period_days, maxActiveSurveys: r.max_active_surveys,
  description: r.description, features: r.features ?? [], sort: r.sort, active: r.active,
});
export const fromPlan = (p: Plan): Omit<PlanRow, "id"> => ({
  name: p.name.trim(), price: p.price, period_days: p.periodDays, max_active_surveys: p.maxActiveSurveys,
  description: p.description, features: p.features, sort: p.sort, active: p.active,
});
export const toPayment = (r: PaymentRow): Payment => ({
  id: r.id, orgId: r.org_id, planId: r.plan_id, amount: Number(r.amount), reference: r.reference, status: r.status,
  note: r.note, adminNote: r.admin_note, createdBy: r.created_by ?? undefined, createdAt: r.created_at, decidedAt: r.decided_at ?? undefined,
});
export const toPaymentSettings = (r: PaymentSettingsRow | null): PaymentSettings => ({
  bankName: r?.bank_name ?? "", accountHolder: r?.account_holder ?? "", iban: r?.iban ?? "", note: r?.note ?? "",
});

export const toOrganization = (r: OrganizationRow): Organization => ({
  id: r.id, name: r.name, slug: r.slug, sector: r.sector, size: r.size, city: r.city,
  phone: r.phone ?? undefined, website: r.website ?? undefined, ownerId: r.owner_id, createdAt: r.created_at,
  planId: r.plan_id ?? "baslangic", status: r.status ?? "aktif", endsAt: r.ends_at ?? undefined, adminNote: r.admin_note ?? "",
});

export const toMembership = (r: MembershipRow): Membership => ({ orgId: r.org_id, userId: r.user_id, role: r.role, createdAt: r.created_at });

export const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id, orgId: r.org_id, email: r.email, role: r.role, token: r.token,
  invitedBy: r.invited_by, createdAt: r.created_at, acceptedAt: r.accepted_at ?? undefined,
});

export const toSurvey = (r: SurveyRow): Survey => ({
  id: r.id, orgId: r.org_id, title: r.title, description: r.description, status: r.status,
  questions: r.questions ?? [], settings: r.settings, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const toResponse = (r: ResponseRow): SurveyResponse => ({ id: r.id, surveyId: r.survey_id, answers: r.answers, createdAt: r.created_at });

interface ErrorLike { message?: string; code?: string; status?: number; name?: string }

/** Supabase Auth / PostgREST hatalarını Türkçe DataError'a çevirir. */
export function toDataError(err: ErrorLike | null | undefined, fallback = "İşlem tamamlanamadı."): DataError {
  if (!err) return new DataError("unknown", fallback);
  const msg = err.message ?? "";
  const code = err.code ?? "";

  if (/invalid login credentials/i.test(msg) || code === "invalid_credentials") {
    return new DataError("invalid_credentials", "E-posta veya şifre hatalı.");
  }
  if (/email not confirmed/i.test(msg) || code === "email_not_confirmed") {
    return new DataError("unauthorized", "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.");
  }
  if (/already registered|already been registered/i.test(msg) || code === "user_already_exists") {
    return new DataError("email_in_use", "Bu e-posta adresiyle kayıtlı bir hesap zaten var.");
  }
  if (/password should be|weak password/i.test(msg) || code === "weak_password") {
    return new DataError("validation", "Şifre yeterince güçlü değil.");
  }
  if (/same.*password|different from the old/i.test(msg) || code === "same_password") {
    return new DataError("validation", "Yeni şifre eskisinden farklı olmalı.");
  }
  if (/rate limit|too many requests/i.test(msg) || err.status === 429 || code === "over_email_send_rate_limit") {
    return new DataError("validation", "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.");
  }
  if (/failed to fetch|network/i.test(msg) || err.name === "AuthRetryableFetchError") {
    return new DataError("network", "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
  }
  if (/auth session missing/i.test(msg) || code === "28000" || code === "PGRST301") {
    return new DataError("unauthorized", "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.");
  }
  // PostgreSQL hata kodları
  if (code === "23505") return new DataError("validation", "Bu kayıt zaten mevcut.");
  if (code === "42501") return new DataError("forbidden", msg && !/row-level security/i.test(msg) ? msg : "Bu işlem için yetkiniz yok.");
  if (code === "P0002" || code === "PGRST116") return new DataError("not_found", msg && code === "P0002" ? msg : "Kayıt bulunamadı.");
  if (code === "23514") return new DataError("validation", "Girilen bilgiler geçersiz.");

  return new DataError("unknown", fallback);
}
