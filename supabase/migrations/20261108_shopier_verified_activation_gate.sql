-- Shopier verified-order -> subscription activation, gated until end-to-end payment test.
-- This migration does not activate existing or new subscriptions.
CREATE TABLE IF NOT EXISTS public.emlakcrm_shopier_activation_control(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emlakcrm_shopier_activation_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_shopier_activation_control FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.emlakcrm_shopier_activation_control TO service_role;
INSERT INTO public.emlakcrm_shopier_activation_control(id,enabled) VALUES(true,false)
 ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.emlakcrm_shopier_orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.emlakcrm_shopier_orders ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE public.emlakcrm_shopier_orders DROP CONSTRAINT IF EXISTS emlakcrm_shopier_orders_processing_status_check;
ALTER TABLE public.emlakcrm_shopier_orders ADD CONSTRAINT emlakcrm_shopier_orders_processing_status_check
 CHECK(processing_status IN('awaiting_review','verified_review','needs_review','activated'));
CREATE UNIQUE INDEX IF NOT EXISTS emlakcrm_shopier_orders_user_reference
 ON public.emlakcrm_shopier_orders(order_id,user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.emlakcrm_shopier_activate_verified_order(
 p_order_id text, p_product_id text, p_email text, p_amount_kurus bigint
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_tier text;v_expected bigint;v_user uuid;v_subscription uuid;
 v_start timestamptz; v_end timestamptz;v_status text;v_matched integer;
BEGIN
 -- This routine is called ONLY by server-side service-role code after independent
 -- authenticated Shopier order API lookup and payment status verification.
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'service_role_only' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.emlakcrm_shopier_activation_control WHERE id=true AND enabled=true) THEN
   RETURN 'activation_disabled';
 END IF;
 IF p_order_id IS NULL OR p_order_id !~ '^[A-Za-z0-9_-]{1,120}$' OR
    p_email IS NULL OR length(p_email)>255 OR
    p_email<>lower(btrim(p_email)) THEN RETURN 'invalid_order_info'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('shopier_order:'||p_order_id));
 IF EXISTS(SELECT 1 FROM public.emlakcrm_subscriptions WHERE payment_provider='shopier' AND payment_reference=p_order_id) THEN
   RETURN 'already_activated';
 END IF;
 SELECT tier,expected_amount_kurus INTO v_tier,v_expected
 FROM public.emlakcrm_shopier_product_config
 WHERE product_id=p_product_id AND status='ready' FOR SHARE;
 IF NOT FOUND OR v_expected IS DISTINCT FROM p_amount_kurus THEN RETURN 'wrong_product_or_amount'; END IF;
 SELECT count(*),max(u.id) INTO v_matched,v_user
 FROM auth.users u WHERE lower(u.email)=p_email AND u.email_confirmed_at IS NOT NULL
 AND u.deleted_at IS NULL;
 IF v_matched<>1 OR v_user IS NULL THEN RETURN 'buyer_account_not_verified'; END IF;
 IF v_tier='ilyada3' AND NOT EXISTS(
   SELECT 1 FROM public.emlakcrm_office_discount_requests r
   WHERE r.user_id=v_user AND r.status='approved' AND r.code='ILYADA3'
 ) THEN RETURN 'office_not_approved'; END IF;
 -- Re-check after serializing all activations for this account.
 PERFORM pg_advisory_xact_lock(hashtext('shopier_user:'||v_user::text));
 IF EXISTS(SELECT 1 FROM public.emlakcrm_subscriptions WHERE payment_reference=p_order_id) THEN RETURN 'already_activated'; END IF;
 SELECT greatest(now(),coalesce(max(expires_at),now())) INTO v_start
 FROM public.emlakcrm_subscriptions
 WHERE user_id=v_user AND status='active' AND expires_at>now();
 v_end:=v_start+interval '12 months';
 INSERT INTO public.emlakcrm_subscriptions(
  user_id,status,starts_at,expires_at,payment_provider,payment_reference
 ) VALUES(v_user,'active',v_start,v_end,'shopier',p_order_id)
 RETURNING id INTO v_subscription;
 UPDATE public.emlakcrm_shopier_orders SET processing_status='activated',user_id=v_user,
   review_reason=NULL,activated_at=now(),last_checked_at=now()
 WHERE order_id=p_order_id;
 RETURN 'activated';
END $fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_shopier_activate_verified_order(text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_shopier_activate_verified_order(text,text,text,bigint) TO service_role;
