-- RE/MAX İlyada 3 şablon erişimini yeniden İlyada 3 ofis onayına bağlar.
-- 20261120190000 ile ayrılan "şablon onayı" vazgeçildiği için tek onay
-- (İlyada 3 ofis onayı) hem 500 TL fiyatı hem RE/MAX şablonlarını açar.
-- 22.11.2026 itibarıyla şablon onaylı 6 kişinin hepsinin ofis onayı vardı;
-- kimse erişim kaybetmez. emlakcrm_remax_template_requests tablosu ve
-- fonksiyonları zararsız olarak yerinde bırakıldı (artık kullanılmıyor).
-- Tekrar çalıştırılabilir.

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

REVOKE ALL ON FUNCTION public.emlakcrm_can_access_remax_templates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_can_access_remax_templates() TO authenticated;
