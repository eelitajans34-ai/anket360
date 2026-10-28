import { describe, expect, it } from "vitest";
import { toDataError, toOrganization, toSurvey } from "@/lib/data/supabase-mappers";

describe("Supabase eşlemeleri", () => {
  it("satırları uygulama modeline çevirir", () => {
    expect(
      toOrganization({ id: "1", name: "K", slug: "k", sector: "Eğitim", size: "1–10", city: "Van", phone: null, website: null, owner_id: "u", created_at: "t" }),
    ).toEqual({ id: "1", name: "K", slug: "k", sector: "Eğitim", size: "1–10", city: "Van", phone: undefined, website: undefined, ownerId: "u", createdAt: "t", planId: "baslangic", status: "aktif", endsAt: undefined, adminNote: "" });
    const s = toSurvey({
      id: "s", org_id: "o", title: "T", description: "", status: "taslak", questions: null as never,
      settings: { anonymous: true, singleResponse: true, showProgress: true }, created_by: "u", created_at: "a", updated_at: "b",
    });
    expect(s.questions).toEqual([]);
    expect(s.orgId).toBe("o");
  });

  it.each([
    [{ message: "Invalid login credentials" }, "invalid_credentials", "E-posta veya şifre hatalı."],
    [{ message: "Email not confirmed" }, "unauthorized", /doğrulanmadı/],
    [{ message: "User already registered" }, "email_in_use", /zaten var/],
    [{ message: "x", status: 429 }, "validation", /Çok fazla deneme/],
    [{ message: "Failed to fetch" }, "network", /Sunucuya ulaşılamadı/],
    [{ message: "new row violates row-level security policy", code: "42501" }, "forbidden", "Bu işlem için yetkiniz yok."],
    [{ message: "Bu davet a@b.co adresine gönderildi. O adresle giriş yapın.", code: "42501" }, "forbidden", /a@b.co/],
    [{ message: "Davet bulunamadı veya daha önce kullanılmış.", code: "P0002" }, "not_found", /Davet bulunamadı/],
    [{ message: "duplicate key", code: "23505" }, "validation", /zaten mevcut/],
    [{ message: "something odd" }, "unknown", "İşlem tamamlanamadı."],
  ])("%j hatasını çevirir", (err, code, text) => {
    const e = toDataError(err);
    expect(e.code).toBe(code);
    if (typeof text === "string") expect(e.message).toBe(text);
    else expect(e.message).toMatch(text);
  });
});
