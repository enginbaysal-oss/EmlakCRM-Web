# EmlakCRM Abonelik Yönetimi — güvenli uygulama planı

Durum: Tasarım / uygulama öncesi kontrol. Bu dosya hiçbir canlı sistem davranışını değiştirmez.

## Mevcut durum (4 Kasım 2026)
- Supabase proje ref: tffvwxskvjuxoekwgdef (görünen adı EmlakCRM).
- Mevcut tablolar: emlakcrm_subscriptions, emlakcrm_payment_events, emlakcrm_super_admins.
- Kayıt sayıları: 0 abonelik, 0 ödeme olayı, 2 süper yönetici.
- Üç tablonun tamamında RLS etkin. Abonelik ve yönetici tablolarında yalnızca kişinin kendi satırını okuma politikası var. Ödeme olayları tablosunda istemci okuma politikası yok.
- Edge Functions: emlakcrm-license-status (JWT gerekli); emlakcrm-payment-activation (JWT kontrolü yok, ancak aktivasyon bilinçli olarak kapalı ve POST 503 dönüyor).
- PDF imza tabloları ve pdf-multi-sign fonksiyonu korunmalı.
- Lansman: 750 TL KDV dahil, 12 ay, otomatik yenileme yok.

## Güvenlik ve uygulama sırası
1. Süper yönetici kayıtlarının beklenen iki gerçek hesaba ait olduğunu yetkili kimlik doğrulamasıyla teyit et; kullanıcı kimliklerini veya e-postaları istemciye gömme.
2. Yeni, ayrı bir Edge Function: emlakcrm-admin-overview. Bearer JWT ile Supabase Auth kullanıcısını doğrula; doğrulanan auth user id ile emlakcrm_super_admins üyeliğini sunucu tarafında kontrol et. Yönetici değilse 403; anonimse 401.
3. Yönetici API'si yalnızca gerekli toplamları ve abonelik bitiş tarihlerini döndürsün. Müşteri e-posta/adları ancak iş ihtiyacı ve veri minimizasyonu değerlendirmesinden sonra eklensin. CORS ve oran sınırlaması gözden geçirilsin. Service-role anahtarı yalnızca Edge Function secret ortamında saklansın.
4. Admin arayüzünü ayrı geliştirme dalında JWT oturumu ve güvenli API ile bağla. Yalnızca sayfayı gizlemek yetki kontrolü sayılmaz. Başarısız API isteklerinde gerçek veri varmış gibi gösterme.
5. iyzico onayından sonra ayrı ödeme oluşturma ve sunucudan sunucuya doğrulama akışını uygula. API sırlarını hiçbir zaman GitHub Pages'e koyma. İyzico'dan doğrulanmayan bir başarı parametresi abonelik açmamalı.
6. Ödeme olaylarını provider + provider_event_id benzersiz anahtarıyla idempotent işle. Tutarı (75000 kuruş), para birimini (TRY), doğru kullanıcı ve işlem referansını doğrula. Yalnızca doğrulanmış ödeme aboneliği başlatsın; 12 takvim ayı bitişini kaydet.
7. Kullanıcıların kendi aboneliklerini okuyabildiğini, diğer abonelerin kayıtlarını okuyamadığını; yönetici olmayanların admin API'ye erişemediğini test et. Yeniden gönderilen ödeme olayı ikinci aktivasyon yaratmamalı.
8. Üretim ortamında PDF İmzala uçtan uca imzalama/indirme regresyon testi tamamlanmadan hiçbir ortak yetki veya veritabanı kuralını değiştirme.

## Yayın öncesi kontrol listesi
- [ ] İki süper yönetici kimliği doğrulandı
- [ ] Admin API kod incelemesi ve negatif yetki testleri
- [ ] Arayüz güvenli API ile bağlandı
- [ ] iyzico onayı ve canlı kimlik bilgileri
- [ ] Ödeme doğrulaması ve tekrar işlem önleme
- [ ] PDF İmzala regresyon testi
- [ ] Abonelik süresi dolma ve yenileme senaryoları
- [ ] Canlıya alma onayı

Not: Bu plan, henüz çalışır yönetici API'si veya ödeme entegrasyonu oluşturulduğu anlamına gelmez.
