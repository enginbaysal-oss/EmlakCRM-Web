-- Keep a customer from starting a second Checkout Form while an earlier
-- payment is pending provider fraud/manual review.
DROP INDEX IF EXISTS public.emlakcrm_one_open_checkout_per_user;
CREATE UNIQUE INDEX emlakcrm_one_open_checkout_per_user
 ON public.emlakcrm_checkout_sessions(user_id)
 WHERE status IN ('created','pending','review');
