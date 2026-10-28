import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SupabaseStore'u sahte bir Supabase istemcisiyle sınar: doğru tablo/RPC
 * çağrıları yapılıyor mu ve yanıtlar doğru yorumlanıyor mu. Gerçek
 * veritabanına bağlanmaz.
 */

type Result = { data: unknown; error: unknown };
const calls: Array<{ table?: string; rpc?: string; ops: Array<[string, unknown[]]> }> = [];
let nextResults: Result[] = [];
const auth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: "u1" } } } })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};

function builder(entry: (typeof calls)[number]) {
  const result = () => nextResults.shift() ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "is", "order", "range", "returns"]) {
    b[m] = (...args: unknown[]) => { entry.ops.push([m, args]); return b; };
  }
  for (const m of ["single", "maybeSingle"]) {
    b[m] = () => { entry.ops.push([m, []]); return Promise.resolve(result()); };
  }
  b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
  return b;
}

const functions = { invoke: vi.fn() };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth,
    functions,
    from: (table: string) => { const e = { table, ops: [] }; calls.push(e); return builder(e); },
    rpc: (name: string, args: unknown) => { const e = { rpc: name, ops: [["args", [args]]] as Array<[string, unknown[]]> }; calls.push(e); return builder(e); },
  }),
}));

const { SupabaseStore } = await import("@/lib/data/supabase-store");
const profile = { id: "u1", email: "a@b.co", full_name: "Ayşe", created_at: "t" };

