# EmlakCRM — Shopier sonrası yasal belge e-posta teslimi

## Güvenlik ve iş akışı

Bu modül mevcut Shopier ödeme/abonelik aktivasyon kodunu **değiştirmez**. Yalnızca sunucuda gerçekten `paid + activated` ve ilgili abonelik kaydı bulunan siparişleri dikkate alır.

1. Kullanıcı EmlakCRM ödeme ekranında üç ayrı kutucuğu işaretler. Sunucu `emlakcrm_checkout_consent_events` tablosunda versiyonlu, zaman damgalı bir ön ödeme onay kaydı oluşturur.
2. Shopier web kancası, siparişin başarıyla ödendiğini sunucu üzerinden doğrular ve mevcut ayrı mekanizmasıyla aboneliği etkinleştirir.
3. Bu modülün worker'ı (`emlakcrm_prepare_legal_delivery_jobs`) ödeme sonrası siparişi tarar. Hesap e-postası, 500/750 TL tutarı, ön onay tarihi, tek geçerli onay ve onaylı hukuk metni aynı anda eşleşirse `emlakcrm_legal_delivery_jobs` outbox'ına en fazla **bir iş** yazar. Eşleşme yoksa veya birden çok aday varsa otomatik e-posta göndermez.
4. İş, yalnızca service-role tarafından talep edilir. Edge Function doğrulanmış göndericisiyle Resend üzerinden **o tarihte kabul edilen üç HTML belgeyi ekli** e-posta yollar.
5. Başarılı Resend `id` döndükten sonra outbox `sent` yapılır. Aynı sipariş tekrar işleme alınmaz; yeniden deneme gerekiyorsa Resend `Idempotency-Key` aynı kalır.

## Durum — 8 Kasım 2026

- SQL tabloları ve güvenlik işlevleri Supabase projesinde uygulandı.
- Edge Function `emlakcrm-legal-delivery` sürüm 1 kuruldu, `verify_jwt=true`.
- **Gönderim kapalıdır:** `public.emlakcrm_legal_delivery_control.enabled=false`; Edge Function ayrıca `LEGAL_MAIL_AUTOSEND_ENABLED=true` gerektirir. Gerçek e-posta gönderilmedi.
- Hukuk belgesi sürümü `emlakcrm-legal-2026-11-08-v2` hâlâ `draft`, ödeme ekranındaki ilgili PR #84 birleştirilmedi.
- Geçmiş Shopier aboneliklerine geriye dönük e-posta yollanmaz. Teslimat etkinleştirme eşiği, proje aktif edilmeden önceki siparişleri hariç tutar.

## Sonradan canlıya açmak için ZORUNLU kontrol listesi

- [ ] Avukat 12 aylık dijital hizmet sözleşmesi, cayma/iade şartları ve tüketici/ticari satın alma hükümlerini onaylar.
- [ ] EmlakCRM'de ödeme öncesi ekranda hukuken onaylı metinler görünür; onaylanan aynı tam HTML metinler yeni/versiyonlanmış `legal_bundle_versions` kaydına yazılmıştır (`sha256` sunucuda hesaplanır).
- [ ] PR #84 ödeme için sunucu onay kayıt mekanizması ile birlikte test edilerek yayımlanır.
- [ ] Resend veya benzeri bağımsız, üretime uygun e-posta sağlayıcısında **gönderici alan adı** doğrulanır. GitHub Pages alt alan adı bir gönderici alan adı olarak kullanılmamalıdır.
- [ ] Supabase Dashboard → Edge Functions → Secrets altına `RESEND_API_KEY`, `LEGAL_MAIL_FROM` (ör. doğrulanmış alan adından bir adres), `LEGAL_MAIL_REPLY_TO` eklenir. Kodda asla gizli anahtar tutulmaz.
- [ ] Kontrollü bir ödeme testinde gönderilen üç ekin içerikleri, başarılı siparişe, tutara ve müşteri hesabına ait olduğu doğrulanır; 500/750 TL, mükerrer webhook, iki ayrı onay ve ağ hata senaryoları test edilir.
- [ ] `LEGAL_MAIL_AUTOSEND_ENABLED=true` Edge Function secret olarak set edilir. **Bu tek başına yetmez.**
- [ ] `UPDATE public.emlakcrm_legal_delivery_control SET enabled=true,activated_after=now(),updated_at=now() WHERE id=true;` işlemi, yeni müşterilere geçişten hemen önce yönetim tarafından uygulanır. Geçmiş siparişler kapsam dışıdır.
- [ ] Supabase Cron + Vault üzerinden örneğin 5 dakikada bir, sunucu **service-role** kimliğiyle `POST /functions/v1/emlakcrm-legal-delivery` çağrısı kurulur. Kullanıcı JWT'si, publishable key veya tarayıcı bu işlevi çağıramaz. Kişisel bilgiler/loglar haricî iş takip sistemlerine taşınmaz.
- [ ] Başarılı, bekleyen ve hatalı e-posta teslimleri yönetici ekranından denetlenir. İade/fesih ve manuel yeniden gönderim politikası ayrıca belirlenir.

## Test / kanıt

Supabase transaction-rollback testinde, gerçekte onaylı bir Shopier ödemesi için **örnek geçici rıza kaydı** eklenip yasal paket geçici olarak onaylanarak işleme alındı. `prepare` tam bir outbox işi yazdı; `claim` doğru belgeleri döndürdü; başarısız deneme `retry` durumunu oluşturdu. Test `ROLLBACK` ile temizlendi. Canlı outbox=0, hukuk sürümü=draft, delivery control=false.

**Sözleşme onayı e-posta kanıtı değildir, sözleşme e-postası da ödeme makbuzu değildir.** Shopier ödeme doğrulaması ayrı tutulur.
