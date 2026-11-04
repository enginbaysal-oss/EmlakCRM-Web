-- Completely isolated iyzico Sandbox test checkout ledger.
-- Sandbox success MUST NEVER create a production entitlement.
CREATE TABLE IF NOT EXISTS public.emlakcrm_sandbox_checkout_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 provider_token text UNIQUE,
 checkout_url text,
 provider_payment_id text UNIQUE,
 status text NOT NULL DEFAULT 'created'
   CHECK(status IN ('created','pending','approved','failed','review')),
 amount_kurus integer NOT NULL DEFAULT 75000 CHECK(amount_kurus=75000),
 currency text NOT NULL DEFAULT 'TRY' CHECK(currency='TRY'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS emlakcrm_one_open_sandbox_checkout_per_user
 ON public.emlakcrm_sandbox_checkout_sessions(user_id)
 WHERE status IN ('created','pending','review');
CREATE INDEX IF NOT EXISTS emlakcrm_sandbox_checkout_user_created_idx
 ON public.emlakcrm_sandbox_checkout_sessions(user_id,created_at DESC);
ALTER TABLE public.emlakcrm_sandbox_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_sandbox_checkout_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.emlakcrm_sandbox_checkout_sessions TO service_role;
