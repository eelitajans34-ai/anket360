# Anket360 — Claude için başlangıç notları

## Kurallar
- Arayüz metinleri **Türkçe**.
- Mevcut dosyalar silinmez.
- **Supabase'e bağlanmadan / şema uygulamadan önce proje sahibinden onay alınır.**
- Her değişiklikten sonra `npm run build` ve `npm test` çalıştırılır.

## Yapı
- `src/lib/types.ts` — alan modelleri
- `src/lib/data/` — `DataStore` arayüzü ve `LocalStore` (localStorage) uygulaması
- `src/lib/auth.tsx` — oturum + aktif kurum bağlamı
- `src/components/RouteGuards.tsx` — RequireAuth / RequireOrg / GuestOnly
- `src/pages/` — sayfalar; `src/pages/panel/` yönetim paneli
- `src/components/survey/` — soru düzenleyici, önizleme, şablonlar
- `supabase/schema.sql` — UYGULANMAMIŞ şema taslağı

## Aşamalar
- [x] **Aşama 1** — Proje kurulumu, Türkçe ana sayfa, giriş/kayıt/şifre sıfırlama, kurum oluşturma, yönetim paneli, anket oluşturucu, testler (21 test)
- [ ] **Aşama 2** — Supabase bağlantısı (ONAY BEKLİYOR), e-posta doğrulama, ekip daveti
- [ ] **Aşama 3** — Herkese açık anket yanıtlama sayfası (`/a/:id`), yanıt kaydı, QR/bağlantı paylaşımı
- [ ] **Aşama 4** — Raporlar, grafikler, Excel/CSV dışa aktarma
