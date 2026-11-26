-- Süper yönetici panelinden kullanıcı (abone) silme.
-- Hesap, aboneliği, bulut yedeği ve kişisel kayıtları silinir (auth.users -> cascade).
-- Yasal saklama gerektiren kayıtlar (sözleşme onayı, yasal e-posta gönderimi, Shopier siparişi)
-- silinmez; kullanıcı kimliği tarihsel referans olarak kalır ve e-posta adresi
-- emlakcrm_deleted_accounts tablosuna yazılır.

create table if not exists public.emlakcrm_deleted_accounts (
  user_id uuid primary key,
  email text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  note text
);

alter table public.emlakcrm_deleted_accounts enable row level security;

drop policy if exists emlakcrm_deleted_accounts_super_admin_read on public.emlakcrm_deleted_accounts;
create policy emlakcrm_deleted_accounts_super_admin_read
  on public.emlakcrm_deleted_accounts for select to authenticated
  using (exists (select 1 from public.emlakcrm_super_admins sa where sa.user_id = auth.uid()));

revoke all on public.emlakcrm_deleted_accounts from anon;
grant select on public.emlakcrm_deleted_accounts to authenticated;

-- Yasal kayıtlar kullanıcı silinince silinmesin ve silmeyi de engellemesin:
-- bu tablolardaki auth.users yabancı anahtarları kaldırılır, user_id değeri olduğu gibi kalır.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.conrelid::regclass::text in (
        'emlakcrm_checkout_consent_events',
        'emlakcrm_legal_delivery_jobs',
        'emlakcrm_shopier_orders'
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

create or replace function public.emlakcrm_admin_delete_user(p_user_id uuid, p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email text;
begin
  if v_caller is null or not exists (select 1 from public.emlakcrm_super_admins where user_id = v_caller) then
    raise exception 'Bu işlem için süper yönetici yetkisi gerekir.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Kullanıcı seçilmedi.';
  end if;
  if p_user_id = v_caller then
    raise exception 'Kendi hesabınızı buradan silemezsiniz.';
  end if;
  if exists (select 1 from public.emlakcrm_super_admins where user_id = p_user_id) then
    raise exception 'Süper yönetici hesabı silinemez.';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'Kullanıcı bulunamadı.';
  end if;
  if lower(trim(coalesce(p_confirm_email, ''))) <> lower(v_email) then
    raise exception 'Onay için yazılan e-posta adresi kullanıcının adresiyle eşleşmiyor.';
  end if;

  insert into public.emlakcrm_deleted_accounts (user_id, email, deleted_by, note)
  values (p_user_id, v_email, v_caller, 'Süper yönetici panelinden silindi')
  on conflict (user_id) do update set email = excluded.email, deleted_at = now(), deleted_by = excluded.deleted_by;

  -- Silmeyi engelleyebilecek, yöneticiye ait isteğe bağlı referanslar
  update public.emlakcrm_office_discount_requests set reviewed_by = null where reviewed_by = p_user_id;

  delete from auth.users where id = p_user_id;

  return jsonb_build_object('deleted', true, 'user_id', p_user_id, 'email', v_email);
end;
$$;

revoke all on function public.emlakcrm_admin_delete_user(uuid, text) from public, anon;
grant execute on function public.emlakcrm_admin_delete_user(uuid, text) to authenticated;
