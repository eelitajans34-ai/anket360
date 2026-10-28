/**
 * supabase/migrations/*.sql için RLS / yetki kontrolü.
 * BOŞ, YEREL ve GEÇİCİ bir PostgreSQL veritabanında çalıştırın — betik public
 * ve auth şemalarını silip yeniden oluşturur. Asla Supabase projesine bağlamayın.
 *
 *   RLS_TEST_DATABASE_URL=postgres://postgres@localhost:5432/rls_test npm run test:rls
 */
import pg from "pg";
if (!process.env.RLS_TEST_DATABASE_URL || /supabase\.(co|com)/.test(process.env.RLS_TEST_DATABASE_URL)) {
  console.error("RLS_TEST_DATABASE_URL yerel bir test veritabanını göstermeli.");
  process.exit(1);
}
import fs from "node:fs";
const client = new pg.Client({ connectionString: process.env.RLS_TEST_DATABASE_URL });
await client.connect();
await client.query("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists extensions cascade;");
const db = { exec: (sql) => client.query(sql), query: (sql, params) => client.query(sql, params) };
// Supabase ortamının küçük taklidi: auth şeması, roller, auth.uid()
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz default now());
  do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
  do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
// Tüm migration dosyalarını sırayla uygula
const dir = new URL("../migrations/", import.meta.url);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(fs.readFileSync(new URL(f, dir), "utf8"));
}
await db.exec(`
  grant usage on schema public, auth to anon, authenticated;
  -- Supabase varsayılanı gibi: tablo yetkileri iki role de verilir, erişimi RLS sınırlar
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}', 'Sahip@Kurum.com', '{"full_name":"Sahip"}'), ('${B}', 'uye@kurum.com', '{"full_name":"Üye"}'), ('${C}', 'yabanci@x.com', '{}');`);
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
};
const asAnon = async (sql, params) => {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
};
const expectFail = async (label, p) => { try { await p; console.log("BEKLENMEDİK BAŞARI:", label); process.exitCode = 1; } catch (e) { console.log("✓ reddedildi:", label, "→", e.message); } };
const ok = (label, cond) => { console.log(cond ? "✓" : "✗", label); if (!cond) process.exitCode = 1; };

ok("profil tetikleyicisi e-postayı küçük harfe çevirir", (await db.query(`select email from profiles where id='${A}'`)).rows[0].email === "sahip@kurum.com");
const org = (await as(A, `select * from create_organization('Güneş Okulu','gunes-okulu','Eğitim','1–10','İzmir')`)).rows[0];
const org2 = (await as(A, `select * from create_organization('Güneş Okulu','gunes-okulu','Eğitim','1–10','İzmir')`)).rows[0];
ok("slug çakışması çözülür", org.slug === "gunes-okulu" && org2.slug === "gunes-okulu-2");
ok("sahip üyeliği oluşur", (await as(A, `select role from memberships where org_id=$1`, [org.id])).rows[0].role === "sahip");
ok("yabancı kurumu göremez", (await as(C, `select * from organizations`)).rows.length === 0);
await expectFail("doğrudan kurum ekleme (RPC dışı)", as(C, `insert into organizations (name,slug,sector,size,city,owner_id) values ('X','x','a','b','c','${C}')`));

const inv = (await as(A, `insert into invitations (org_id,email,role,invited_by) values ($1,'uye@kurum.com','uye','${A}') returning *`, [org.id])).rows[0];
await expectFail("yinelenen bekleyen davet", as(A, `insert into invitations (org_id,email,role,invited_by) values ($1,'uye@kurum.com','uye','${A}')`, [org.id]));
await expectFail("sahip rolüyle davet", as(A, `insert into invitations (org_id,email,role,invited_by) values ($1,'z@z.com','sahip','${A}')`, [org.id]));
await expectFail("üye olmayan davet oluşturamaz", as(C, `insert into invitations (org_id,email,role,invited_by) values ($1,'z@z.com','uye','${C}')`, [org.id]));
ok("yabancı davetleri göremez", (await as(C, `select * from invitations`)).rows.length === 0);
await expectFail("yanlış e-postayla davet kabulü", as(C, `select accept_invitation($1)`, [inv.token]));
ok("doğru kullanıcı daveti kabul eder", (await as(B, `select accept_invitation($1) as o`, [inv.token])).rows[0].o === org.id);
await expectFail("davet ikinci kez kullanılamaz", as(B, `select accept_invitation($1)`, [inv.token]));
ok("üye, kurumdaki diğer profilleri görür", (await as(B, `select * from profiles`)).rows.length === 2);
ok("yabancı yalnız kendi profilini görür", (await as(C, `select * from profiles`)).rows.length === 1);

