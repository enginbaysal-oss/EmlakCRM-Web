-- RE/MAX İlyada 3 şablon hakkını Ofis Paketi (500 TL) onayından ayırır.
-- Ofis Paketi artık en az 3 danışmanlı tüm ofislere açık; RE/MAX şablonları
-- yalnızca Süper Yöneticinin ayrıca onayladığı İlyada 3 danışmanlarına açılır.
-- Danışman talebi EmlakAsistan > Şablonlar bölümündeki kutudan gönderir.
-- Tekrar çalıştırılabilir (idempotent).

CREATE TABLE IF NOT EXISTS public.emlakcrm_remax_template_requests (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid
);
-- Tabloya doğrudan erişim yok; yalnızca aşağıdaki SECURITY DEFINER fonksiyonlar.
ALTER TABLE public.emlakcrm_remax_template_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emlakcrm_remax_template_requests FROM PUBLIC, anon, authenticated;

-- Bugüne kadar onaylanan herkes İlyada 3 danışmanıydı: şablon hakları korunur.
INSERT INTO public.emlakcrm_remax_template_requests (user_id, status, requested_at, reviewed_at)
SELECT d.user_id, 'approved', now(), now()
FROM public.emlakcrm_office_discount_requests d
WHERE d.status = 'approved'
ON CONFLICT (user_id) DO NOTHING;

-- Danışmanın kendi şablon onay durumu: none | pending | approved | rejected
CREATE OR REPLACE FUNCTION public.emlakcrm_remax_template_status()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id = auth.uid()) THEN 'approved'
    ELSE coalesce(
      (SELECT r.status FROM public.emlakcrm_remax_template_requests r WHERE r.user_id = auth.uid()),
      'none')
  END
$fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_remax_template_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_remax_template_status() TO authenticated;

-- Danışman onay talebi gönderir. Verilmiş bir karar (onay/ret) istemciden değiştirilemez.
CREATE OR REPLACE FUNCTION public.emlakcrm_request_remax_templates()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id = v_user) THEN
    RETURN 'approved';
  END IF;
  INSERT INTO public.emlakcrm_remax_template_requests (user_id, status)
  VALUES (v_user, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  SELECT status INTO v_status FROM public.emlakcrm_remax_template_requests WHERE user_id = v_user;
  RETURN coalesce(v_status, 'pending');
END
$fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_request_remax_templates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_request_remax_templates() TO authenticated;

-- Süper Yönetici: tüm şablon talepleri (e-posta ile)
CREATE OR REPLACE FUNCTION public.emlakcrm_admin_remax_template_requests()
RETURNS TABLE (user_id uuid, email text, status text, requested_at timestamptz, reviewed_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.emlakcrm_super_admins s WHERE s.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT r.user_id, u.email::text, r.status, r.requested_at, r.reviewed_at
    FROM public.emlakcrm_remax_template_requests r
    LEFT JOIN auth.users u ON u.id = r.user_id
    ORDER BY r.requested_at DESC;
END
$fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_admin_remax_template_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_admin_remax_template_requests() TO authenticated;

-- Süper Yönetici: şablon hakkını ver / kaldır (talep olmasa da)
CREATE OR REPLACE FUNCTION public.emlakcrm_admin_set_remax_templates(p_user_id uuid, p_approved boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_status text := CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END;
BEGIN
  IF v_actor IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id = v_actor) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  INSERT INTO public.emlakcrm_remax_template_requests (user_id, status, reviewed_at, reviewed_by)
  VALUES (p_user_id, v_status, now(), v_actor)
  ON CONFLICT (user_id) DO UPDATE
    SET status = EXCLUDED.status, reviewed_at = now(), reviewed_by = v_actor;
  RETURN v_status;
END
$fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_admin_set_remax_templates(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_admin_set_remax_templates(uuid, boolean) TO authenticated;

-- Şablon dosyasına erişim: Ofis Paketi onayı yerine RE/MAX şablon onayı aranır.
-- Aktif abonelik şartı aynen korunur. Depolama politikaları bu fonksiyonu
-- kullandığı için onlara dokunmak gerekmez.
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
        SELECT 1 FROM public.emlakcrm_remax_template_requests
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
REVOKE ALL ON FUNCTION public.emlakcrm_can_access_remax_templates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_can_access_remax_templates() TO authenticated;
