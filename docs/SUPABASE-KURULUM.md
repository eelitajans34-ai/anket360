# Supabase kurulumu (Aşama 2)

Kod tarafı hazır: `src/lib/data/supabase-store.ts` tüm veri işlemlerini Supabase üzerinden yapar.
Aşağıdaki adımlar Supabase panelinde **bir kez** yapılır.

## 1. Proje
1. https://supabase.com/dashboard → **New project** (bölge: Frankfurt `eu-central-1`, Türkiye'ye en yakın).
2. **Project Settings → API** sayfasından `Project URL` ve `anon public` anahtarını alın.
   `service_role` anahtarını **hiçbir yere** yazmayın; uygulama ona ihtiyaç duymaz.

## 2. Veritabanı şeması
**SQL Editor → New query** → `supabase/schema.sql` dosyasının tamamını yapıştırın → **Run**.
Tablolar, tetikleyiciler, `create_organization` / `accept_invitation` fonksiyonları ve RLS kuralları oluşur.

## 3. Kimlik doğrulama ayarları
**Authentication → URL Configuration**
- *Site URL*: uygulamanın adresi (ör. `https://anket360.com.tr`, geliştirmede `http://localhost:5173`)
- *Redirect URLs*: `<site>/panel` ve `<site>/sifre-yenile` (geliştirme için localhost karşılıkları da)

**Authentication → Providers → Email**
- *Confirm email* açık kalabilir (önerilir): kayıttan sonra kullanıcıya doğrulama e-postası gider.

**Authentication → Email Templates** (isteğe bağlı): "Confirm signup" ve "Reset password" şablonlarını Türkçeleştirin.
Supabase'in yerleşik e-posta servisi saatte birkaç e-postayla sınırlıdır; canlıya çıkmadan önce
**Project Settings → Auth → SMTP** altından kendi SMTP sunucunuzu tanımlayın.

## 4. Uygulamayı bağlama
Proje kökünde `.env` dosyası (git'e eklenmez):
```
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://PROJE-KODU.supabase.co
VITE_SUPABASE_ANON_KEY=...
```
`npm run dev` ile başlatın. Bu değişkenler yoksa uygulama "Demo modu"nda (tarayıcı içi veri) çalışır.

## Yetki modeli (RLS)
| İşlem | Sahip | Yönetici | Üye | Diğer |
|---|---|---|---|---|
| Kurumu görme | ✓ | ✓ | ✓ | – |
| Kurum bilgilerini düzenleme | ✓ | ✓ | – | – |
| Davet oluşturma / iptal | ✓ | ✓ | – | – |
| Üye çıkarma (sahip hariç) | ✓ | ✓ | – | – |
| Anket oluşturma / düzenleme | ✓ | ✓ | ✓ | – |
| Anket silme | ✓ | ✓ | – | – |

Kurallar `npm run test:rls` ile **yerel, geçici** bir PostgreSQL üzerinde sınanır (bkz. `supabase/tests/rls-kontrol.mjs`).

## Ekip daveti
Yönetici, Kurum sayfasından e-posta + rol girer; oluşan davet bağlantısı (`/davet/<kod>`) panoya kopyalanır
ve kişiye iletilir. Kişi aynı e-posta adresiyle giriş yapıp/kayıt olup daveti kabul edince kuruma katılır.
Davet e-postasının otomatik gönderimi Aşama 3'te (Edge Function + SMTP) eklenecek.
