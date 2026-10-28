import { beforeEach, describe, expect, it } from "vitest";
import { LocalStore } from "@/lib/data/local-store";
import { DataError } from "@/lib/data/store";
import type { SurveyInput } from "@/lib/types";

const baseSurvey: SurveyInput = {
  title: "Memnuniyet",
  description: "",
  status: "taslak",
  settings: { anonymous: false, singleResponse: true, showProgress: true },
  questions: [],
};

describe("LocalStore", () => {
  let store: LocalStore;
  beforeEach(() => {
    localStorage.clear();
    store = new LocalStore();
  });

  it("kayıt, çıkış ve giriş akışı", async () => {
    const u = await store.signUp({ fullName: "Ayşe Yılmaz", email: "AYSE@kurum.com", password: "sifre1234" });
    expect(u.email).toBe("ayse@kurum.com");
    expect(await store.currentUser()).toEqual(u);
    expect(JSON.stringify(localStorage)).not.toContain("sifre1234");

    await store.signOut();
    expect(await store.currentUser()).toBeNull();

    await expect(store.signIn("ayse@kurum.com", "yanlis1234")).rejects.toMatchObject({ code: "invalid_credentials" });
    expect((await store.signIn(" Ayse@Kurum.com ", "sifre1234")).id).toBe(u.id);
  });

  it("aynı e-postayla ikinci kaydı reddeder", async () => {
    await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    await expect(store.signUp({ fullName: "Başka", email: "A@B.CO", password: "sifre1234" })).rejects.toMatchObject({ code: "email_in_use" });
  });

  it("zayıf şifreyi reddeder", async () => {
    await expect(store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "kisa" })).rejects.toBeInstanceOf(DataError);
  });

  it("kurum oluşturur, sahibi üye yapar, slug çakışmasını çözer", async () => {
    const u = await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    const input = { name: "Güneş Okulları", sector: "Eğitim", size: "11–50", city: "İzmir" };
    const o1 = await store.createOrganization(u.id, input);
    const o2 = await store.createOrganization(u.id, input);
    expect(o1.slug).toBe("gunes-okullari");
    expect(o2.slug).toBe("gunes-okullari-2");
    const orgs = await store.listMyOrganizations(u.id);
    expect(orgs.map((o) => o.role)).toEqual(["sahip", "sahip"]);
    const members = await store.listMembers(o1.id);
    expect(members[0]!.user.fullName).toBe("Ayşe");
  });

  it("geçersiz kurum bilgisini reddeder", async () => {
    const u = await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    await expect(store.createOrganization(u.id, { name: "X", sector: "", size: "", city: "" })).rejects.toMatchObject({ code: "validation" });
    await expect(
      store.createOrganization(u.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van", website: "kurum.com" }),
    ).rejects.toThrow(/http/);
  });

  it("anket oluşturur, günceller, kopyalar ve siler", async () => {
    const u = await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    const org = await store.createOrganization(u.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    const s = await store.createSurvey(org.id, u.id, {
      ...baseSurvey,
      questions: [{ id: "q1", type: "tek_secim", title: "Renk?", required: true, options: ["Mavi", "Kırmızı"] }],
    });
    const updated = await store.updateSurvey(s.id, { status: "yayinda" });
    expect(updated.status).toBe("yayinda");

    const copy = await store.duplicateSurvey(s.id, u.id);
    expect(copy.title).toBe("Memnuniyet (kopya)");
    expect(copy.status).toBe("taslak");
    expect(copy.questions[0]!.id).not.toBe("q1");
    expect(await store.listSurveys(org.id)).toHaveLength(2);

    await store.deleteSurvey(s.id);
    expect(await store.getSurvey(s.id)).toBeNull();
  });

  it("anket doğrulama kuralları", async () => {
    const u = await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    const org = await store.createOrganization(u.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    await expect(store.createSurvey(org.id, u.id, { ...baseSurvey, title: "  " })).rejects.toThrow("başlığı");
    await expect(store.createSurvey(org.id, u.id, { ...baseSurvey, status: "yayinda" })).rejects.toThrow("en az bir soru");
    await expect(
      store.createSurvey(org.id, u.id, { ...baseSurvey, questions: [{ id: "q", type: "tek_secim", title: "S", required: false, options: ["A", ""] }] }),
    ).rejects.toThrow("en az 2 seçenek");
    await expect(
      store.createSurvey(org.id, u.id, { ...baseSurvey, questions: [{ id: "q", type: "coklu_secim", title: "S", required: false, options: ["Evet", "evet"] }] }),
    ).rejects.toThrow("farklı");
    await expect(
      store.createSurvey(org.id, u.id, { ...baseSurvey, questions: [{ id: "q", type: "kisa_metin", title: "", required: false }] }),
    ).rejects.toThrow("1. sorunun");
  });
});