const s = (await as(B, `insert into surveys (org_id,title,created_by) values ($1,'Anket','${B}') returning *`, [org.id])).rows[0];
await new Promise((r) => setTimeout(r, 10));
const upd = (await as(B, `update surveys set title='Yeni' where id=$1 returning updated_at`, [s.id])).rows[0];
ok("updated_at tetikleyicisi çalışır", upd.updated_at > s.updated_at);
await expectFail("başkası adına anket", as(B, `insert into surveys (org_id,title,created_by) values ($1,'X','${A}')`, [org.id]));
ok("yabancı anketi göremez", (await as(C, `select * from surveys`)).rows.length === 0);
ok("üye anket silemez (0 satır)", (await as(B, `delete from surveys where id=$1 returning id`, [s.id])).rows.length === 0);
ok("üye, üye çıkaramaz", (await as(B, `delete from memberships where user_id='${A}' returning *`)).rows.length === 0);
ok("sahip kendini çıkaramaz", (await as(A, `delete from memberships where user_id='${A}' returning *`)).rows.length === 0);
ok("yönetici anket siler", (await as(A, `delete from surveys where id=$1 returning id`, [s.id])).rows.length === 1);
ok("sahip üyeyi çıkarır", (await as(A, `delete from memberships where user_id='${B}' returning *`)).rows.length === 1);
ok("çıkarılan üye kurumu artık göremez", (await as(B, `select * from organizations`)).rows.length === 0);
await expectFail("oturumsuz RPC", as("", `select * from create_organization('A','a','b','c','d')`));

// ---------------- Aşama 3: herkese açık anket yanıtlama ----------------
const sorular = JSON.stringify([
  { id: "q1", type: "tek_secim", title: "Renk", required: true, options: ["Mavi", "Yeşil"] },
  { id: "q2", type: "nps", title: "NPS", required: true },
  { id: "q3", type: "uzun_metin", title: "Öneri", required: false },
]);
const ayar = (o = {}) => JSON.stringify({ anonymous: true, singleResponse: true, showProgress: true, ...o });
const pub = (await as(A, `insert into surveys (org_id,title,created_by,questions,settings) values ($1,'Açık Anket','${A}',$2,$3) returning *`, [org.id, sorular, ayar()])).rows[0];
const getPub = async (id) => (await asAnon(`select get_public_survey($1) as s`, [id])).rows[0].s;
const gonder = (id, cevap, kim = null) =>
  kim ? as(kim, `select submit_response($1, $2) as r`, [id, JSON.stringify(cevap)]) : asAnon(`select submit_response($1, $2) as r`, [id, JSON.stringify(cevap)]);

