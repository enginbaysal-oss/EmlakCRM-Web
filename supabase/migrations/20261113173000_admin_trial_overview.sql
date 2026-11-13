-- Include 72-hour trials in the existing super-admin account overview.
-- Leaves payment and paid subscription records untouched.
create or replace function public.emlakcrm_admin_subscription_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_actor uuid := auth.uid();
 v_rows jsonb;
begin
 if v_actor is null or not exists (
   select 1 from public.emlakcrm_super_admins sa where sa.user_id=v_actor
 ) then
   raise exception 'Bu işlem için süper yönetici yetkisi gerekli' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',u.id,
  'email',u.email,
  'created_at',u.created_at,
  'last_sign_in_at',u.last_sign_in_at,
  'is_super_admin',(sa.user_id is not null),
  'subscription_status',case
    when sa.user_id is not null then 'unlimited'
    when sub.status='active' and sub.starts_at<=now() and sub.expires_at>now() then 'active'
    when sub.status='revoked' then 'revoked'
    when sub.expires_at is not null and sub.expires_at<=now() then 'expired'
    when cfg.enabled and u.created_at>=cfg.launched_at and u.created_at+(cfg.trial_hours * interval '1 hour')>now() then 'trial'
    when cfg.enabled and u.created_at>=cfg.launched_at then 'trial_expired'
    when sub.id is null then 'none'
    else sub.status
  end,
  'starts_at',sub.starts_at,
  'expires_at',sub.expires_at,
  'trial_expires_at',case when cfg.enabled and u.created_at>=cfg.launched_at then u.created_at+(cfg.trial_hours*interval '1 hour') else null end,
  'payment_provider',sub.payment_provider
 ) order by u.created_at desc),'[]'::jsonb)
 into v_rows
 from auth.users u
 left join public.emlakcrm_super_admins sa on sa.user_id=u.id
 left join lateral (
  select s.id,s.status,s.starts_at,s.expires_at,s.payment_provider
  from public.emlakcrm_subscriptions s
  where s.user_id=u.id
  order by s.created_at desc,s.id desc
  limit 1
 ) sub on true
 cross join public.emlakcrm_trial_config cfg
 where cfg.id=1;
 return jsonb_build_object('users',v_rows,'generated_at',now());
end;
$$;