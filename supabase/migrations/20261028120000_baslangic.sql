-- =====================================================================
-- Anket360 — başlangıç şeması (Aşama 2)
-- GitHub Actions bu dosyayı `supabase db push` ile otomatik uygular.
-- =====================================================================

-- Supabase'de pgcrypto zaten "extensions" şemasında kuruludur; bu satırlar yerel testler içindir.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.org_role as enum ('sahip', 'yonetici', 'uye');
create type public.survey_status as enum ('taslak', 'yayinda', 'kapali');

-- ---------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  slug text not null unique,
  sector text not null,
  size text not null,
  city text not null,
  phone text,
  website text,
  owner_id uuid not null references public.profiles on delete restrict,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role public.org_role not null default 'uye',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  email text not null check (email = lower(email)),
  role public.org_role not null default 'uye' check (role <> 'sahip'),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  invited_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invitations_pending_uniq on public.invitations (org_id, email) where accepted_at is null;

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  status public.survey_status not null default 'taslak',
  questions jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index surveys_org_idx on public.surveys (org_id, updated_at desc);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys on delete cascade,
  respondent_id uuid references public.profiles on delete set null, -- anonim anketlerde null
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index responses_survey_idx on public.responses (survey_id);

-- ---------------------------------------------------------------------
-- Tetikleyiciler
-- ---------------------------------------------------------------------

-- Yeni Auth kullanıcısı için profil satırı oluştur
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- E-posta değişirse profili güncel tut
create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger surveys_touch before update on public.surveys
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Yetki yardımcıları (RLS özyinelemesini önlemek için security definer)
-- ---------------------------------------------------------------------

create function public.is_member(o uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid());
$$;

create function public.is_admin(o uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid() and role in ('sahip', 'yonetici'));
$$;

create function public.shares_org_with(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------------------------------------------------------------------
-- RPC: kurum oluşturma (kurum + sahip üyeliği tek işlemde, benzersiz slug)
-- ---------------------------------------------------------------------

create function public.create_organization(
  p_name text, p_slug text, p_sector text, p_size text, p_city text,
  p_phone text default null, p_website text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  base text := coalesce(nullif(regexp_replace(lower(p_slug), '[^a-z0-9-]+', '', 'g'), ''), 'kurum');
  candidate text := base;
  n int := 2;
  org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '28000';
  end if;
  while exists (select 1 from organizations where slug = candidate) loop
    candidate := base || '-' || n;
    n := n + 1;
  end loop;
  insert into organizations (name, slug, sector, size, city, phone, website, owner_id)
  values (trim(p_name), candidate, p_sector, p_size, trim(p_city), nullif(trim(p_phone), ''), nullif(trim(p_website), ''), auth.uid())
  returning * into org;
  insert into memberships (org_id, user_id, role) values (org.id, auth.uid(), 'sahip');
  return org;
end $$;

-- ---------------------------------------------------------------------
-- RPC: davet kabulü (davet e-postası oturumdaki kullanıcının e-postası olmalı)
-- ---------------------------------------------------------------------

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
  my_email text;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '28000';
  end if;
  select * into inv from invitations where token = p_token and accepted_at is null;
  if not found then
    raise exception 'Davet bulunamadı veya daha önce kullanılmış.' using errcode = 'P0002';
  end if;
  select email into my_email from profiles where id = auth.uid();
  if my_email is distinct from inv.email then
    raise exception 'Bu davet % adresine gönderildi. O adresle giriş yapın.', inv.email using errcode = '42501';
  end if;
  insert into memberships (org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;
  update invitations set accepted_at = now() where id = inv.id;
  return inv.org_id;
end $$;

revoke all on function public.create_organization(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- Satır düzeyi güvenlik (RLS)
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.surveys enable row level security;
alter table public.responses enable row level security;

-- Profiller: kendisi ve aynı kurumdaki kişiler görür; yalnız kendisi günceller
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Kurumlar: üyeler görür, yönetici günceller (oluşturma yalnız RPC ile)
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

-- Üyelikler: üyeler görür; yönetici sahip dışındakileri çıkarır (ekleme RPC ile)
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(org_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_admin(org_id) and role <> 'sahip');

-- Davetler: yalnız kurum yöneticileri
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_admin(org_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_admin(org_id) and invited_by = auth.uid());
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_admin(org_id));

-- Anketler: üyeler okur/yazar, yöneticiler siler
create policy surveys_select on public.surveys for select to authenticated
  using (public.is_member(org_id));
create policy surveys_insert on public.surveys for insert to authenticated
  with check (public.is_member(org_id) and created_by = auth.uid());
create policy surveys_update on public.surveys for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy surveys_delete on public.surveys for delete to authenticated
  using (public.is_admin(org_id));

-- Yanıtlar: kurum üyeleri okur (yanıt gönderme Aşama 3'te eklenecek)
create policy responses_select on public.responses for select to authenticated
  using (exists (select 1 from public.surveys s where s.id = survey_id and public.is_member(s.org_id)));
