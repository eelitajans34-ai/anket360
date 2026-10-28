-- =====================================================================
-- Süper yönetici, abonelik/ödeme, hesap durumu (dondurma/engelleme/silme),
-- KVKK onay kaydı ve genel eğilim istatistiği
-- =====================================================================

-- ---------------------------------------------------------------------
-- Platform (süper) yöneticileri — istemciden erişilemez
-- ---------------------------------------------------------------------
create table public.platform_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
insert into public.platform_admins (email) values ('mustafasubasinin@gmail.com');

-- Oturumdaki kullanıcı süper yönetici mi? (e-postası doğrulanmış olmalı)
create function public.is_super_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from platform_admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
grant execute on function public.is_super_admin() to authenticated;

-- Sistem fonksiyonlarının korumalı alanları değiştirebilmesi için işlem içi bayrak
create function public.sistem_islemi() returns boolean
language sql stable as $$ select coalesce(current_setting('anket360.sistem', true), '') = '1' $$;

-- ---------------------------------------------------------------------
-- Profil: telefon, hesap durumu, KVKK onayı
-- ---------------------------------------------------------------------
alter table public.profiles
  add column phone text,
  add column status text not null default 'aktif' check (status in ('aktif', 'donduruldu', 'engellendi')),
  add column frozen_by text check (frozen_by in ('kullanici', 'yonetici')),
  add column kvkk_onay_at timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, kvkk_onay_at)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when (new.raw_user_meta_data ->> 'kvkk_onay') = 'true' then now() end
  );
  return new;
end $$;

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('anket360.sistem', '1', true);
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

-- Kullanıcı kendi profilinde yalnızca ad ve telefonu değiştirebilir
create function public.profil_koruma() returns trigger
language plpgsql as $$
begin
  if public.sistem_islemi() or public.is_super_admin() then
    return new;
  end if;
  if new.status is distinct from old.status or new.frozen_by is distinct from old.frozen_by
     or new.email is distinct from old.email or new.kvkk_onay_at is distinct from old.kvkk_onay_at then
    raise exception 'Bu alanlar buradan değiştirilemez.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_koruma before update on public.profiles for each row execute function public.profil_koruma();

-- Engellenen ya da dondurulan kullanıcı kurum verilerine erişemez
create or replace function public.is_member(o uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships m join profiles p on p.id = m.user_id
    where m.org_id = o and m.user_id = auth.uid() and p.status = 'aktif'
  );
$$;
create or replace function public.is_admin(o uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships m join profiles p on p.id = m.user_id
    where m.org_id = o and m.user_id = auth.uid() and m.role in ('sahip', 'yonetici') and p.status = 'aktif'
  );
$$;

-- Aktif olmayan hesap kurum oluşturamaz, davet kabul edemez (ikisi de üyelik ekler)
create function public.uyelik_hesap_kontrol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() and exists (select 1 from profiles where id = new.user_id and status <> 'aktif') then
    raise exception 'Hesabınız aktif değil.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger memberships_hesap_kontrol before insert on public.memberships for each row execute function public.uyelik_hesap_kontrol();

-- ---------------------------------------------------------------------
-- Paketler, ödeme bilgileri, ödemeler
-- ---------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  price numeric(10, 2) not null default 0 check (price >= 0),
  period_days int not null default 30 check (period_days > 0),
  max_active_surveys int check (max_active_surveys is null or max_active_surveys > 0),
  description text not null default '',
  features text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);
insert into public.plans (id, name, price, period_days, max_active_surveys, description, features, sort) values
  ('baslangic', 'Başlangıç', 0, 3650, 3, 'Küçük ekipler ve denemeler için.', array['Aynı anda 3 yayında anket', 'Hazır anketler', 'Temel raporlar', 'Excel / CSV / PDF'], 1),
  ('profesyonel', 'Profesyonel', 499, 30, null, 'Büyüyen kurumlar için.', array['Sınırsız anket', 'Gelişmiş raporlar', 'Ekip yönetimi', 'Öncelikli destek'], 2),
  ('kurumsal', 'Kurumsal', 1999, 30, null, 'Belediyeler ve büyük kurumlar için.', array['Sınırsız anket ve yanıt', 'Sınırsız ekip üyesi', 'Kurulum ve eğitim desteği', 'Özel destek hattı'], 3);

create table public.payment_settings (
  id boolean primary key default true check (id),
  bank_name text not null default '',
  account_holder text not null default '',
  iban text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.payment_settings (id) values (true);

alter table public.organizations
  add column plan_id text not null default 'baslangic' references public.plans,
  add column status text not null default 'aktif' check (status in ('aktif', 'pasif', 'donduruldu', 'engellendi')),
  add column ends_at timestamptz,
  add column admin_note text not null default '';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  plan_id text not null references public.plans,
  amount numeric(10, 2) not null default 0,
  reference text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  status text not null default 'beklemede' check (status in ('beklemede', 'onaylandi', 'reddedildi')),
  note text not null default '',
  admin_note text not null default '',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles on delete set null
);
create index payments_org_idx on public.payments (org_id, created_at desc);

