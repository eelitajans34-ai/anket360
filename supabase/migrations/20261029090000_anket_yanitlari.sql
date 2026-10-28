-- =====================================================================
-- Aşama 3 — herkese açık anket yanıtlama
-- Katılımcılar (giriş yapmış olsun olmasın) yalnızca bu iki fonksiyonu kullanır;
-- surveys / responses tablolarına doğrudan erişimleri yoktur.
-- =====================================================================

-- "Kişi başı tek yanıt" denetimi için (kural submit_response içinde uygulanır)
create index responses_respondent_idx
  on public.responses (survey_id, respondent_id)
  where respondent_id is not null;

-- ---------------------------------------------------------------------
-- Yayındaki anketin katılımcıya gösterilecek bilgileri
-- Dönüş: null (yok/taslak) | {status:'kapali', title} | tam anket bilgisi
-- ---------------------------------------------------------------------
create function public.get_public_survey(p_id uuid) returns jsonb
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
  if s.status = 'kapali' or (ends_at is not null and ends_at < current_date) then
    return jsonb_build_object('id', s.id, 'status', 'kapali', 'title', s.title);
  end if;
  select name into org_name from organizations where id = s.org_id;
  return jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'title', s.title,
    'description', s.description,
    'questions', s.questions,
    'settings', s.settings,
    'orgName', org_name
  );
end $$;

-- ---------------------------------------------------------------------
-- Yanıt kaydı (sunucu tarafı doğrulama)
-- ---------------------------------------------------------------------
create function public.submit_response(p_survey uuid, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.surveys;
  q jsonb;
  a jsonb;
  ends_at date;
  respondent uuid;
  new_id uuid;
  allowed_keys text[];
begin
  select * into s from surveys where id = p_survey;
  if not found or s.status <> 'yayinda' then
    raise exception 'Bu anket şu anda yanıt kabul etmiyor.' using errcode = 'P0002';
  end if;
  ends_at := nullif(s.settings ->> 'endsAt', '')::date;
  if ends_at is not null and ends_at < current_date then
    raise exception 'Bu anketin süresi doldu.' using errcode = 'P0002';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Yanıtlar geçersiz.' using errcode = '22023';
  end if;
  if pg_column_size(p_answers) > 65536 then
    raise exception 'Yanıtlar çok uzun.' using errcode = '22023';
  end if;

  -- Yalnızca ankette bulunan soruların yanıtları kabul edilir
  select coalesce(array_agg(x ->> 'id'), '{}') into allowed_keys from jsonb_array_elements(s.questions) x;
  if exists (select 1 from jsonb_object_keys(p_answers) k where k <> all (allowed_keys)) then
    raise exception 'Yanıtlar ankette olmayan bir soru içeriyor.' using errcode = '22023';
  end if;

  -- Zorunlu sorular
  for q in select * from jsonb_array_elements(s.questions) loop
    if coalesce((q ->> 'required')::boolean, false) then
      a := p_answers -> (q ->> 'id');
      if a is null or a = 'null'::jsonb or a = '""'::jsonb or a = '[]'::jsonb then
        raise exception 'Zorunlu soru yanıtlanmadı: %', q ->> 'title' using errcode = '23502';
      end if;
    end if;
  end loop;

  respondent := case when coalesce((s.settings ->> 'anonymous')::boolean, false) then null else auth.uid() end;
  if respondent is not null and coalesce((s.settings ->> 'singleResponse')::boolean, false)
     and exists (select 1 from responses where survey_id = s.id and respondent_id = respondent) then
    raise exception 'Bu anketi daha önce yanıtladınız.' using errcode = '23505';
  end if;

  insert into responses (survey_id, respondent_id, answers)
  values (s.id, respondent, p_answers)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.get_public_survey(uuid) from public;
revoke all on function public.submit_response(uuid, jsonb) from public;
grant execute on function public.get_public_survey(uuid) to anon, authenticated;
grant execute on function public.submit_response(uuid, jsonb) to anon, authenticated;
