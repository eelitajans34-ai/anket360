import { beforeEach, describe, expect, it } from "vitest";
import { LocalStore } from "@/lib/data/local-store";

describe("LocalStore davetler ve ekip", () => {
  let store: LocalStore;
  beforeEach(() => {
    localStorage.clear();
    store = new LocalStore();
  });

  async function setup() {
    const owner = await store.signUp({ fullName: "Sahip Kişi", email: "sahip@kurum.com", password: "sifre1234" });
    const org = await store.createOrganization(owner!.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    return { owner: owner!, org };
  }

  it("davet oluşturur, yinelenen daveti reddeder, kabul edilince üye yapar", async () => {
    const { owner, org } = await setup();
    const inv = await store.createInvitation(org.id, owner.id, " Ali@Kurum.com ", "yonetici");
    expect(inv.email).toBe("ali@kurum.com");
    await expect(store.createInvitation(org.id, owner.id, "ali@kurum.com", "uye")).rejects.toThrow("bekleyen");
    await expect(store.createInvitation(org.id, owner.id, "sahip@kurum.com", "uye")).rejects.toThrow("zaten kurumun üyesi");

    const other = await store.signUp({ fullName: "Başka", email: "baska@kurum.com", password: "sifre1234" });
    await expect(store.acceptInvitation(inv.token, other!.id)).rejects.toMatchObject({ code: "forbidden" });

    const ali = await store.signUp({ fullName: "Ali Veli", email: "ali@kurum.com", password: "sifre1234" });
    expect(await store.acceptInvitation(inv.token, ali!.id)).toBe(org.id);
    expect((await store.listMyOrganizations(ali!.id))[0]).toMatchObject({ id: org.id, role: "yonetici" });
    expect(await store.listInvitations(org.id)).toHaveLength(0);
    await expect(store.acceptInvitation(inv.token, ali!.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("daveti iptal eder", async () => {
    const { owner, org } = await setup();
    const inv = await store.createInvitation(org.id, owner.id, "x@y.com", "uye");
    await store.revokeInvitation(inv.id);
    expect(await store.listInvitations(org.id)).toEqual([]);
  });

  it("üyeyi çıkarır ama sahibi çıkarmaz", async () => {
    const { owner, org } = await setup();
    const inv = await store.createInvitation(org.id, owner.id, "uye@kurum.com", "uye");
    const u = await store.signUp({ fullName: "Üye", email: "uye@kurum.com", password: "sifre1234" });
    await store.acceptInvitation(inv.token, u!.id);
    await store.removeMember(org.id, u!.id);
    expect(await store.listMembers(org.id)).toHaveLength(1);
    await expect(store.removeMember(org.id, owner.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("şifre günceller", async () => {
    await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    await expect(store.updatePassword("kisa")).rejects.toMatchObject({ code: "validation" });
    await store.updatePassword("yenisifre99");
    await store.signOut();
    await expect(store.signIn("a@b.co", "sifre1234")).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(store.signIn("a@b.co", "yenisifre99")).resolves.toMatchObject({ email: "a@b.co" });
    await store.signOut();
    await expect(store.updatePassword("yenisifre99")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("eski sürüm veritabanını (davet listesi olmayan) okuyabilir", async () => {
    localStorage.setItem("anket360:db", JSON.stringify({ version: 1, users: [], organizations: [], memberships: [], surveys: [], responses: [] }));
    expect(await new LocalStore().listInvitations("x")).toEqual([]);
  });
});
