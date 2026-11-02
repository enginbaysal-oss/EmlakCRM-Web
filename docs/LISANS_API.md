# EmlakCRM lisans durumu API — 2026-11-02

Yeni Supabase Edge Function `emlakcrm-license-status` sürüm 1 olarak **ACTIVE** durumda. Proje `tffvwxskvjuxoekwgdef`.

`GET https://tffvwxskvjuxoekwgdef.supabase.co/functions/v1/emlakcrm-license-status`

İstek başlıkları: `Authorization: Bearer <kullanıcının Supabase access token'ı>` ve `apikey: <public publishable/anon key>`.

Başarılı yanıt alanları: `has_active_license`, `status`, `starts_at`, `expires_at`, `product`, `payment_enabled`. Fonksiyon Supabase Auth `/auth/v1/user` ile tokenı doğrular; kullanıcının yalnız kendi aboneliklerini RLS ile okur; tarih aralığını sunucu saatinde değerlendirir. Ödeme henüz etkin değil; `payment_enabled=false`.

Yanıt hata durumları: `401` oturum yok/geçersiz; `405` desteklenmeyen yöntem; `503` geçici servis veya yapılandırma sorunu. İstemci `503` durumunu lisanssız kullanıcı diye yorumlamamalı.

**Test durumu:** Fonksiyonun Supabase üzerinde ACTIVE olduğu tekrar doğrulandı. Gerçek kullanıcı JWT'siyle uçtan uca yanıt testi henüz yapılmadı; bunun için test hesabı gerekir. Fonksiyon henüz canlı web arayüzüne bağlanmadı. Eski kullanıcıların erişimi değiştirilmedi.

**Sonraki adım:** Hesap Yönetimi bölümüne lisans durumu göstergesi ve güvenli hata durumu ekle; ödeme doğrulama tamamlanana kadar özellik kilidi uygulama.
