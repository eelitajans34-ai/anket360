-- Anket360 — Supabase şeması (TASLAK)
-- !!! Bu dosya HENÜZ UYGULANMADI. Supabase'e bağlanmadan önce proje sahibinin onayı gerekir. !!!
-- Kullanıcılar Supabase Auth (auth.users) üzerinden yönetilir.

create type org_role as enum ('sahip', 'yonetici', 'uye');
create type survey_status as enum ('taslak', 'yayinda', 'kapali');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null check (char_length(full_name) >= 2),
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 2),
  slug text not null unique,
  sector text not null,
  size text not null,
  city text not null,
  phone text,
  website text,
  owner_id uuid not null references auth.users,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid references organizations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role org_role not null default 'uye',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  title text not null,
  description text not null default '',
  status survey_status not null default 'taslak',
  questions jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys on delete cascade,
  respondent_id uuid references auth.users, -- anonim anketlerde null
  answers jsonb not null,
  created_at timestamptz not null default now()
);

-- Satır düzeyi güvenlik (RLS)
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table surveys enable row level security;
alter table responses enable row level security;

create function is_member(o uuid) returns boolean language sql security definer stable as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid());
$$;
create function is_admin(o uuid) returns boolean language sql security definer stable as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid() and role in ('sahip','yonetici'));
$$;

create policy "kendi profili" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "üye kurumu görür" on organizations for select using (is_member(id));
create policy "kurum oluşturma" on organizations for insert with check (owner_id = auth.uid());
create policy "yönetici kurumu günceller" on organizations for update using (is_admin(id));
create policy "üyeler listesi" on memberships for select using (is_member(org_id));
create policy "yönetici üye ekler" on memberships for insert with check (is_admin(org_id) or (user_id = auth.uid() and role = 'sahip'));
create policy "üye anketleri görür" on surveys for select using (is_member(org_id) or status = 'yayinda');
create policy "üye anket yazar" on surveys for insert with check (is_member(org_id) and created_by = auth.uid());
create policy "üye anket günceller" on surveys for update using (is_member(org_id));
create policy "yönetici anket siler" on surveys for delete using (is_admin(org_id));
create policy "yayındaki ankete yanıt" on responses for insert with check (
  exists (select 1 from surveys s where s.id = survey_id and s.status = 'yayinda')
);
create policy "üye yanıtları görür" on responses for select using (
  exists (select 1 from surveys s where s.id = survey_id and is_member(s.org_id))
);
