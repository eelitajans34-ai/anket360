import { beforeEach, describe, expect, it } from "vitest";
import { formatIban, isValidIban, maskIban, maskName, orgRestriction, orgUsable } from "@/lib/platform";
import { LocalStore } from "@/lib/data/local-store";
import type { SurveyInput } from "@/lib/types";

describe("platform kuralları", () => {
  it("TR IBAN'ı doğrular ve biçimler", () => {
    expect(isValidIban("TR33 0006 1005 1978 6457 8413 26")).toBe(true);
    expect(isValidIban("TR330006100519786457841327")).toBe(false); // sağlama hatası
    expect(isValidIban("DE89370400440532013000")).toBe(false);
    expect(formatIban("TR330006100519786457841326")).toBe("TR33 0006 1005 1978 6457 8413 26");
  });
  it("IBAN ve adı maskeler", () => {
    expect(maskIban("TR74 0001 0000 0000 0000 0000 5003")).toBe("TR74 •••• •••• •••• •••• •••• 5003");
    expect(maskName("Mustafa Subaşı")).toBe("M•••••• S•••••");
    expect(maskName("  Ali   Veli ")).toBe("A•• V•••");
  });
  it("kurum kısıtlamalarını açıklar", () => {
    expect(orgUsable({ status: "aktif" })).toBe(true);
    expect(orgUsable({ status: "aktif", endsAt: "2000-01-01T00:00:00Z" })).toBe(false);
    expect(orgRestriction({ status: "aktif", endsAt: "2000-01-01T00:00:00Z" })).toMatch(/süresi doldu/);
    expect(orgRestriction({ status: "engellendi" })).toMatch(/engellendi/);
    expect(orgRestriction({ status: "aktif" })).toBeNull();
  });
});

const anket = (status: SurveyInput["status"] = "yayinda"): SurveyInput => ({
  title: "A", description: "", status, settings: { anonymous: true, singleResponse: false, showProgress: true },
  questions: [{ id: "q", type: "tek_secim", title: "Sorun?", required: true, options: ["Ekonomi", "Eğitim"], statKey: "ulke" }],
});