ok("taslak anket katılımcıya gösterilmez", (await getPub(pub.id)) === null);
await expectFail("taslak ankete yanıt", gonder(pub.id, { q1: "Mavi", q2: 5 }));
await as(A, `update surveys set status='yayinda' where id=$1`, [pub.id]);
const gorunen = await getPub(pub.id);
ok("yayındaki anket ziyaretçiye kurum adıyla gösterilir", gorunen?.status === "yayinda" && gorunen.orgName === "Güneş Okulu" && gorunen.questions.length === 3);
ok("ziyaretçi surveys tablosunu doğrudan okuyamaz", (await asAnon(`select * from surveys`)).rows.length === 0);
await expectFail("ziyaretçi responses tablosuna doğrudan yazamaz", asAnon(`insert into responses (survey_id, answers) values ($1, '{}')`, [pub.id]));
await expectFail("zorunlu soru eksik", gonder(pub.id, { q1: "Mavi" }));
await expectFail("boş dizi zorunlu soruyu karşılamaz", gonder(pub.id, { q1: [], q2: 3 }));
await expectFail("ankette olmayan soru anahtarı", gonder(pub.id, { q1: "Mavi", q2: 3, hack: "x" }));
await expectFail("nesne olmayan yanıt", asAnon(`select submit_response($1, '[1,2]')`, [pub.id]));
ok("ziyaretçi geçerli yanıt gönderir (0 puan geçerli)", !!(await gonder(pub.id, { q1: "Mavi", q2: 0 })).rows[0].r);
ok("anonim ankette giriş yapmış kullanıcı tekrar yanıtlayabilir, kimliği kaydedilmez",
  !!(await gonder(pub.id, { q1: "Yeşil", q2: 9 }, C)).rows[0].r && !!(await gonder(pub.id, { q1: "Yeşil", q2: 8 }, C)).rows[0].r &&
  (await db.query(`select count(*)::int n from responses where survey_id=$1 and respondent_id is not null`, [pub.id])).rows[0].n === 0);

const kimlikli = (await as(A, `insert into surveys (org_id,title,created_by,questions,settings,status) values ($1,'Kimlikli','${A}',$2,$3,'yayinda') returning *`, [org.id, sorular, ayar({ anonymous: false })])).rows[0];
ok("kimlikli ankette ilk yanıt kabul edilir", !!(await gonder(kimlikli.id, { q1: "Mavi", q2: 1 }, C)).rows[0].r);
await expectFail("kişi başı tek yanıt: ikinci yanıt", gonder(kimlikli.id, { q1: "Mavi", q2: 2 }, C));
ok("kimlikli yanıtta katılımcı kimliği kaydedilir", (await db.query(`select respondent_id from responses where survey_id=$1`, [kimlikli.id])).rows[0].respondent_id === C);
await as(A, `update surveys set settings = settings || '{"singleResponse": false}' where id=$1`, [kimlikli.id]);
ok("tek yanıt kapalıysa aynı kişi tekrar yanıtlayabilir", !!(await gonder(kimlikli.id, { q1: "Mavi", q2: 3 }, C)).rows[0].r);

await as(A, `update surveys set settings = settings || '{"endsAt": "2020-01-01"}' where id=$1`, [pub.id]);
ok("süresi dolan anket kapalı görünür", (await getPub(pub.id))?.status === "kapali" && (await getPub(pub.id)).questions === undefined);
await expectFail("süresi dolan ankete yanıt", gonder(pub.id, { q1: "Mavi", q2: 5 }));
await as(A, `update surveys set status='kapali', settings = settings - 'endsAt' where id=$1`, [pub.id]);
await expectFail("kapalı ankete yanıt", gonder(pub.id, { q1: "Mavi", q2: 5 }));

ok("kurum üyesi yanıtları görür", (await as(A, `select * from responses where survey_id=$1`, [pub.id])).rows.length === 3);
ok("yabancı yanıtları göremez", (await as(C, `select * from responses`)).rows.length === 0);
ok("ziyaretçi yanıtları göremez", (await asAnon(`select * from responses`)).rows.length === 0);
ok("yabancı yanıt silemez", (await as(C, `delete from responses returning id`)).rows.length === 0);
ok("anket silinince yanıtları da silinir",
  (await as(A, `delete from surveys where id=$1 returning id`, [pub.id])).rows.length === 1 &&
  (await db.query(`select count(*)::int n from responses where survey_id=$1`, [pub.id])).rows[0].n === 0);

