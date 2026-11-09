-- EmlakCRM checkout consent evidence (applied to Supabase on 2026-11-08).
-- The text for a legal bundle version is stored separately as the complete HTML
-- snapshots of: on-bilgilendirme-formu, mesafeli-satis-sozlesmesi, teslimat-iade.
-- NEVER treat consent events as proof of completed Shopier payment.
-- A new revision to legal wording REQUIRES a new bundle version and snapshot.

CREATE TABLE IF NOT EXISTS public.emlakcrm_legal_bundle_versions (
  version text PRIMARY KEY,
  document_snapshots jsonb NOT NULL CHECK (jsonb_typeof(document_snapshots)='object'),
  snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emlakcrm_legal_bundle_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_legal_bundle_versions FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.emlakcrm_checkout_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'shopier' CHECK(provider='shopier'),
  amount_kurus integer NOT NULL CHECK(amount_kurus IN(50000,75000)),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK(currency='TRY'),
  subscription_months integer NOT NULL DEFAULT 12 CHECK(subscription_months=12),
  auto_renewal boolean NOT NULL DEFAULT false CHECK(auto_renewal=false),
  legal_version text NOT NULL REFERENCES public.emlakcrm_legal_bundle_versions(version),
  legal_snapshot_sha256 text NOT NULL CHECK(legal_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  preinfo_ack boolean NOT NULL CHECK(preinfo_ack),
  agreement_ack boolean NOT NULL CHECK(agreement_ack),
  early_start_ack boolean NOT NULL CHECK(early_start_ack),
  event_type text NOT NULL DEFAULT 'shopier_pre_redirect' CHECK(event_type='shopier_pre_redirect'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emlakcrm_checkout_consent_events_owner_time
  ON public.emlakcrm_checkout_consent_events(user_id,created_at DESC);
ALTER TABLE public.emlakcrm_checkout_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_checkout_consent_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.emlakcrm_checkout_consent_events TO authenticated;
DROP POLICY IF EXISTS emlakcrm_consent_read_own ON public.emlakcrm_checkout_consent_events;
CREATE POLICY emlakcrm_consent_read_own ON public.emlakcrm_checkout_consent_events
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);

CREATE OR REPLACE FUNCTION public.emlakcrm_capture_checkout_consents(
  p_amount_kurus integer,p_legal_version text,
  p_preinfo_ack boolean,p_agreement_ack boolean,p_early_start_ack boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_status text;v_tier text;v_expected integer;
  v_version text;v_digest text;v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'login_required' USING ERRCODE='42501'; END IF;
  IF p_preinfo_ack IS DISTINCT FROM true OR p_agreement_ack IS DISTINCT FROM true
     OR p_early_start_ack IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'all_separate_consents_required' USING ERRCODE='22023'; END IF;
  SELECT d.status INTO v_status FROM public.emlakcrm_office_discount_requests d WHERE d.user_id=v_uid;
  IF v_status='pending' THEN RAISE EXCEPTION 'office_approval_pending' USING ERRCODE='22023'; END IF;
  v_tier:=CASE WHEN v_status='approved' THEN 'ilyada3' ELSE 'standard' END;
  SELECT c.expected_amount_kurus INTO v_expected FROM public.emlakcrm_shopier_product_config c
    WHERE c.tier=v_tier AND c.status='ready';
  IF v_expected IS NULL OR p_amount_kurus IS DISTINCT FROM v_expected
  THEN RAISE EXCEPTION 'checkout_price_mismatch' USING ERRCODE='22023'; END IF;
  SELECT b.version,b.snapshot_sha256 INTO v_version,v_digest FROM public.emlakcrm_legal_bundle_versions b
    WHERE b.version=p_legal_version AND b.status='approved';
  IF v_version IS NULL THEN RAISE EXCEPTION 'legal_version_not_approved' USING ERRCODE='22023'; END IF;
  INSERT INTO public.emlakcrm_checkout_consent_events
    (user_id,amount_kurus,legal_version,legal_snapshot_sha256,preinfo_ack,agreement_ack,early_start_ack)
    VALUES(v_uid,v_expected,v_version,v_digest,true,true,true) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.emlakcrm_capture_checkout_consents(integer,text,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emlakcrm_capture_checkout_consents(integer,text,boolean,boolean,boolean) TO authenticated;

-- IMPORTANT: Legal bundle HTML is inserted by a controlled admin data operation,
-- after lawyers review the draft. Its SHA256 is calculated server-side:
-- encode(sha256(convert_to(document_snapshots::text,'UTF8')),'hex')
-- The current 'emlakcrm-legal-2026-11-08-v2' snapshot remains status='draft'.
-- Do not mark it approved or merge checkout until legal & durable-delivery review.

-- Customer self-service: read back the exact HTML archive of one's own consent event.
-- The function is intentionally read-only and does not disclose other users' events.
CREATE OR REPLACE FUNCTION public.emlakcrm_checkout_consent_copy(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'login_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'id',c.id,'accepted_at',c.created_at,'provider',c.provider,
  'amount_kurus',c.amount_kurus,'currency',c.currency,'subscription_months',c.subscription_months,
  'auto_renewal',c.auto_renewal,'legal_version',c.legal_version,
  'legal_snapshot_sha256',c.legal_snapshot_sha256,'documents',b.document_snapshots
 ) INTO v_result
 FROM public.emlakcrm_checkout_consent_events c
 JOIN public.emlakcrm_legal_bundle_versions b ON b.version=c.legal_version
 WHERE c.id=p_event_id AND c.user_id=v_uid;
 IF v_result IS NULL THEN RAISE EXCEPTION 'consent_not_found_for_account' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END;$function$;
REVOKE ALL ON FUNCTION public.emlakcrm_checkout_consent_copy(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.emlakcrm_checkout_consent_copy(uuid) TO authenticated;
