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
- `supabase/migrations/*.sql` — Supabase şeması + RLS; yeni değişiklik = yeni migration dosyası
- `.github/workflows/yayin.yml` — test → Supabase migration/ayar → GitHub Pages yayını (kurulum: `docs/SUPABASE-KURULUM.md`)
- `supabase/tests/rls-kontrol.mjs` — RLS kuralları için yerel PostgreSQL testi (`npm run test:rls`)

## Ürün yönü (kullanıcı isteği)
Sade, herkesin anlayacağı anket uygulaması. Yeni ankette önce alan seçilir (Belediye, Siyasi Parti, STK/Dernek, İşletme, Genel), sonra o alanın hazır anketi (`src/components/survey/categories.ts`). Kullanıcı açıkça istemeden yeni özellik/kapsam ekleme; önce sor.

## Aşamalar
- [x] **Aşama 1** — Proje kurulumu, Türkçe ana sayfa, giriş/kayıt/şifre sıfırlama, kurum oluşturma, yönetim paneli, anket oluşturucu, testler (21 test)
- [x] **Aşama 2** — Supabase veri katmanı, şema + RLS, e-posta doğrulama, şifre sıfırlama/değiştirme, ekip daveti ve üye çıkarma (50 birim/arayüz testi + 24 RLS kontrolü)
- [x] **Otomasyon** — GitHub Actions: testler, Supabase migration + kimlik doğrulama ayarları, GitHub Pages yayını
- [x] **Canlıya alma** — Supabase projesi `ankettt` (eu-west-1) bağlandı, migration uygulandı, site https://eelitajans34-ai.github.io/anket360/ adresinde
- [ ] **Canlı doğrulama** — kayıt → e-posta doğrulama → kurum → anket → davet akışının canlı sitede elle denenmesi
- [ ] **Özel SMTP** — Supabase ücretsiz planı saatte birkaç e-posta gönderir ve Türkçe şablonlara izin vermez; SMTP tanımlanınca iş akışı Türkçe şablonları otomatik uygular
- [x] **Aşama 3** — Herkese açık anket sayfası (`/a/:id`), sunucu tarafı doğrulamalı yanıt kaydı (`get_public_survey` / `submit_response` RPC), bağlantı + QR + WhatsApp/e-posta paylaşımı, Yanıtlar sekmesi (65 test + 47 RLS kontrolü)
- [x] **Koşullu sorular** — `showIf` (önceki soruya bağlı; eşittir/içerir/en az/en çok/yanıtlandı…); kurallar `src/lib/conditions.ts` ve SQL `gorunur_sorular` ile birebir aynı, ortak örnekler `supabase/tests/kosul-ornekleri.json`
- [x] **PDF rapor** — `src/lib/pdf-report.ts` (jsPDF + gömülü DejaVu Sans, vektör grafikler, sayfa numarası); jsPDF ve yazı tipleri yalnızca PDF indirilirken yüklenir
- [x] **E-posta altyapısı (kod)** — Resend: Supabase Auth SMTP + `davet-e-postasi` Edge Function (RLS ile yönetici kontrolü, 60 sn sınırı, bağlantı sunucuda üretilir); `RESEND_API_KEY` + `MAIL_FROM` secret'ları eklenince iş akışı otomatik kurar
- [ ] Resend hesabı + alan adı doğrulaması + iki secret (kullanıcı)
- [x] **Aşama 4** — Rapor sekmesi: tarih filtresi, özet (yanıt, günlük ortalama, son yanıt, NPS), günlük yanıt grafiği, soru bazında grafikler (seçenek dağılımı, puan ortalaması, NPS kırılımı, metin yanıtları); Excel (.xlsx) ve CSV dışa aktarma; 1000+ yanıt için sayfalı çekme (80 test)
