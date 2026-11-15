# iPhone ve abonelik güvenliği — yayın öncesi test planı

Bu dal yalnızca test hazırlığı içindir; canlı sisteme, Supabase politikalarına, müşteri verilerine veya ödeme akışına dokunulmaz.

## Doğrulanan kod uyumsuzluğu
- Ana sayfa `emlakcrm_auth_session_v1` değerini sessionStorage'dan okuyor; `emlakcrm_auth_remember_v1` localStorage'dan oturum geri yükleme akışı içeriyor.
- PR #24'teki bağımsız modül koruması yalnızca sessionStorage'dan başlıyor. Ana sayfada oturumun geri yüklenmediği ayrı sekme veya doğrudan modül açılışı reddedilebilir.
- PR #24'teki `security/emlakcrm-entitlement-rls.sql` canlıya uygulanmamalı; önce gerçek şema ve politika adlarıyla test ortamında doğrulanmalı.

## Yayın kapıları (tamamlanmadan birleştirme yok)
- [ ] iPhone Safari: oturum açık kalsın, tarayıcıyı kapat/aç, ana sayfaya dön, bağımsız modülü doğrudan aç.
- [ ] iPhone Chrome: aynı oturum senaryoları.
- [ ] Farklı hesaplar: A kullanıcısının müşteri/portföy/yerel yedek verisi B hesabında görünmüyor.
- [ ] Süresi dolmuş ve deneme süresi bitmiş abonelikte erişim engelleniyor; aktif ve süper yönetici hesapları çalışıyor.
- [ ] Ağ hatası, süresi dolmuş token ve refresh token yenileme; kullanıcı kayıtları silinmiyor.
- [ ] Drone son kaydı izleme ve dosya paylaşımı iPhone'da; paylaşım yoksa dosya indirme alternatifi.
- [ ] PDF İmzala ve mevcut modüllerde regresyon testi.
- [ ] RLS SQL yalnızca izole test veritabanında denendi, geri dönüş planı doğrulandı.
- [ ] Gerçek cihaz ve kullanıcı oturum testlerinin sonuçları kaydedildi.

## Güvenli uygulama sırası
1. PR #24 oturum korumasını mevcut ana uygulama oturum yenileme mantığıyla uyumlu hale getir; localStorage'daki tokenı yetki kanıtı olarak tek başına kabul etme.
2. Sunucuda kimliği doğrula, ardından aboneliği sunucudan sorgula; istemci ekran gizleme tek başına veri güvenliği sağlamaz.
3. Test hesabı ve test verileriyle izole doğrulama yap.
4. Kullanıcının açık onayı olmadan PR birleştirme, dağıtım, SQL uygulama veya müşteri verisi değiştirme.
