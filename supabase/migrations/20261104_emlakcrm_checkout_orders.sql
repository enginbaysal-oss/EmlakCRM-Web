-- EmlakCRM iyzico Checkout Form order state. No card data is stored.
-- This migration does NOT enable payment collection or modify existing PDF functions.
CREATE TABLE IF NOT EXISTS public.emlakcrm_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_token text UNIQUE,
  checkout_url text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','paid','failed','review')),
  amount_kurus integer NOT NULL DEFAULT 75000 CHECK (amount_kurus = 75000),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  provider_payment_id text UNIQUE,
  subscription_id uuid REFERENCES public.emlakcrm_subscriptions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS emlakcrm_one_open_checkout_per_user
  ON public.emlakcrm_checkout_sessions(user_id)
  WHERE status IN ('created','pending');
CREATE INDEX IF NOT EXISTS emlakcrm_checkout_user_created
  ON public.emlakcrm_checkout_sessions(user_id,created_at DESC);
ALTER TABLE public.emlakcrm_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_checkout_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.emlakcrm_checkout_sessions TO service_role;

-- The only subscription writer is the server's service role after independently
-- retrieving and verifying an iyzico payment; the browser cannot execute this.
CREATE OR REPLACE FUNCTION public.emlakcrm_activate_verified_checkout(
  p_checkout_id uuid,
  p_token text,
  p_payment_id text,
  p_amount_kurus bigint,
  p_currency text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_order public.emlakcrm_checkout_sessions%ROWTYPE;
  v_subscription_id uuid;
  v_starts timestamptz;
  v_existing_expires timestamptz;
BEGIN
  IF p_payment_id IS NULL OR length(p_payment_id)<1 OR length(p_payment_id)>120
     OR p_token IS NULL OR p_amount_kurus<>75000 OR p_currency<>'TRY'
  THEN RAISE EXCEPTION 'payment_verification_required'; END IF;
  SELECT * INTO v_order FROM public.emlakcrm_checkout_sessions
    WHERE id=p_checkout_id FOR UPDATE;
  IF NOT FOUND OR v_order.provider_token IS DISTINCT FROM p_token
     OR v_order.amount_kurus<>75000 OR v_order.currency<>'TRY'
  THEN RAISE EXCEPTION 'order_mismatch'; END IF;
  IF v_order.status='paid' THEN
    IF v_order.provider_payment_id IS DISTINCT FROM p_payment_id
       OR v_order.subscription_id IS NULL THEN RAISE EXCEPTION 'duplicate_payment_conflict'; END IF;
    RETURN v_order.subscription_id;
  END IF;
  IF v_order.status<>'pending' THEN RAISE EXCEPTION 'order_not_pending'; END IF;
  -- Preserve any pre-existing time if the customer renewed concurrently.
  SELECT max(expires_at) INTO v_existing_expires
    FROM public.emlakcrm_subscriptions
    WHERE user_id=v_order.user_id AND status='active' AND expires_at>now();
  v_starts=now();
  INSERT INTO public.emlakcrm_subscriptions
    (user_id,status,starts_at,expires_at,payment_provider,payment_reference)
  VALUES
    (v_order.user_id,'active',v_starts,
     GREATEST(v_starts,coalesce(v_existing_expires,v_starts))+interval '12 months',
     'iyzico',p_payment_id)
  RETURNING id INTO v_subscription_id;
  INSERT INTO public.emlakcrm_payment_events
    (provider,provider_event_id,subscription_id,event_type,verified_amount_kurus,currency)
  VALUES ('iyzico',p_payment_id,v_subscription_id,'checkout_verified',75000,'TRY');
  UPDATE public.emlakcrm_checkout_sessions
     SET status='paid',provider_payment_id=p_payment_id,
         subscription_id=v_subscription_id,updated_at=now()
   WHERE id=p_checkout_id;
  RETURN v_subscription_id;
END;
$$;
REVOKE ALL ON FUNCTION public.emlakcrm_activate_verified_checkout(uuid,text,text,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_activate_verified_checkout(uuid,text,text,bigint,text)
  TO service_role;
