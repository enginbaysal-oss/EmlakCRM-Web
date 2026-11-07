-- Allow only superadmins to map pending office requests to the authenticated user ID.
CREATE OR REPLACE FUNCTION public.emlakcrm_admin_discount_requests()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()
 ) THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501'; END IF;
 RETURN coalesce((
 SELECT jsonb_agg(jsonb_build_object(
  'id',r.id,'user_id',r.user_id,'email',u.email,'status',r.status,
  'requested_at',r.requested_at,'reviewed_at',r.reviewed_at
 ) ORDER BY (r.status='pending') DESC,r.requested_at DESC)
 FROM public.emlakcrm_office_discount_requests r JOIN auth.users u ON u.id=r.user_id
 ),'[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_admin_discount_requests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emlakcrm_admin_discount_requests() TO authenticated;
