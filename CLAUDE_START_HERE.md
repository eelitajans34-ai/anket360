# Anket360 — Claude için başlangıç notları

## Kurallar
- Arayüz metinleri **Türkçe**.
- Mevcut dosyalar silinmez.
- Supabase kullanımı proje sahibince onaylandı (Aşama 2). Canlı veritabanında şema değişikliği / veri silme öncesi yine onay alınır.
- `service_role` anahtarı istemci koduna asla girmez.
- Her değişiklikten sonra `npm run build` ve `npm test` çalıştırılır.

## Yapı
- `src/lib/types.ts` — alan modelleri
- `src/lib/data/` — `DataStore` arayüzü; `LocalStore` (localStorage, demo/test) ve `SupabaseStore`
- `src/lib/data/supabase-mappers.ts` — satır eşlemeleri ve Türkçe hata çevirileri
- `src/lib/auth.tsx` — oturum + aktif kurum bağlamı
- `src/components/RouteGuards.tsx` — RequireAuth / RequireOrg / GuestOnly
- `src/pages/` — sayfalar; `src/pages/panel/` yönetim paneli
- `src/components/survey/` — soru düzenleyici, önizleme, şablonlar
- `supabase/schema.sql` — Supabase şeması + RLS (kurulum: `docs/SUPABASE-KURULUM.md`)
- `supabase/tests/rls-kontrol.mjs` — RLS kuralları için yerel PostgreSQL testi (`npm run test:rls`)

## Aşamalar
- [x] **Aşama 1** — Proje kurulumu, Türkçe ana sayfa, giriş/kayıt/şifre sıfırlama, kurum oluşturma, yönetim paneli, anket oluşturucu, testler (21 test)
- [x] **Aşama 2** — Supabase veri katmanı, şema + RLS, e-posta doğrulama, şifre sıfırlama/değiştirme, ekip daveti ve üye çıkarma (50 birim/arayüz testi + 24 RLS kontrolü)
- [ ] **Aşama 2 doğrulama** — Gerçek Supabase projesinde uçtan uca deneme (proje bilgileri ve ağ erişimi bekleniyor)
- [ ] **Aşama 3** — Herkese açık anket yanıtlama sayfası (`/a/:id`), yanıt kaydı, QR/bağlantı paylaşımı, davet e-postası gönderimi
- [ ] **Aşama 4** — Raporlar, grafikler, Excel/CSV dışa aktarma
