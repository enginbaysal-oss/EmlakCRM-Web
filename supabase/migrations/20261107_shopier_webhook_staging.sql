-- Shopier stage: server-only webhook token and provider-verified order records.
-- Subscription activation intentionally disabled until purchase reconciliation is tested.
CREATE TABLE IF NOT EXISTS public.emlakcrm_shopier_webhook_config (
  event text PRIMARY KEY CHECK (event IN ('order.created')),
  webhook_id text NOT NULL UNIQUE,
  token text NOT NULL CHECK (length(token) >= 12),
  endpoint_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emlakcrm_shopier_webhook_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.emlakcrm_shopier_webhook_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.emlakcrm_shopier_webhook_config TO service_role;
CREATE TABLE IF NOT EXISTS public.emlakcrm_shopier_orders (
  order_id text PRIMARY KEY,
  product_id text,
  buyer_email text,
  payment_status text,
  amount_kurus bigint,
  currency text,
  processing_status text NOT NULL DEFAULT 'awaiting_review',
  review_reason text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  CHECK (processing_status IN ('awaiting_review','verified_review','needs_review'))
);
ALTER TABLE public.emlakcrm_shopier_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.emlakcrm_shopier_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.emlakcrm_shopier_orders TO service_role;
COMMENT ON TABLE public.emlakcrm_shopier_webhook_config IS 'Secret Shopier webhook token. Server role only.';
COMMENT ON TABLE public.emlakcrm_shopier_orders IS 'Signed and provider-rechecked orders, no activation until tested.';