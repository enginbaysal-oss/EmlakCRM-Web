# EmlakCRM ücretli üyelik — uygulama tasarımı

## Doğrulanmış mevcut durum (2026-11-02)
- Web giriş ve ofis API: Supabase `tffvwxskvjuxoekwgdef`.
- Mevcut tablolar: `emlakcrm_records`, `emlakcrm_offices_cloud`, `emlakcrm_office_memberships`, `emlakcrm_office_portfolios`, PDF imza tabloları. Bunlar korunacak.
- Ürün fiyatı: **750 TL KDV dahil / 12 ay**, otomatik yenileme yok.
- iyzico henüz aktif değil. Ödeme alınmış veya abonelik etkinleştirilmiş gibi gösterilmemeli.
- `index.html` içindeki oturum kontrolü `/auth/v1/user` üzerinden yapılıyor. Lisans kontrolü ayrı bir sunucu yetki katmanı olmalı.
- Mevcut yerel CRM verileri ve PDF imzaları hiçbir geçiş sırasında silinmeyecek.

## Planlanan veri modeli (henüz uygulanmadı)
`emlakcrm_subscriptions`: `id uuid PK`, `user_id uuid NOT NULL REFERENCES auth.users(id)`, `status text` (pending, active, expired, revoked), `starts_at timestamptz`, `expires_at timestamptz`, `payment_provider text`, `payment_reference text UNIQUE`, `created_at timestamptz`, `updated_at timestamptz`. RLS açık; kullanıcının yalnız kendi lisansını okumasına izin verilir. Kullanıcıların doğrudan INSERT/UPDATE/DELETE hakkı olmaz. Sunucu tarafı doğrulama ile yönetilir.

`emlakcrm_payment_events`: sağlayıcı olay kimliği UNIQUE, ilgili abonelik, doğrulanmış tutar, para birimi, sonuç ve işlem zamanı. Yalnız güvenilir sunucu kimliği erişebilir. Kart bilgisi tutulmaz.

## Kritik güvenlik ilkeleri
1. Başarılı ödeme yalnız **sunucudan iyzico API ile doğrulandıktan** sonra lisansı aktive eder; tarayıcıdaki `success` parametresi yeterli değildir.
2. Tekrarlanan callback/webhook olayları lisansı ikinci kez uzatamaz (idempotency).
3. Abonelik bitişi sunucu saatine göre denetlenir; istemci tarihi ve localStorage yetki kaynağı değildir.
4. Ofis üyeliği, abonelikten ayrı yetkilendirmedir; ücret ödemek başka ofisin kayıtlarını açmaz.
5. Mevcut kullanıcıların erişimi, gerçek ödeme sistemi canlıya alınmadan yanlışlıkla kapatılmaz.
6. iyzico gizli anahtarları yalnız sunucu sırlarında saklanır; GitHub Pages'e yazılmaz.
7. 12 ayın başlangıç tarihi doğrulanmış ödeme zamanı olmalı; iade/iptal durumları için ayrı kurallar ve audit kaydı bulunmalı.
8. Yayına almadan önce gerçek kullanıcı, aboneliği bitmiş kullanıcı, başka ofis kullanıcısı ve oturumsuz kullanıcı test edilmeli.

## Uygulama sırası
- [x] Aktif web kodu ve Supabase proje bağlantısı kontrol edildi.
- [x] Mevcut tablo envanteri çıkarıldı.
- [x] Ayrı geliştirme dalı açıldı.
- [ ] Abonelik tablosu ve RLS migration hazırlanıp incelenecek.
- [ ] Sunucu lisans sorgulama ve yönetici ödeme doğrulama uçları hazırlanacak.
- [ ] Üyelik/abonelik ekranı bağlanacak.
- [ ] iyzico canlı başvuru ve test kimlikleri sağlandıktan sonra ödeme akışı entegre edilecek.
- [ ] Regresyon testleri, güvenlik kontrolleri ve yayın.

**Bu dosya yalnızca geliştirme planıdır. Veritabanında veya canlı uygulamada lisans etkinleştirilmedi.**
