import { beforeEach, describe, expect, it } from "vitest";
import { cleanAnswers, isAnswered, isPastEndDate, missingRequired } from "@/lib/answers";
import { LocalStore } from "@/lib/data/local-store";
import type { Question, SurveyInput } from "@/lib/types";

const qs: Question[] = [
  { id: "a", type: "kisa_metin", title: "Ad", required: true },
  { id: "b", type: "coklu_secim", title: "Renk", required: true, options: ["Mavi", "Yeşil"] },
  { id: "c", type: "nps", title: "NPS", required: false },
];

describe("yanıt yardımcıları", () => {
  it("boş yanıtları tanır (0 puan geçerli yanıttır)", () => {
    expect([isAnswered(""), isAnswered([]), isAnswered(undefined), isAnswered(0), isAnswered("x")]).toEqual([false, false, false, true, true]);
  });
  it("eksik zorunlu soruları bulur", () => {
    expect(missingRequired(qs, { a: "Ali", b: [] })).toEqual(["b"]);
  });
  it("boş ve ankette olmayan yanıtları temizler", () => {
    expect(cleanAnswers(qs, { a: "Ali", b: [], c: 0, z: "x" })).toEqual({ a: "Ali", c: 0 });
  });
  it("bitiş günü dahil yanıt kabul eder", () => {
    const today = new Date(2026, 9, 28);
    expect(isPastEndDate("2026-10-28", today)).toBe(false);
    expect(isPastEndDate("2026-10-27", today)).toBe(true);
    expect(isPastEndDate(undefined, today)).toBe(false);
  });
});

describe("LocalStore katılımcı işlemleri", () => {
  let store: LocalStore;
  let orgId: string;
  let userId: string;
  const base = (over: Partial<SurveyInput> = {}): SurveyInput => ({
    title: "Anket", description: "Açıklama", status: "yayinda", questions: qs,
    settings: { anonymous: false, singleResponse: true, showProgress: true }, ...over,
  });

  beforeEach(async () => {
    localStorage.clear();
    store = new LocalStore();
    const u = await store.signUp({ fullName: "Sahip", email: "s@k.com", password: "sifre1234" });
    userId = u!.id;
    orgId = (await store.createOrganization(userId, { name: "Güneş Okulu", sector: "Eğitim", size: "1–10", city: "Van" })).id;
  });

  it("taslağı gizler, kapalı ve süresi dolmuş anketi kapalı gösterir", async () => {
    const taslak = await store.createSurvey(orgId, userId, base({ status: "taslak" }));
    const kapali = await store.createSurvey(orgId, userId, base({ status: "kapali" }));
    const eski = await store.createSurvey(orgId, userId, base({ settings: { anonymous: false, singleResponse: false, showProgress: true, endsAt: "2020-01-01" } }));
    const acik = await store.createSurvey(orgId, userId, base());
    expect(await store.getPublicSurvey(taslak.id)).toBeNull();
    expect(await store.getPublicSurvey("yok")).toBeNull();
    expect(await store.getPublicSurvey(kapali.id)).toEqual({ id: kapali.id, status: "kapali", title: "Anket" });
    expect((await store.getPublicSurvey(eski.id))!.status).toBe("kapali");
    expect(await store.getPublicSurvey(acik.id)).toMatchObject({ status: "yayinda", orgName: "Güneş Okulu", questions: qs });
  });

  it("yanıtı doğrular ve kaydeder; giriş yapmış kullanıcı ikinci kez yanıtlayamaz", async () => {
    const s = await store.createSurvey(orgId, userId, base());
    await expect(store.submitResponse(s.id, { a: "Ali" })).rejects.toThrow("Zorunlu soru yanıtlanmadı: Renk");
    await expect(store.submitResponse(s.id, { a: "Ali", b: ["Mavi"], x: "?" })).rejects.toThrow("olmayan bir soru");
    await store.submitResponse(s.id, { a: "Ali", b: ["Mavi"], c: 9 });
    await expect(store.submitResponse(s.id, { a: "Ali", b: ["Mavi"] })).rejects.toThrow("daha önce yanıtladınız");
    const rs = await store.listResponses(s.id);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.answers).toEqual({ a: "Ali", b: ["Mavi"], c: 9 });
  });

  it("oturumsuz katılımcı ve anonim anket birden çok yanıt verebilir", async () => {
    const s = await store.createSurvey(orgId, userId, base({ settings: { anonymous: true, singleResponse: true, showProgress: true } }));
    await store.submitResponse(s.id, { a: "1", b: ["Mavi"] });
    await store.submitResponse(s.id, { a: "2", b: ["Yeşil"] });
    expect(await store.listResponses(s.id)).toHaveLength(2);
  });

  it("taslak ve kapalı ankete yanıt kabul etmez", async () => {
    const s = await store.createSurvey(orgId, userId, base({ status: "taslak" }));
    await expect(store.submitResponse(s.id, { a: "x", b: ["Mavi"] })).rejects.toThrow("yanıt kabul etmiyor");
    await store.updateSurvey(s.id, { status: "kapali" });
    await expect(store.submitResponse(s.id, { a: "x", b: ["Mavi"] })).rejects.toThrow("yanıt kabul etmiyor");
  });

  it("anket silinince yanıtları da silinir", async () => {
    const s = await store.createSurvey(orgId, userId, base({ settings: { anonymous: true, singleResponse: false, showProgress: true } }));
    await store.submitResponse(s.id, { a: "x", b: ["Mavi"] });
    await store.deleteSurvey(s.id);
    expect(await store.listResponses(s.id)).toEqual([]);
  });
});
