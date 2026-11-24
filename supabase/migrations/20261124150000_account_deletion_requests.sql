-- Google Play hesap silme şartı: kullanıcı uygulama içinden ve web'den hesap silme talebi gönderebilir.
-- Talep yönetici panelinden işlenir; yasal saklama yükümlülüğü olan satış kayıtları hariç tüm veriler silinir.
create table if not exists public.emlakcrm_account_deletion_requests(
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  note text,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  requested_at timestamptz not null default now()
);
alter table public.emlakcrm_account_deletion_requests enable row level security;
create policy "deletion own or admin read" on public.emlakcrm_account_deletion_requests for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.emlakcrm_super_admins s where s.user_id = auth.uid()));
create policy "deletion admin update" on public.emlakcrm_account_deletion_requests for update to authenticated
  using (exists (select 1 from public.emlakcrm_super_admins s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.emlakcrm_super_admins s where s.user_id = auth.uid()));
create or replace function public.emlakcrm_request_account_deletion(p_note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); t timestamptz;
begin
  if v is null then raise exception 'not_authenticated'; end if;
  insert into public.emlakcrm_account_deletion_requests(user_id, email, note, status, requested_at)
  select v, u.email, left(coalesce(p_note, ''), 500), 'pending', now() from auth.users u where u.id = v
  on conflict (user_id) do update set status = 'pending', requested_at = now(), note = excluded.note
  returning requested_at into t;
  return t;
end $$;
revoke all on function public.emlakcrm_request_account_deletion(text) from public, anon;
grant execute on function public.emlakcrm_request_account_deletion(text) to authenticated;
