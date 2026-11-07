-- Yalnız oturum açan kullanıcı ofis doğrulama talebi oluşturabilir.
-- Evet yanıtı otomatik 500 TL indirim değildir; Süper Yönetici incelemesi gerekir.
-- Onay/reddedilmiş kayıtlar istemci tarafından değiştirilemez, yeni istek spamı engellenir.
CREATE OR REPLACE FUNCTION public.emlakcrm_request_office_discount(p_code text)
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
    RAISE EXCEPTION 'login_required' USING ERRCODE='42501';
  END IF;
  IF upper(trim(coalesce(p_code,''))) <> 'ILYADA3' THEN
    RAISE EXCEPTION 'invalid_office_code' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.emlakcrm_super_admins WHERE user_id=v_user) THEN
    RAISE EXCEPTION 'super_admin_exempt' USING ERRCODE='42501';
  END IF;
  SELECT status INTO v_status FROM public.emlakcrm_office_discount_requests WHERE user_id=v_user;
  IF FOUND THEN
    RETURN v_status; -- pending, approved ya da rejected: mevcut kararı koru
  END IF;
  INSERT INTO public.emlakcrm_office_discount_requests(user_id,office_id,code,status)
  VALUES(v_user, '11630db3-dfa9-479f-9673-2cf6ef467ddd'::uuid,'ILYADA3','pending')
  ON CONFLICT(user_id) DO NOTHING;
  SELECT status INTO v_status FROM public.emlakcrm_office_discount_requests WHERE user_id=v_user;
  RETURN coalesce(v_status,'pending');
END;
$fn$;
REVOKE ALL ON FUNCTION public.emlakcrm_request_office_discount(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emlakcrm_request_office_discount(text) TO authenticated;
