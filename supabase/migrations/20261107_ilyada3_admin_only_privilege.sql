-- EmlakCRM: İlyada 3 ayrıcalığı yalnızca Süper Yönetici tarafından tanımlanır.
-- Bu değişiklik, yeni abonelik ekranı yayınlandıktan sonra uygulanmalıdır.
-- Ofis ayrıcalığı ödeme/lisans oluşturmaz; yalnızca sunucu tarafında 500 TL
-- fiyatı ve onaylı RE/MAX şablon paketi görünürlüğü için kullanılır.

CREATE OR REPLACE FUNCTION public.emlakcrm_admin_set_office_privilege(
  p_user_id uuid,
  p_approved boolean
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_status text;
BEGIN
  IF v_actor IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id = v_actor
     ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'super_admin_not_eligible';
  END IF;

  v_status := CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END;
  INSERT INTO public.emlakcrm_office_discount_requests
    (user_id, office_id, code, status, reviewed_at, reviewed_by)
  VALUES
    (p_user_id, '11630db3-dfa9-479f-9673-2cf6ef467ddd'::uuid, 'ILYADA3', v_status, now(), v_actor)
  ON CONFLICT (user_id) DO UPDATE SET
    office_id = EXCLUDED.office_id,
    code = EXCLUDED.code,
    status = EXCLUDED.status,
    reviewed_at = now(),
    reviewed_by = v_actor;
  RETURN v_status;
END
$fn$;

REVOKE ALL ON FUNCTION public.emlakcrm_admin_set_office_privilege(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_admin_set_office_privilege(uuid, boolean)
  TO authenticated;

-- Her kullanıcıya açık indirim talep mekanizmasını kapat.
-- Başvuru yapan değil, yalnızca ofisi doğrulanıp yönetici tarafından seçilen
-- danışman indirimden yararlanır.
REVOKE EXECUTE ON FUNCTION public.emlakcrm_request_office_discount(text)
  FROM PUBLIC, anon, authenticated;

-- Özel RE/MAX JSON paketi GitHub Pages içinde dağıtılmaz.
-- İlyada 3 danışmanlığı ve aktif, doğrulanmış abonelik kontrol edilir.
CREATE OR REPLACE FUNCTION public.emlakcrm_can_access_remax_templates()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.emlakcrm_super_admins
      WHERE user_id = auth.uid()
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.emlakcrm_office_discount_requests
        WHERE user_id = auth.uid() AND status = 'approved'
      )
      AND EXISTS (
        SELECT 1 FROM public.emlakcrm_subscriptions
        WHERE user_id = auth.uid()
          AND status = 'active'
          AND starts_at <= now()
          AND expires_at > now()
      )
    )
  )
$fn$;

REVOKE ALL ON FUNCTION public.emlakcrm_can_access_remax_templates()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_can_access_remax_templates()
  TO authenticated;

-- Özel kapalı bucket: belgenin kendisi herkesçe indirilebilir olmamalı.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'emlakcrm-office-templates',
  'emlakcrm-office-templates',
  false, 20971520,
  ARRAY['application/json']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY['application/json']::text[];

DROP POLICY IF EXISTS emlakcrm_remax_private_read ON storage.objects;
CREATE POLICY emlakcrm_remax_private_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'emlakcrm-office-templates'
  AND name = 'ilyada3/remax-templates.json'
  AND public.emlakcrm_can_access_remax_templates()
);

-- Yalnız Süper Yönetici JSON dosyasını ekleyebilir/güncelleyebilir/kaldırabilir.
DROP POLICY IF EXISTS emlakcrm_remax_admin_insert ON storage.objects;
CREATE POLICY emlakcrm_remax_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'emlakcrm-office-templates'
  AND name = 'ilyada3/remax-templates.json'
  AND EXISTS (
    SELECT 1 FROM public.emlakcrm_super_admins
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS emlakcrm_remax_admin_update ON storage.objects;
CREATE POLICY emlakcrm_remax_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'emlakcrm-office-templates'
  AND name = 'ilyada3/remax-templates.json'
  AND EXISTS (
    SELECT 1 FROM public.emlakcrm_super_admins
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'emlakcrm-office-templates'
  AND name = 'ilyada3/remax-templates.json'
  AND EXISTS (
    SELECT 1 FROM public.emlakcrm_super_admins
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS emlakcrm_remax_admin_delete ON storage.objects;
CREATE POLICY emlakcrm_remax_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'emlakcrm-office-templates'
  AND name = 'ilyada3/remax-templates.json'
  AND EXISTS (
    SELECT 1 FROM public.emlakcrm_super_admins
    WHERE user_id = auth.uid()
  )
);
