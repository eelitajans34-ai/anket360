-- =====================================================================
-- Koşullu sorular: bir soru, önceki bir sorunun yanıtına göre gösterilir.
-- Kurallar src/lib/conditions.ts ile birebir aynıdır.
-- =====================================================================

-- Yanıt "boş" değil mi? (null, "", [] boş sayılır; 0 geçerli yanıttır)
create function public.yanit_var(a jsonb) returns boolean
language sql immutable as $$
  select a is not null and a <> 'null'::jsonb and a <> '""'::jsonb and a <> '[]'::jsonb;
$$;

-- Bir koşul, kaynak sorunun yanıtıyla sağlanıyor mu?
create function public.kosul_saglandi(cond jsonb, a jsonb) returns boolean
language plpgsql immutable as $$
declare
  op text := cond ->> 'operator';
  v text := cond ->> 'value';
  answered boolean := public.yanit_var(a);
  an numeric;
  vn numeric;
begin
  case op
    when 'yanitlandi' then return answered;
    when 'yanitlanmadi' then return not answered;
    when 'esittir' then
      return answered and jsonb_typeof(a) <> 'array' and (a #>> '{}') = v;
    when 'esit_degil' then
      return answered and jsonb_typeof(a) <> 'array' and (a #>> '{}') <> v;
    when 'icerir' then
      return a is not null and jsonb_typeof(a) = 'array' and a ? v;
    when 'icermez' then
      return answered and jsonb_typeof(a) = 'array' and not (a ? v);
    when 'buyuk_esit', 'kucuk_esit' then
      if not answered or jsonb_typeof(a) = 'array' or (a #>> '{}') !~ '^-?\d+(\.\d+)?$' or v !~ '^-?\d+(\.\d+)?$' then
        return false;
      end if;
      an := (a #>> '{}')::numeric;
      vn := v::numeric;
      return case when op = 'buyuk_esit' then an >= vn else an <= vn end;
    else
      return false;
  end case;
end $$;

-- Yanıtlara göre görünen soruların kimlikleri (koşulun bağlı olduğu soru gizliyse soru da gizli)
create function public.gorunur_sorular(questions jsonb, answers jsonb) returns text[]
language plpgsql immutable as $$
declare
  q jsonb;
  cond jsonb;
  visible text[] := '{}';
begin
  for q in select * from jsonb_array_elements(coalesce(questions, '[]'::jsonb)) loop
    cond := q -> 'showIf';
    if cond is null or cond = 'null'::jsonb then
      visible := visible || (q ->> 'id');
    elsif (cond ->> 'questionId') = any (visible)
          and public.kosul_saglandi(cond, answers -> (cond ->> 'questionId')) then
      visible := visible || (q ->> 'id');
    end if;
  end loop;
  return visible;
end $$;

-- submit_response: zorunluluk yalnızca görünen sorulara uygulanır, gizli soruların yanıtları kaydedilmez
create or replace function public.submit_response(p_survey uuid, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.surveys;
  q jsonb;
  a jsonb;
  ends_at date;
  respondent uuid;
  new_id uuid;
  allowed_keys text[];
  visible text[];
  cleaned jsonb;
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

  select coalesce(array_agg(x ->> 'id'), '{}') into allowed_keys from jsonb_array_elements(s.questions) x;
  if exists (select 1 from jsonb_object_keys(p_answers) k where k <> all (allowed_keys)) then
    raise exception 'Yanıtlar ankette olmayan bir soru içeriyor.' using errcode = '22023';
  end if;

  visible := public.gorunur_sorular(s.questions, p_answers);

  for q in select * from jsonb_array_elements(s.questions) loop
    if coalesce((q ->> 'required')::boolean, false) and (q ->> 'id') = any (visible) then
      a := p_answers -> (q ->> 'id');
      if not public.yanit_var(a) then
        raise exception 'Zorunlu soru yanıtlanmadı: %', q ->> 'title' using errcode = '23502';
      end if;
    end if;
  end loop;

  -- Yalnızca görünen ve boş olmayan yanıtlar saklanır
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into cleaned
  from jsonb_each(p_answers)
  where key = any (visible) and public.yanit_var(value);

  respondent := case when coalesce((s.settings ->> 'anonymous')::boolean, false) then null else auth.uid() end;
  if respondent is not null and coalesce((s.settings ->> 'singleResponse')::boolean, false)
     and exists (select 1 from responses where survey_id = s.id and respondent_id = respondent) then
    raise exception 'Bu anketi daha önce yanıtladınız.' using errcode = '23505';
  end if;

  insert into responses (survey_id, respondent_id, answers)
  values (s.id, respondent, cleaned)
  returning id into new_id;
  return new_id;
end $$;

-- Yardımcı fonksiyonlar istemciye açılmaz (submit_response içinden kullanılır)
revoke all on function public.yanit_var(jsonb) from public, anon, authenticated;
revoke all on function public.kosul_saglandi(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.gorunur_sorular(jsonb, jsonb) from public, anon, authenticated;
