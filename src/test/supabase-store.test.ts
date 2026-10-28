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
  for (const m of ["select", "insert", "update", "delete", "eq", "is", "order", "returns"]) {
    b[m] = (...args: unknown[]) => { entry.ops.push([m, args]); return b; };
  }
  for (const m of ["single", "maybeSingle"]) {
    b[m] = () => { entry.ops.push([m, []]); return Promise.resolve(result()); };
  }
  b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth,
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
      options: { data: { full_name: "Ayşe" }, emailRedirectTo: "https://anket360.test/panel" },
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
});
