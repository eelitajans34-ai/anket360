/**
 * supabase/schema.sql için RLS / yetki kontrolü.
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
await client.query("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop role if exists anon; drop role if exists authenticated;");
const db = { exec: (sql) => client.query(sql), query: (sql, params) => client.query(sql, params) };
// Supabase ortamının küçük taklidi: auth şeması, roller, auth.uid()
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create role anon; create role authenticated;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
await db.exec(`
  grant usage on schema public, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on function auth.uid() to authenticated;
`);
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}', 'Sahip@Kurum.com', '{"full_name":"Sahip"}'), ('${B}', 'uye@kurum.com', '{"full_name":"Üye"}'), ('${C}', 'yabanci@x.com', '{}');`);
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
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

console.log("pgcrypto token örneği:", (await db.query("select token from invitations limit 1")).rows[0]?.token);
await client.end();