-- Kurum şu an anket yayınlayıp yanıt alabilir mi?
create function public.kurum_kullanilabilir(o uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from organizations where id = o and status = 'aktif' and (ends_at is null or ends_at > now()));
$$;
grant execute on function public.kurum_kullanilabilir(uuid) to anon, authenticated;

-- Kurum yöneticisi abonelik alanlarını değiştiremez
create function public.kurum_koruma() returns trigger
language plpgsql as $$
begin
  if public.sistem_islemi() or public.is_super_admin() then
    return new;
  end if;
  if new.status is distinct from old.status or new.plan_id is distinct from old.plan_id
     or new.ends_at is distinct from old.ends_at or new.admin_note is distinct from old.admin_note
     or new.owner_id is distinct from old.owner_id then
    raise exception 'Abonelik bilgilerini yalnızca platform yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organizations_koruma before update on public.organizations for each row execute function public.kurum_koruma();

-- Ödeme bildirimi: tutar paketten alınır, durum her zaman "beklemede" başlar
create function public.odeme_hazirla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    new.status := 'beklemede';
    new.decided_at := null;
    new.decided_by := null;
    new.admin_note := '';
    new.created_by := auth.uid();
  end if;
  select price into new.amount from plans where id = new.plan_id;
  if new.amount is null or new.amount = 0 then
    raise exception 'Ücretsiz paket için ödeme bildirimi gerekmez.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger payments_hazirla before insert on public.payments for each row execute function public.odeme_hazirla();

-- Anket yayınlama: kurum kullanılabilir olmalı ve paketin yayında anket sınırı aşılmamalı
create function public.anket_yayin_kontrol() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  limit_ int;
  aktif int;
begin
  if public.is_super_admin() then
    return new;
  end if;
  if not public.kurum_kullanilabilir(new.org_id) then
    raise exception 'Kurumunuzun aboneliği aktif değil. Abonelik sayfasından paketinizi yenileyin.' using errcode = '42501';
  end if;
  if new.status = 'yayinda' and (tg_op = 'INSERT' or old.status <> 'yayinda') then
    select p.max_active_surveys into limit_ from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
    if limit_ is not null then
      select count(*) into aktif from surveys where org_id = new.org_id and status = 'yayinda' and id <> new.id;
      if aktif >= limit_ then
        raise exception 'Paketinizde aynı anda en fazla % anket yayında olabilir. Bir anketi kapatın ya da paketinizi yükseltin.', limit_ using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger surveys_yayin_kontrol before insert or update on public.surveys for each row execute function public.anket_yayin_kontrol();

-- Kullanılamayan kurumun anketi yanıt almaz
create function public.yanit_kurum_kontrol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.kurum_kullanilabilir((select org_id from surveys where id = new.survey_id)) then
    raise exception 'Bu anket şu anda yanıt kabul etmiyor.' using errcode = 'P0002';
  end if;
  return new;
end $$;
create trigger responses_kurum_kontrol before insert on public.responses for each row execute function public.yanit_kurum_kontrol();

-- Katılımcı sayfası: kullanılamayan kurumun anketi kapalı görünür
create or replace function public.get_public_survey(p_id uuid) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  s public.surveys;
  org_name text;
  ends_at date;
begin
  select * into s from surveys where id = p_id;
  if not found or s.status = 'taslak' then
    return null;
  end if;
  ends_at := nullif(s.settings ->> 'endsAt', '')::date;
  if s.status = 'kapali' or (ends_at is not null and ends_at < current_date) or not public.kurum_kullanilabilir(s.org_id) then
    return jsonb_build_object('id', s.id, 'status', 'kapali', 'title', s.title);
  end if;
  select name into org_name from organizations where id = s.org_id;
  return jsonb_build_object(
    'id', s.id, 'status', s.status, 'title', s.title, 'description', s.description,
    'questions', s.questions, 'settings', s.settings, 'orgName', org_name
  );
end $$;

