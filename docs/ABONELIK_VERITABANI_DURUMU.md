# Abonelik veritabanı uygulama durumu — 2026-11-02

Supabase projesi: `tffvwxskvjuxoekwgdef`.

- `public.emlakcrm_subscriptions` oluşturuldu. RLS etkin. Yalnız `authenticated` kullanıcının kendi `user_id` satırını okumasına izin veren SELECT politikası var. İstemciye INSERT/UPDATE/DELETE verilmedi.
- `public.emlakcrm_payment_events` oluşturuldu. RLS etkin, istemci politikası yok; olay kayıtları yalnız güvenilir sunucu tarafından yönetilecek.
- Başarılı SQL doğrulaması: her iki tabloda RLS açık, politika sayıları sırasıyla 1 ve 0.
- Mevcut CRM, ofis ve PDF imza tablolarına müdahale edilmedi.
- Henüz ödeme doğrulama fonksiyonu, lisans ekranı veya iyzico entegrasyonu yok; lisans etkinleştirilmedi.

## Mevcut güvenlik uyarıları
Supabase güvenlik denetiminde, daha önce var olan PDF imza tabloları için RLS/politika uyarıları, ofis başvuru fonksiyonları için `SECURITY DEFINER` erişim uyarıları ve sızdırılmış parola korumasının kapalı olduğu uyarısı görüldü. İşlevleri bozma riskinden dolayı bunlara otomatik müdahale edilmedi. Yeni `emlakcrm_payment_events` tablosundaki politikasız RLS **kasıtlı olarak tamamen kapalı erişim** sağlar.

İlgili belgeler:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
