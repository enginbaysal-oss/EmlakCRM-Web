-- 3-day trial for EmlakCRM accounts created after rollout.
-- No existing subscription, payment, CRM record or backup is modified.
create table if not exists public.emlakcrm_trial_config (
  id smallint primary key check (id = 1),
  enabled boolean not null default true,
  launched_at timestamptz not null default now(),
  trial_hours smallint not null default 72 check (trial_hours between 1 and 72)
);
alter table public.emlakcrm_trial_config enable row level security;
revoke all on public.emlakcrm_trial_config from public, anon, authenticated;
insert into public.emlakcrm_trial_config(id,enabled,launched_at,trial_hours)
values (1,true,now(),72)
on conflict (id) do nothing;

-- Authenticated callers can read only the deadline for their own account.
-- Use a definer because auth.users is not directly readable by client roles.
create or replace function public.emlakcrm_trial_expires_at()
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select case
    when cfg.enabled and u.created_at >= cfg.launched_at
    then u.created_at + (cfg.trial_hours * interval '1 hour')
    else null
  end
  from auth.users u
  cross join public.emlakcrm_trial_config cfg
  where cfg.id = 1 and u.id = (select auth.uid())
  limit 1
$$;
revoke all on function public.emlakcrm_trial_expires_at() from public, anon;
grant execute on function public.emlakcrm_trial_expires_at() to authenticated;

-- The same server-side entitlement governs CRM RLS and every UI module.
create or replace function public.emlakcrm_has_entitlement()
returns boolean
language sql stable
set search_path = ''
as $$
 select exists (
   select 1 from public.emlakcrm_super_admins a
   where a.user_id = (select auth.uid())
 ) or exists (
   select 1 from public.emlakcrm_subscriptions s
   where s.user_id = (select auth.uid())
     and s.status = 'active'
     and s.starts_at <= now()
     and s.expires_at > now()
 ) or coalesce(public.emlakcrm_trial_expires_at() > now(),false)
$$;

create or replace function public.emlakcrm_entitlement_status()
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
 v_user uuid := auth.uid();
 v_admin boolean := false;
 v_paid timestamptz;
 v_trial timestamptz;
 v_role text := 'unsubscribed';
 v_exp timestamptz;
begin
 if v_user is null then
   raise exception 'Giriş gerekli' using errcode='28000';
 end if;
 select exists(select 1 from public.emlakcrm_super_admins a where a.user_id=v_user) into v_admin;
 select max(s.expires_at) into v_paid
 from public.emlakcrm_subscriptions s
 where s.user_id=v_user and s.status='active' and s.starts_at<=now() and s.expires_at>now();
 v_trial := public.emlakcrm_trial_expires_at();
 if v_admin then
   v_role := 'super_admin';
 elsif v_paid is not null then
   v_role := 'subscriber'; v_exp := v_paid;
 elsif v_trial > now() then
   v_role := 'trial'; v_exp := v_trial;
 elsif v_trial is not null then
   v_role := 'trial_expired';
 end if;
 return jsonb_build_object(
    'allowed',v_role in ('super_admin','subscriber','trial'),
    'role',v_role,
    'expires_at',v_exp,
    'trial_expires_at',v_trial,
    'server_now',now()
 );
end;
$$;
revoke all on function public.emlakcrm_entitlement_status() from public, anon;
grant execute on function public.emlakcrm_entitlement_status() to authenticated;