describe("SupabaseStore (sahte istemci)", () => {
  let store: InstanceType<typeof SupabaseStore>;
  beforeEach(() => {
    calls.length = 0;
    nextResults = [];
    vi.clearAllMocks();
    store = new SupabaseStore("https://x.supabase.co", "anon", (p) => `https://anket360.test${p}`);
  });

  it("kayıtta e-posta doğrulaması gerekiyorsa null döner ve yönlendirme adresini verir", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [{}] }, session: null }, error: null });
    await expect(store.signUp({ fullName: "Ayşe", email: "A@b.co", password: "sifre1234" })).resolves.toBeNull();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "sifre1234",
      options: { data: { full_name: "Ayşe", kvkk_onay: false }, emailRedirectTo: "https://anket360.test/panel" },
    });
  });

  it("kayıtlı e-postayı (boş identities) tanır", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [] }, session: null }, error: null });
    await expect(store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" })).rejects.toMatchObject({ code: "email_in_use" });
  });

  it("oturum açılınca profili döner", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [{}] }, session: {} }, error: null });
    nextResults = [{ data: profile, error: null }];
    await expect(store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" })).resolves.toMatchObject({ id: "u1", fullName: "Ayşe" });
    expect(calls[0]!.table).toBe("profiles");
  });

  it("hatalı girişte Türkçe hata verir", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    await expect(store.signIn("a@b.co", "x")).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("şifre sıfırlama bağlantısını /sifre-yenile adresine yönlendirir", async () => {
    await store.requestPasswordReset("A@B.co");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "https://anket360.test/sifre-yenile" });
  });

  it("kurumu RPC ile slug üreterek oluşturur", async () => {
    nextResults = [{ data: { id: "o1", name: "Güneş Okulu", slug: "gunes-okulu", sector: "Eğitim", size: "1–10", city: "İzmir", phone: null, website: null, owner_id: "u1", created_at: "t" }, error: null }];
    const org = await store.createOrganization("u1", { name: "Güneş Okulu", sector: "Eğitim", size: "1–10", city: "İzmir" });
    expect(org.slug).toBe("gunes-okulu");
    expect(calls[0]!.rpc).toBe("create_organization");
    expect(calls[0]!.ops[0]![1][0]).toMatchObject({ p_name: "Güneş Okulu", p_slug: "gunes-okulu", p_phone: null });
  });

  it("RLS nedeniyle hiçbir satır silinmezse yetki hatası verir", async () => {
    nextResults = [{ data: [], error: null }];
    await expect(store.deleteSurvey("s1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("yinelenen daveti anlaşılır mesajla reddeder", async () => {
    nextResults = [
      { data: [], error: null }, // listMembers
      { data: null, error: { code: "23505", message: "duplicate" } },
    ];
    await expect(store.createInvitation("o1", "u1", "x@y.com", "uye")).rejects.toThrow("bekleyen bir davet");
    expect(calls[1]).toMatchObject({ table: "invitations" });
  });

  it("geçersiz anket kimliğinde null döner", async () => {
    nextResults = [{ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } }];
    await expect(store.getSurvey("abc")).resolves.toBeNull();
  });

  it("herkese açık anketi RPC ile alır; geçersiz kimlikte null döner", async () => {
    nextResults = [{ data: { id: "s1", status: "kapali", title: "T" }, error: null }];
    await expect(store.getPublicSurvey("s1")).resolves.toEqual({ id: "s1", status: "kapali", title: "T" });
    expect(calls[0]).toMatchObject({ rpc: "get_public_survey" });
    expect(calls[0]!.ops[0]![1][0]).toEqual({ p_id: "s1" });
    nextResults = [{ data: null, error: { code: "22P02", message: "invalid uuid" } }];
    await expect(store.getPublicSurvey("abc")).resolves.toBeNull();
  });

  it("yanıtı temizleyip submit_response ile gönderir ve sunucu hatasını Türkçe iletir", async () => {
    const survey = {
      id: "s1", status: "yayinda", title: "T", description: "", orgName: "K",
      settings: { anonymous: true, singleResponse: false, showProgress: true },
      questions: [{ id: "q1", type: "kisa_metin", title: "Ad", required: true }],
    };
    nextResults = [{ data: survey, error: null }, { data: "r1", error: null }];
    await store.submitResponse("s1", { q1: "Ali", yok: "x" });
    expect(calls[1]).toMatchObject({ rpc: "submit_response" });
    expect(calls[1]!.ops[0]![1][0]).toEqual({ p_survey: "s1", p_answers: { q1: "Ali" } });

    nextResults = [{ data: survey, error: null }, { data: null, error: { code: "23502", message: "Zorunlu soru yanıtlanmadı: Ad" } }];
    await expect(store.submitResponse("s1", {})).rejects.toMatchObject({ code: "validation", message: "Zorunlu soru yanıtlanmadı: Ad" });

    nextResults = [{ data: { id: "s1", status: "kapali", title: "T" }, error: null }];
    await expect(store.submitResponse("s1", { q1: "Ali" })).rejects.toThrow("yanıt kabul etmiyor");
  });

  it("1000'den fazla yanıtı sayfa sayfa çeker", async () => {
    const row = (i: number) => ({ id: `r${i}`, survey_id: "s1", answers: {}, created_at: "t" });
    nextResults = [
      { data: Array.from({ length: 1000 }, (_, i) => row(i)), error: null },
      { data: Array.from({ length: 1000 }, (_, i) => row(1000 + i)), error: null },
      { data: [row(2000), row(2001)], error: null },
    ];
    const rs = await store.listResponses("s1");
    expect(rs).toHaveLength(2002);
    expect(calls.map((c) => c.ops.find(([m]) => m === "range")![1])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("davet e-postası: gönderildi, kapalı, yüklenmemiş fonksiyon ve sık gönderim", async () => {
    const httpErr = (status: number, body?: unknown) => ({ error: { context: new Response(body ? JSON.stringify(body) : "Not Found", { status }) } });
    functions.invoke.mockResolvedValueOnce({ data: { sent: true }, error: null });
    await expect(store.sendInvitationEmail("i1")).resolves.toBe("gonderildi");
    expect(functions.invoke).toHaveBeenCalledWith("davet-e-postasi", { body: { invitationId: "i1" } });

    functions.invoke.mockResolvedValueOnce(httpErr(503, { code: "eposta_kapali", message: "x" }));
    await expect(store.sendInvitationEmail("i1")).resolves.toBe("kapali");

    functions.invoke.mockResolvedValueOnce(httpErr(404));
    await expect(store.sendInvitationEmail("i1")).resolves.toBe("kapali");

    functions.invoke.mockResolvedValueOnce(httpErr(404, { code: "bulunamadi", message: "Davet bulunamadı." }));
    await expect(store.sendInvitationEmail("i1")).rejects.toThrow("Davet bulunamadı.");

    functions.invoke.mockResolvedValueOnce(httpErr(429, { code: "cok_sik", message: "Bu davet az önce gönderildi. Bir dakika sonra tekrar deneyin." }));
    await expect(store.sendInvitationEmail("i1")).rejects.toMatchObject({ code: "validation", message: expect.stringContaining("az önce") });
  });

  it("genel eğilim, hesap ve yönetim çağrıları doğru RPC/tablolara gider", async () => {
    nextResults = [{ data: { toplam: 12, secenekler: [{ label: "Ekonomi", count: 9 }], ortalama: null }, error: null }];
    await expect(store.getBenchmark("ulke")).resolves.toEqual({ total: 12, insufficient: undefined, options: [{ label: "Ekonomi", count: 9 }], average: null });
    expect(calls[0]).toMatchObject({ rpc: "genel_istatistik" });

    calls.length = 0;
    nextResults = [{ data: null, error: null }];
    await store.freezeMyAccount();
    expect(calls[0]).toMatchObject({ rpc: "hesabimi_dondur" });

    calls.length = 0;
    nextResults = [{ data: [{ id: "u2" }], error: null }];
    await store.adminSetUserStatus("u2", "donduruldu");
    expect(calls[0]!.table).toBe("profiles");
    expect(calls[0]!.ops.find(([m]) => m === "update")![1][0]).toEqual({ status: "donduruldu", frozen_by: "yonetici" });

    calls.length = 0;
    nextResults = [{ data: [{ id: true }], error: null }];
    await store.adminUpdatePaymentSettings({ bankName: " Örnek Bank ", accountHolder: "A", iban: "tr33 0006 1005 1978 6457 8413 26", note: "" });
    expect(calls[0]!.ops.find(([m]) => m === "update")![1][0]).toMatchObject({ bank_name: "Örnek Bank", iban: "TR330006100519786457841326" });

    calls.length = 0;
    nextResults = [{ data: [], error: null }];
    await expect(store.adminDeleteOrganization("o1")).rejects.toMatchObject({ code: "forbidden" });
  });
});