describe("LocalStore: yönetim, abonelik, hesap", () => {
  let st: LocalStore;
  beforeEach(() => { localStorage.clear(); st = new LocalStore(); });

  async function kurum(email = "sahip@k.com") {
    const u = (await st.signUp({ fullName: "Sahip", email, password: "sifre1234", kvkkConsent: true }))!;
    const o = await st.createOrganization(u.id, { name: "Kurum " + email, sector: "Kamu / Belediye", size: "1–10", city: "Van" });
    return { u, o };
  }
  async function sa() {
    await st.signOut();
    try {
      return await st.signIn("mustafasubasinin@gmail.com", "sifre1234");
    } catch {
      return (await st.signUp({ fullName: "Mustafa", email: "MustafaSubasinin@gmail.com", password: "sifre1234" }))!;
    }
  }

  it("KVKK onay zamanı ve süper yönetici tanınır; normal kullanıcı yönetim işlemi yapamaz", async () => {
    const { u } = await kurum();
    expect(u.kvkkConsentAt).toBeTruthy();
    expect(u.isSuperAdmin).toBe(false);
    await expect(st.adminListOrganizations()).rejects.toMatchObject({ code: "forbidden" });
    await expect(st.adminUpdatePlan({ ...(await st.listPlans())[1]!, price: 1 })).rejects.toMatchObject({ code: "forbidden" });
    const admin = await sa();
    expect(admin.isSuperAdmin).toBe(true);
    expect((await st.adminListOrganizations())[0]).toMatchObject({ ownerEmail: "sahip@k.com", surveyCount: 0, planId: "baslangic" });
  });

  it("ücretsiz pakette en fazla 3 anket yayında olabilir; süper yönetici sınırdan etkilenmez", async () => {
    const { u, o } = await kurum();
    for (let i = 0; i < 3; i++) await st.createSurvey(o.id, u.id, anket());
    await expect(st.createSurvey(o.id, u.id, anket())).rejects.toThrow(/en fazla 3/);
    const taslak = await st.createSurvey(o.id, u.id, anket("taslak"));
    await expect(st.updateSurvey(taslak.id, { status: "yayinda" })).rejects.toThrow(/en fazla 3/);
    await sa();
    await expect(st.updateSurvey(taslak.id, { status: "yayinda" })).resolves.toMatchObject({ status: "yayinda" });
  });

  it("ödeme bildirimi → süper yönetici onayı: paket ve süre güncellenir", async () => {
    const { o } = await kurum();
    await expect(st.createPayment(o.id, "baslangic", "")).rejects.toThrow(/Ücretsiz/);
    const p = await st.createPayment(o.id, "profesyonel", "Ali Veli adına havale");
    expect(p).toMatchObject({ status: "beklemede", amount: 499 });
    expect(p.reference).toMatch(/^[0-9A-F]{8}$/);
    await expect(st.adminDecidePayment(p.id, true)).rejects.toMatchObject({ code: "forbidden" });
    await sa();
    await st.adminDecidePayment(p.id, true, "Geldi");
    const org = (await st.adminListOrganizations())[0]!;
    const gun = (new Date(org.endsAt!).getTime() - Date.now()) / 86_400_000;
    expect(org.planId).toBe("profesyonel");
    expect(gun).toBeGreaterThan(29.9);
    await expect(st.adminDecidePayment(p.id, false)).rejects.toThrow(/Bekleyen ödeme/);
  });

  it("pasif / süresi dolan kurumun anketi kapalı görünür ve yanıt almaz", async () => {
    const { u, o } = await kurum();
    const s = await st.createSurvey(o.id, u.id, anket());
    await sa();
    await st.adminUpdateOrganization(o.id, { status: "pasif" });
    expect(await st.getPublicSurvey(s.id)).toMatchObject({ status: "kapali" });
    await expect(st.submitResponse(s.id, { q: "Ekonomi" })).rejects.toThrow(/yanıt kabul etmiyor/);
    await st.adminUpdateOrganization(o.id, { status: "aktif", endsAt: "2000-01-01T00:00:00Z" });
    await expect(st.submitResponse(s.id, { q: "Ekonomi" })).rejects.toThrow(/yanıt kabul etmiyor/);
    await st.adminUpdateOrganization(o.id, { endsAt: null });
    await expect(st.submitResponse(s.id, { q: "Ekonomi" })).resolves.toBeUndefined();
  });

  it("hesap dondurma/açma; yönetici dondurduysa kullanıcı açamaz; hesap silinince kurumu da silinir", async () => {
    const { u } = await kurum();
    await st.freezeMyAccount();
    expect((await st.currentUser())!.status).toBe("donduruldu");
    expect(await st.listMyOrganizations(u.id)).toEqual([]);
    await st.reactivateMyAccount();
    expect(await st.listMyOrganizations(u.id)).toHaveLength(1);
    await st.signOut();
    await sa();
    await st.adminSetUserStatus(u.id, "donduruldu");
    await st.signOut();
    await st.signIn("sahip@k.com", "sifre1234");
    await expect(st.reactivateMyAccount()).rejects.toMatchObject({ code: "forbidden" });
    await expect(st.createOrganization(u.id, { name: "Yeni", sector: "Diğer", size: "1–10", city: "Van" })).rejects.toThrow(/aktif değil/);
    await st.deleteMyAccount();
    expect(await st.currentUser()).toBeNull();
    await sa();
    expect(await st.adminListOrganizations()).toEqual([]);
    expect((await st.adminListUsers()).map((x) => x.email)).toEqual(["mustafasubasinin@gmail.com"]);
    await expect(st.adminDeleteUser((await st.currentUser())!.id)).rejects.toThrow(/silinemez/);
  });

  it("genel eğilim en az 10 yanıtla ve yalnız toplam sayılarla verilir", async () => {
    const { u, o } = await kurum();
    const s = await st.createSurvey(o.id, u.id, anket());
    for (let i = 0; i < 9; i++) await st.submitResponse(s.id, { q: i < 7 ? "Ekonomi" : "Eğitim" });
    expect(await st.getBenchmark("ulke")).toEqual({ total: 9, insufficient: true });
    await st.submitResponse(s.id, { q: "Ekonomi" });
    const b = await st.getBenchmark("ulke");
    expect(b.total).toBe(10);
    expect(b.options).toEqual([{ label: "Ekonomi", count: 8 }, { label: "Eğitim", count: 2 }]);
  });
});
