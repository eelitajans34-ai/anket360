# Ödeme yöntemleri

## Şu an
Havale, EFT ve FAST — süper yöneticinin **Yönetim → Ödeme Bilgileri** ekranında girdiği IBAN'a banka transferi.

Akış:
1. Ana sayfadaki fiyat kartında **Hemen başla** → (giriş yoksa kayıt + kurum) → `/panel/odeme/<paket>`
2. Kullanıcı yöntemi (Havale / EFT / FAST) seçer, IBAN ve açıklamayı kopyalar, gönderir, **Ödemeyi yaptım** der.
3. `payments` tablosuna `beklemede` kayıt düşer (yöntem `method` alanında).
4. Süper yönetici **Yönetim → Ödemeler**'den onaylar → paket ve süre otomatik güncellenir.

## Kredi kartı (PayTR vb.) eklemek
Kod buna hazır:
- `src/lib/payments/methods.ts` — yöntem listesi. Kart kaydı (`kredi_karti`) şu an `available: false` ("Yakında").
- `src/pages/panel/PaymentPage.tsx` — `MethodPanel` yöntem türüne göre panel gösterir; `kind: "kart"` için ayrı panel yazılır.

Gereken adımlar:
1. **Migration:** `payments_method_check` kısıtına `'kredi_karti'` eklenir; gerekirse sağlayıcı işlem numarası için sütun (`provider_ref`).
2. **Edge Function `paytr-token`:** PayTR mağaza bilgileriyle (gizli değer olarak saklanır, istemciye verilmez) ödeme formu token'ı üretir.
3. **Edge Function `paytr-bildirim`:** PayTR'nin sunucudan sunucuya bildirimini **hash doğrulaması** ile alır; başarılıysa ödemeyi `onaylandi` yapar ve paketi uzatır (`admin_odeme_karar` ile aynı mantık). Kart ödemesi yönetici onayı beklemez.
4. **Arayüz:** `methods.ts`'de `available: true`, `PaymentPage`'de PayTR iFrame paneli.
5. **GitHub secrets:** `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` (iş akışı fonksiyon gizli değerlerine aktarır).

Kart bilgisi hiçbir zaman Anket360 sunucularından geçmez; PayTR iFrame'inde girilir.