// ---------------- Koşullu sorular (TS ile ortak örnekler) ----------------
const ornek = JSON.parse(fs.readFileSync(new URL("./kosul-ornekleri.json", import.meta.url), "utf8"));
let uyumsuz = 0;
for (const o of ornek.kosullar) {
  const r = (await db.query(`select coalesce(kosul_saglandi($1::jsonb, $2::jsonb), false) as v`, [JSON.stringify(o.cond), o.answer === null ? null : JSON.stringify(o.answer)])).rows[0].v;
  if (r !== o.expected) { uyumsuz++; console.log("  uyumsuz:", JSON.stringify(o), "SQL:", r); }
}
ok(`koşul değerlendirmesi TS ile aynı (${ornek.kosullar.length} örnek)`, uyumsuz === 0);
let gUyumsuz = 0;
for (const o of ornek.gorunurluk) {
  const r = (await db.query(`select gorunur_sorular($1::jsonb, $2::jsonb) as v`, [JSON.stringify(ornek.anket), JSON.stringify(o.answers)])).rows[0].v;
  if (JSON.stringify(r) !== JSON.stringify(o.visible)) { gUyumsuz++; console.log("  uyumsuz görünürlük:", JSON.stringify(o.answers), "SQL:", r); }
}
ok(`görünür soru hesabı TS ile aynı (${ornek.gorunurluk.length} örnek)`, gUyumsuz === 0);
await expectFail("ziyaretçi yardımcı koşul fonksiyonunu doğrudan çağıramaz", asAnon(`select gorunur_sorular('[]', '{}')`));

const kosullu = (await as(A, `insert into surveys (org_id,title,created_by,questions,settings,status) values ($1,'Koşullu','${A}',$2,$3,'yayinda') returning *`,
  [org.id, JSON.stringify(ornek.anket), ayar({ singleResponse: false })])).rows[0];
ok("yüksek puanda gizli zorunlu soru aranmaz", !!(await gonder(kosullu.id, { a: 10 })).rows[0].r);
await expectFail("düşük puanda görünen zorunlu soru boş bırakılamaz", gonder(kosullu.id, { a: 2 }));
const kid = (await gonder(kosullu.id, { a: 10, b: "gizli soruya sızdırılan yanıt", c: "Evet", d: "Teşekkürler" })).rows[0].r;
const kayit = (await db.query(`select answers from responses where id=$1`, [kid])).rows[0].answers;
ok("gizli soruların yanıtları kaydedilmez", JSON.stringify(kayit) === JSON.stringify({ a: 10, d: "Teşekkürler" }));
const bos = (await gonder(kosullu.id, { a: 3, b: "Pahalı", c: "" })).rows[0].r;
ok("boş yanıtlar kaydedilmez", JSON.stringify((await db.query(`select answers from responses where id=$1`, [bos])).rows[0].answers) === JSON.stringify({ a: 3, b: "Pahalı" }));

// ---------------- Davet e-postası gönderim sınırı ----------------
const inv2 = (await as(A, `insert into invitations (org_id,email,role,invited_by) values ($1,'yeni@kurum.com','uye','${A}') returning *`, [org.id])).rows[0];
ok("yönetici davet e-postasını gönderebilir", (await as(A, `select mark_invitation_emailed($1) as v`, [inv2.id])).rows[0].v === true);
ok("60 saniye içinde tekrar gönderilemez", (await as(A, `select mark_invitation_emailed($1) as v`, [inv2.id])).rows[0].v === false);
await db.query(`update invitations set emailed_at = now() - interval '2 minutes' where id=$1`, [inv2.id]);
ok("60 saniye sonra tekrar gönderilebilir", (await as(A, `select mark_invitation_emailed($1) as v`, [inv2.id])).rows[0].v === true);
await expectFail("yönetici olmayan davet e-postası tetikleyemez", as(C, `select mark_invitation_emailed($1)`, [inv2.id]));
await expectFail("ziyaretçi davet e-postası tetikleyemez", asAnon(`select mark_invitation_emailed($1)`, [inv2.id]));
await expectFail("kabul edilmiş davet için e-posta gönderilemez", as(A, `select mark_invitation_emailed($1)`, [inv.id]));
ok("yabancı emailed_at alanını göremez", (await as(C, `select emailed_at from invitations`)).rows.length === 0);

