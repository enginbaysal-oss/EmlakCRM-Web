-- EmlakCRM: ücretli kayıt erişimini sunucu tarafında sınırla.
-- İNCELEME İÇİN: Canlı Supabase üzerinde henüz çalıştırılmadı.
-- PDF imza ve eski ofis tablolarına dokunmaz.
-- İki mevcut süper yönetici satırı korunur.
CREATE OR REPLACE FUNCTION public.emlakcrm_has_entitlement()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.emlakcrm_super_admins a
   WHERE a.user_id = (SELECT auth.uid())
 ) OR EXISTS (
   SELECT 1 FROM public.emlakcrm_subscriptions s
   WHERE s.user_id = (SELECT auth.uid())
     AND s.status = 'active'
     AND s.starts_at <= now()
     AND s.expires_at > now()
 );
$$;
REVOKE ALL ON FUNCTION public.emlakcrm_has_entitlement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emlakcrm_has_entitlement() TO authenticated;

ALTER POLICY "EmlakCRM own records select" ON public.emlakcrm_records
 USING ((SELECT auth.uid()) = user_id AND (SELECT public.emlakcrm_has_entitlement()));
ALTER POLICY "EmlakCRM own records insert" ON public.emlakcrm_records
 WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.emlakcrm_has_entitlement()));
ALTER POLICY "EmlakCRM own records update" ON public.emlakcrm_records
 USING ((SELECT auth.uid()) = user_id AND (SELECT public.emlakcrm_has_entitlement()))
 WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.emlakcrm_has_entitlement()));
ALTER POLICY "EmlakCRM own records delete" ON public.emlakcrm_records
 USING ((SELECT auth.uid()) = user_id AND (SELECT public.emlakcrm_has_entitlement()));
