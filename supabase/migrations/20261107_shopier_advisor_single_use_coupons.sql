-- Her onaylı İlyada 3 danışmanı için en fazla bir tek kullanımlık Shopier kodu.
-- Koda yalnızca service_role erişebilir. Kullanıcı kodu doğrulanmış Edge Function ile okur.
CREATE TABLE IF NOT EXISTS public.emlakcrm_shopier_coupons (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 code text NOT NULL UNIQUE CHECK(code ~ '^E3[A-Z0-9]{12}$'),
 shopier_discount_id text UNIQUE,
 amount_off_kurus integer NOT NULL DEFAULT 25000 CHECK(amount_off_kurus=25000),
 min_order_kurus integer NOT NULL DEFAULT 75000 CHECK(min_order_kurus=75000),
 uses_allowed integer NOT NULL DEFAULT 1 CHECK(uses_allowed=1),
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','issued','needs_review')),
 expires_at timestamptz NOT NULL,
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emlakcrm_shopier_coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_shopier_coupons FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT, UPDATE ON public.emlakcrm_shopier_coupons TO service_role;
COMMENT ON TABLE public.emlakcrm_shopier_coupons IS 'Private 250 TL single-use codes; only approved Ilyada3 account can fetch its own via verified server.';