-- Ödeme kararı (yalnız süper yönetici): onaylanınca paket ve süre güncellenir
create function public.admin_odeme_karar(p_id uuid, p_onay boolean, p_not text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  gun int;
begin
  if not public.is_super_admin() then
    raise exception 'Yetkiniz yok.' using errcode = '42501';
  end if;
  select * into pay from payments where id = p_id for update;
  if not found or pay.status <> 'beklemede' then
    raise exception 'Bekleyen ödeme bulunamadı.' using errcode = 'P0002';
  end if;
  update payments set status = case when p_onay then 'onaylandi' else 'reddedildi' end,
    decided_at = now(), decided_by = auth.uid(), admin_note = coalesce(p_not, '')
  where id = p_id;
  if p_onay then
    select period_days into gun from plans where id = pay.plan_id;
    update organizations set
      plan_id = pay.plan_id,
      ends_at = greatest(coalesce(ends_at, now()), now()) + make_interval(days => gun),
      status = case when status = 'pasif' then 'aktif' else status end
    where id = pay.org_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Hesap: dondurma, yeniden açma, silme (KVKK silme hakkı)
-- ---------------------------------------------------------------------
create function public.hesabimi_dondur() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('anket360.sistem', '1', true);
  update profiles set status = 'donduruldu', frozen_by = 'kullanici' where id = auth.uid() and status = 'aktif';
end $$;

create function public.hesabimi_etkinlestir() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('anket360.sistem', '1', true);
  update profiles set status = 'aktif', frozen_by = null
  where id = auth.uid() and status = 'donduruldu' and frozen_by = 'kullanici';
  if not found then
    raise exception 'Hesabınız platform yöneticisi tarafından kısıtlandı. Destek ile iletişime geçin.' using errcode = '42501';
  end if;
end $$;

-- Hesap silinince sahibi olduğu kurumlar (anketleri ve yanıtlarıyla) da silinir
alter table public.organizations drop constraint organizations_owner_id_fkey,
  add constraint organizations_owner_id_fkey foreign key (owner_id) references public.profiles on delete cascade;
alter table public.surveys alter column created_by drop not null,
  drop constraint surveys_created_by_fkey,
  add constraint surveys_created_by_fkey foreign key (created_by) references public.profiles on delete set null;

create function public.hesabimi_sil() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

create function public.admin_kullanici_sil(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then
    raise exception 'Yetkiniz yok.' using errcode = '42501';
  end if;
  if exists (select 1 from platform_admins a join auth.users u on lower(u.email) = a.email where u.id = p_user) then
    raise exception 'Platform yöneticisi silinemez.' using errcode = '42501';
  end if;
  delete from auth.users where id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- Genel eğilim istatistiği (yalnız toplam sayılar; en az 10 yanıt)
-- ---------------------------------------------------------------------
create function public.genel_istatistik(p_key text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  toplam int;
  sonuc jsonb;
  ort numeric;
begin
  with qs as (
    select s.id sid, q ->> 'id' qid from surveys s, jsonb_array_elements(s.questions) q where q ->> 'statKey' = p_key
  ), ans as (
    select r.answers -> qs.qid a from responses r join qs on r.survey_id = qs.sid where public.yanit_var(r.answers -> qs.qid)
  ), vals as (
    select a #>> '{}' v from ans where jsonb_typeof(a) <> 'array'
    union all
    select e #>> '{}' from ans, jsonb_array_elements(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) e
  )
  select (select count(*) from ans),
         coalesce((select jsonb_agg(jsonb_build_object('label', v, 'count', n) order by n desc, v)
                   from (select v, count(*) n from vals group by v) t), '[]'::jsonb),
         (select avg(v::numeric) from vals where v ~ '^-?\d+(\.\d+)?$')
    into toplam, sonuc, ort;
  if toplam < 10 then
    return jsonb_build_object('toplam', toplam, 'yetersiz', true);
  end if;
  return jsonb_build_object('toplam', toplam, 'secenekler', sonuc, 'ortalama', ort);
end $$;
revoke all on function public.genel_istatistik(text) from public, anon;
grant execute on function public.genel_istatistik(text) to authenticated;

revoke all on function public.hesabimi_dondur() from public, anon;
revoke all on function public.hesabimi_etkinlestir() from public, anon;
revoke all on function public.hesabimi_sil() from public, anon;
revoke all on function public.admin_kullanici_sil(uuid) from public, anon;
revoke all on function public.admin_odeme_karar(uuid, boolean, text) from public, anon;
grant execute on function public.hesabimi_dondur() to authenticated;
grant execute on function public.hesabimi_etkinlestir() to authenticated;
grant execute on function public.hesabimi_sil() to authenticated;
grant execute on function public.admin_kullanici_sil(uuid) to authenticated;
grant execute on function public.admin_odeme_karar(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.payment_settings enable row level security;
alter table public.payments enable row level security;

create policy plans_select on public.plans for select to anon, authenticated using (active or public.is_super_admin());
create policy payment_settings_select on public.payment_settings for select to authenticated using (true);
create policy payments_select on public.payments for select to authenticated using (public.is_admin(org_id));
create policy payments_insert on public.payments for insert to authenticated with check (public.is_admin(org_id));

-- Süper yönetici her tabloda tam yetkili
create policy sa_profiles on public.profiles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_organizations on public.organizations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_memberships on public.memberships for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_invitations on public.invitations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_surveys on public.surveys for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_responses on public.responses for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_plans on public.plans for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_payment_settings on public.payment_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy sa_payments on public.payments for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
