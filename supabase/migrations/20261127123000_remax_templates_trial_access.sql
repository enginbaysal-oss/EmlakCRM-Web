-- RE/MAX İlyada 3 şablonları: İlyada 3 onaylı danışman deneme süresindeyken de erişebilsin.
-- Önceki sürüm yalnızca ücretli aktif aboneliği sayıyordu; arayüz ise "aktif abonelik/deneme hakkı" diyordu.
create or replace function public.emlakcrm_can_access_remax_templates()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      exists (select 1 from public.emlakcrm_super_admins where user_id = auth.uid())
      or (
        exists (
          select 1 from public.emlakcrm_office_discount_requests
          where user_id = auth.uid() and status = 'approved'
        )
        and coalesce((public.emlakcrm_entitlement_status() ->> 'allowed')::boolean, false)
      )
    );
$function$;