// ---------------- Süper yönetici, abonelik, hesap durumu ----------------
const SA = "00000000-0000-0000-0000-0000000000aa", D = "00000000-0000-0000-0000-00000000000d", E = "00000000-0000-0000-0000-00000000000e", F = "00000000-0000-0000-0000-00000000000f";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('${SA}', 'MustafaSubasinin@gmail.com', '{"full_name":"Mustafa","kvkk_onay":"true"}', null),
  ('${D}', 'd@kurum.com', '{"full_name":"Dilek"}', now()), ('${E}', 'e@kurum.com', '{}', now()), ('${F}', 'f@kurum.com', '{}', now());`);
ok("KVKK onay zamanı kayıtta saklanır", (await db.query(`select kvkk_onay_at from profiles where id='${SA}'`)).rows[0].kvkk_onay_at !== null);
ok("e-postası doğrulanmamış süper yönetici adresi yetki almaz", (await as(SA, `select is_super_admin() v`)).rows[0].v === false);
await db.query(`update auth.users set email_confirmed_at = now() where id='${SA}'`);
ok("doğrulanmış süper yönetici tanınır", (await as(SA, `select is_super_admin() v`)).rows[0].v === true);
ok("normal kullanıcı süper yönetici değildir", (await as(A, `select is_super_admin() v`)).rows[0].v === false);
ok("süper yönetici tüm kurumları görür", (await as(SA, `select * from organizations`)).rows.length >= 2);
ok("süper yönetici tüm profilleri görür", (await as(SA, `select * from profiles`)).rows.length >= 7);
ok("süper yönetici tüm yanıtları görür", (await as(SA, `select * from responses`)).rows.length > 0);
ok("normal kullanıcı başkalarının profillerini göremez", (await as(E, `select * from profiles`)).rows.length === 1);
ok("süper yönetici başka kurumun anketini düzenler", (await as(SA, `update surveys set title = title || ' (SY)' where org_id=$1 returning id`, [org.id])).rows.length > 0);

const dOrg = (await as(D, `select * from create_organization('Dilek Derneği','dilek','Sivil Toplum / Dernek','1–10','Van')`)).rows[0];
ok("yeni kurum ücretsiz paketle ve aktif başlar", dOrg.plan_id === "baslangic" && dOrg.status === "aktif" && dOrg.ends_at === null);
await expectFail("kurum yöneticisi kendi abonelik durumunu değiştiremez", as(D, `update organizations set status='aktif', ends_at = now() + interval '1 year' where id=$1`, [dOrg.id]));
await expectFail("kurum yöneticisi paketini değiştiremez", as(D, `update organizations set plan_id='kurumsal' where id=$1`, [dOrg.id]));
ok("kurum yöneticisi kurum adını değiştirebilir", (await as(D, `update organizations set name='Dilek Yardımlaşma Derneği' where id=$1 returning id`, [dOrg.id])).rows.length === 1);
ok("kullanıcı adını ve telefonunu değiştirebilir", (await as(D, `update profiles set full_name='Dilek Kaya', phone='05550000000' where id='${D}' returning id`)).rows.length === 1);
await expectFail("kullanıcı kendi hesap durumunu değiştiremez", as(D, `update profiles set status='engellendi' where id='${D}'`));

ok("ziyaretçi paket fiyatlarını görür", (await asAnon(`select id, price from plans order by sort`)).rows.length === 3);
ok("normal kullanıcı paket fiyatını değiştiremez", (await as(D, `update plans set price=1 where id='profesyonel' returning id`)).rows.length === 0);
ok("süper yönetici paket fiyatını değiştirir", (await as(SA, `update plans set price=599 where id='profesyonel' returning price`)).rows[0].price === "599.00");
ok("normal kullanıcı IBAN değiştiremez", (await as(D, `update payment_settings set iban='TR00' returning iban`)).rows.length === 0);
ok("süper yönetici IBAN girer", (await as(SA, `update payment_settings set iban='TR120006400000112345678901', bank_name='Örnek Bank', account_holder='Anket360 Ltd.' returning iban`)).rows.length === 1);
ok("kullanıcılar IBAN bilgisini görür", (await as(D, `select iban from payment_settings`)).rows[0].iban === "TR120006400000112345678901");

const odeme = (await as(D, `insert into payments (org_id, plan_id, amount, status, note) values ($1,'profesyonel', 1, 'onaylandi', 'havale yaptım') returning *`, [dOrg.id])).rows[0];
ok("ödeme bildirimi tutarı paketten alır, durum 'beklemede' zorlanır", odeme.amount === "599.00" && odeme.status === "beklemede" && odeme.reference.length === 8 && odeme.created_by === D);
await expectFail("ücretsiz paket için ödeme bildirimi yapılamaz", as(D, `insert into payments (org_id, plan_id) values ($1,'baslangic')`, [dOrg.id]));
await expectFail("başka kurum adına ödeme bildirimi yapılamaz", as(E, `insert into payments (org_id, plan_id) values ($1,'profesyonel')`, [dOrg.id]));
ok("yabancı başka kurumun ödemelerini göremez", (await as(E, `select * from payments`)).rows.length === 0);
await expectFail("normal kullanıcı ödeme onaylayamaz", as(D, `select admin_odeme_karar($1, true)`, [odeme.id]));
await as(SA, `select admin_odeme_karar($1, true, 'Havale geldi')`, [odeme.id]);
const dOrg2 = (await db.query(`select * from organizations where id=$1`, [dOrg.id])).rows[0];
const gun = (new Date(dOrg2.ends_at) - Date.now()) / 86400000;
ok("onaylanan ödeme paketi ve süreyi günceller (+30 gün)", dOrg2.plan_id === "profesyonel" && gun > 29.9 && gun < 30.1);
await expectFail("aynı ödeme ikinci kez karara bağlanamaz", as(SA, `select admin_odeme_karar($1, false)`, [odeme.id]));

// Yayında anket sınırı (Başlangıç: 3)
const eOrg = (await as(E, `select * from create_organization('E Ltd','e','Perakende','1–10','Van')`)).rows[0];
const yeniAnket = (st) => as(E, `insert into surveys (org_id,title,created_by,questions,settings,status) values ($1,'S','${E}',$2,$3,$4) returning id`, [eOrg.id, sorular, ayar(), st]);
for (let i = 0; i < 3; i++) await yeniAnket("yayinda");
await expectFail("ücretsiz pakette 4. anket yayınlanamaz", yeniAnket("yayinda"));
ok("taslak anket sınırdan etkilenmez", (await yeniAnket("taslak")).rows.length === 1);
const eAnket = (await db.query(`select id from surveys where org_id=$1 and status='yayinda' limit 1`, [eOrg.id])).rows[0].id;
ok("aktif kurumun anketi yanıt alır", !!(await gonder(eAnket, { q1: "Mavi", q2: 5 })).rows[0].r);

await as(SA, `update organizations set status='pasif' where id=$1`, [eOrg.id]);
ok("pasif kurumun anketi kapalı görünür", (await getPub(eAnket))?.status === "kapali");
await expectFail("pasif kurumun anketi yanıt almaz", gonder(eAnket, { q1: "Mavi", q2: 5 }));
await expectFail("pasif kurum anket düzenleyemez", as(E, `update surveys set title='X' where id=$1`, [eAnket]));
await as(SA, `update organizations set status='aktif', plan_id='profesyonel', ends_at = now() - interval '1 day' where id=$1`, [eOrg.id]);
await expectFail("süresi dolan kurumun anketi yanıt almaz", gonder(eAnket, { q1: "Mavi", q2: 5 }));
await as(SA, `update organizations set ends_at = now() + interval '30 days' where id=$1`, [eOrg.id]);
ok("süre uzatılınca anket yeniden yanıt alır", !!(await gonder(eAnket, { q1: "Yeşil", q2: 7 })).rows[0].r);

// Hesap dondurma / engelleme / silme
await as(E, `select hesabimi_dondur()`);
ok("dondurulan hesap kurum verilerine erişemez", (await as(E, `select * from organizations`)).rows.length === 0);
ok("dondurulan hesap kendi profilini görür", (await as(E, `select status from profiles where id='${E}'`)).rows[0].status === "donduruldu");
await as(E, `select hesabimi_etkinlestir()`);
ok("kullanıcı kendi dondurduğu hesabı yeniden açar", (await as(E, `select * from organizations`)).rows.length === 1);
await as(SA, `update profiles set status='engellendi' where id='${E}'`);
await expectFail("engellenen kullanıcı hesabını kendisi açamaz", as(E, `select hesabimi_etkinlestir()`));
await expectFail("engellenen kullanıcı yeni kurum oluşturamaz", as(E, `select * from create_organization('Yeni','yeni','Diğer','1–10','Van')`));
ok("engellenen kullanıcı kurum verilerini göremez", (await as(E, `select * from surveys`)).rows.length === 0);

await expectFail("normal kullanıcı başkasını silemez", as(D, `select admin_kullanici_sil('${F}')`));
await expectFail("platform yöneticisi silinemez", as(SA, `select admin_kullanici_sil('${SA}')`));
await as(SA, `select admin_kullanici_sil('${E}')`);
ok("süper yönetici kullanıcıyı ve kurumunu siler", (await db.query(`select count(*)::int n from profiles where id='${E}'`)).rows[0].n === 0 && (await db.query(`select count(*)::int n from organizations where id=$1`, [eOrg.id])).rows[0].n === 0);
const fOrg = (await as(F, `select * from create_organization('F Kurum','f','Diğer','1–10','Van')`)).rows[0];
await as(F, `select hesabimi_sil()`);
ok("kullanıcı hesabını tamamen siler (KVKK), kurumu da silinir", (await db.query(`select count(*)::int n from auth.users where id='${F}'`)).rows[0].n === 0 && (await db.query(`select count(*)::int n from organizations where id=$1`, [fOrg.id])).rows[0].n === 0);
ok("silinen kurumun ödemeleri de silinir", (await db.query(`select count(*)::int n from payments where org_id=$1`, [fOrg.id])).rows[0].n === 0);

// Genel eğilim istatistiği
const istSorular = JSON.stringify([{ id: "g1", type: "tek_secim", title: "En önemli sorun", required: true, options: ["Ekonomi", "Eğitim"], statKey: "ulke-sorunu" }]);
const istA = (await as(A, `insert into surveys (org_id,title,created_by,questions,settings,status) values ($1,'İst A','${A}',$2,$3,'taslak') returning id`, [org.id, istSorular, ayar({ singleResponse: false })])).rows[0].id;
await as(SA, `update surveys set status='yayinda' where id=$1`, [istA]);
for (let i = 0; i < 6; i++) await gonder(istA, { g1: i < 5 ? "Ekonomi" : "Eğitim" });
ok("10 yanıttan azsa istatistik gösterilmez", (await as(D, `select genel_istatistik('ulke-sorunu') v`)).rows[0].v.yetersiz === true);
const istD = (await as(D, `insert into surveys (org_id,title,created_by,questions,settings,status) values ($1,'İst D','${D}',$2,$3,'yayinda') returning id`, [dOrg.id, istSorular, ayar({ singleResponse: false })])).rows[0].id;
for (let i = 0; i < 6; i++) await gonder(istD, { g1: i < 3 ? "Ekonomi" : "Eğitim" });
const ist = (await as(D, `select genel_istatistik('ulke-sorunu') v`)).rows[0].v;
ok("istatistik farklı kurumların yanıtlarını toplar (yalnız sayılar)", ist.toplam === 12 && ist.secenekler[0].label === "Ekonomi" && ist.secenekler[0].count === 8 && !JSON.stringify(ist).includes("respondent"));
await expectFail("ziyaretçi genel istatistiği çağıramaz", asAnon(`select genel_istatistik('ulke-sorunu')`));

console.log("pgcrypto token örneği:", (await db.query("select token from invitations limit 1")).rows[0]?.token);
await client.end();
