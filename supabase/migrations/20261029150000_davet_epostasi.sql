-- =====================================================================
-- Davet e-postası: gönderim zamanı ve tekrar gönderim sınırı
-- E-postayı "davet-e-postasi" Edge Function'ı gönderir; önce bu fonksiyonu çağırır.
-- =====================================================================

alter table public.invitations add column emailed_at timestamptz;

-- Yönetici bu daveti şimdi e-postayla gönderebilir mi? (60 sn içinde tekrar gönderim yok)
-- Uygunsa gönderim zamanını işaretler ve true döner.
create function public.mark_invitation_emailed(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '28000';
  end if;
  select * into inv from invitations where id = p_id for update;
  if not found or not public.is_admin(inv.org_id) then
    raise exception 'Davet bulunamadı.' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Bu davet zaten kabul edildi.' using errcode = 'P0002';
  end if;
  if inv.emailed_at is not null and inv.emailed_at > now() - interval '60 seconds' then
    return false;
  end if;
  update invitations set emailed_at = now() where id = p_id;
  return true;
end $$;

revoke all on function public.mark_invitation_emailed(uuid) from public, anon;
grant execute on function public.mark_invitation_emailed(uuid) to authenticated;
