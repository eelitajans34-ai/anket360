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
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
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

console.log("pgcrypto token örneği:", (await db.query("select token from invitations limit 1")).rows[0]?.token);
await client.end();
