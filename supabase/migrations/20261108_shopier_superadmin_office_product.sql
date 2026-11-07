-- Superadmin-only registration of a privately listed Shopier 500 TL product URL.
CREATE OR REPLACE FUNCTION public.emlakcrm_admin_shopier_office_product()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'superadmin_required' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((
  SELECT jsonb_build_object('status',p.status,'product_url',p.product_url,'product_id',p.product_id,'expected_amount_kurus',p.expected_amount_kurus)
  FROM public.emlakcrm_shopier_product_config p WHERE p.tier='ilyada3'
 ), jsonb_build_object('status','not_created','expected_amount_kurus',50000));
END $fn$;

CREATE OR REPLACE FUNCTION public.emlakcrm_admin_set_shopier_office_product(p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_url text := btrim(coalesce(p_url,'')); v_match text[]; v_id text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'superadmin_required' USING ERRCODE='42501';
 END IF;
 v_match := regexp_match(v_url, '^https://(?:www\.)?shopier\.com/enginbaysal/([0-9]{5,20})/?$');
 IF v_match IS NULL THEN RAISE EXCEPTION 'invalid_shopier_product_url' USING ERRCODE='22023'; END IF;
 v_id := v_match[1];
 IF v_id='52694231' THEN RAISE EXCEPTION 'standard_product_not_allowed' USING ERRCODE='22023'; END IF;
 INSERT INTO public.emlakcrm_shopier_product_config(tier,expected_amount_kurus,product_id,product_url,status)
 VALUES ('ilyada3',50000,v_id,'https://www.shopier.com/enginbaysal/'||v_id,'ready')
 ON CONFLICT(tier) DO UPDATE SET
 expected_amount_kurus=50000,product_id=EXCLUDED.product_id,
 product_url=EXCLUDED.product_url,status='ready',updated_at=now();
 RETURN public.emlakcrm_admin_shopier_office_product();
END $fn$;

REVOKE ALL ON FUNCTION public.emlakcrm_admin_shopier_office_product() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emlakcrm_admin_set_shopier_office_product(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_admin_shopier_office_product() TO authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_admin_set_shopier_office_product(text) TO authenticated;
