-- Public marketing asset for the private-listed Shopier product. Admin-only upload.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('emlakcrm-shopier-images','emlakcrm-shopier-images',true,5242880,ARRAY['image/png'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=5242880,allowed_mime_types=ARRAY['image/png'];
DROP POLICY IF EXISTS "emlakcrm_shopier_image_admin_select" ON storage.objects;
CREATE POLICY "emlakcrm_shopier_image_admin_select" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='emlakcrm-shopier-images' AND name='ilyada3/emlakcrm-500.png' AND EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()));
DROP POLICY IF EXISTS "emlakcrm_shopier_image_admin_insert" ON storage.objects;
CREATE POLICY "emlakcrm_shopier_image_admin_insert" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='emlakcrm-shopier-images' AND name='ilyada3/emlakcrm-500.png' AND EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()));
DROP POLICY IF EXISTS "emlakcrm_shopier_image_admin_update" ON storage.objects;
CREATE POLICY "emlakcrm_shopier_image_admin_update" ON storage.objects FOR UPDATE TO authenticated
 USING (bucket_id='emlakcrm-shopier-images' AND name='ilyada3/emlakcrm-500.png' AND EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()))
 WITH CHECK (bucket_id='emlakcrm-shopier-images' AND name='ilyada3/emlakcrm-500.png' AND EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()));

ALTER TABLE public.emlakcrm_shopier_product_config ADD COLUMN IF NOT EXISTS creation_lease_id uuid;
ALTER TABLE public.emlakcrm_shopier_product_config ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE public.emlakcrm_shopier_product_config ADD COLUMN IF NOT EXISTS create_attempted_at timestamptz;
INSERT INTO public.emlakcrm_shopier_product_config(tier,expected_amount_kurus,status)
VALUES('ilyada3',50000,'creating') ON CONFLICT(tier) DO NOTHING;
-- Atomic one-time creation lock prevents accidental duplicate Shopier products.
CREATE OR REPLACE FUNCTION public.emlakcrm_shopier_claim_product_creation(p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_count integer;
BEGIN
 IF p_lease IS NULL THEN RAISE EXCEPTION 'invalid_lease'; END IF;
 UPDATE public.emlakcrm_shopier_product_config
 SET creation_lease_id=p_lease,lease_expires_at=now()+interval '3 minutes',updated_at=now()
 WHERE tier='ilyada3' AND status='creating' AND create_attempted_at IS NULL
 AND (creation_lease_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at<now());
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END $fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_shopier_claim_product_creation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_shopier_claim_product_creation(uuid) TO service_role;
