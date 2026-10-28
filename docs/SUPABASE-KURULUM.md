# Supabase ve yayın kurulumu (otomatik)

Kurulum GitHub Actions ile otomatik yapılır: `.github/workflows/yayin.yml`.
`main` dalına her gönderimde sırasıyla:

| Adım | Ne yapar |
|---|---|
| **Testler** | Tip denetimi, birim/arayüz testleri ve geçici PostgreSQL üzerinde RLS testleri |
| **Supabase kurulumu** | `supabase/migrations/` içindeki yeni migration'ları uygular (`supabase db push`); site adresi, yönlendirme adresleri ve Türkçe e-posta şablonlarını ayarlar |
| **GitHub Pages yayını** | anon anahtarını Supabase'den otomatik alır, tabloların erişilebilirliğini sınar, uygulamayı derleyip yayınlar |

Supabase secret'ları tanımlı değilse Supabase adımı atlanır ve site **Demo modu**nda yayınlanır.

## Bir kerelik ayarlar (yalnızca siz yapabilirsiniz)

### 1. GitHub Pages'i açın
Depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Site adresi: `https://<kullanıcı>.github.io/anket360/`

### 2. Supabase projesi
https://supabase.com/dashboard → **New project** (bölge önerisi: Frankfurt). Veritabanı şifresini not edin.

### 3. Secret'ları ekleyin
Depo → **Settings → Secrets and variables → Actions → New repository secret**:

| Ad | Nereden |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → *Generate new token* |
| `SUPABASE_PROJECT_REF` | Proje adresi `https://<REF>.supabase.co` içindeki `<REF>` (Project Settings → General → Project ID) |
| `SUPABASE_DB_PASSWORD` | Proje oluştururken belirlediğiniz veritabanı şifresi |

### 4. Çalıştırın
**Actions → Test ve Yayın → Run workflow** (ya da `main`'e yeni bir gönderim).

## Notlar
- Özel alan adı kullanılırsa **Settings → Secrets and variables → Actions → Variables** altına `SITE_URL` ekleyin (ör. `https://anket360.com.tr`).
- Supabase'in yerleşik e-posta servisi saatte birkaç e-postayla sınırlıdır; canlı kullanım öncesi
  **Project Settings → Auth → SMTP** ile kendi SMTP sunucunuzu tanımlayın.
- Şema değişiklikleri yeni bir dosya olarak eklenir: `supabase/migrations/<YYYYMMDDHHMMSS>_aciklama.sql`.
  Uygulanmış migration dosyaları değiştirilmez.
- `service_role` anahtarı hiçbir yerde kullanılmaz.

## Yerel geliştirme
`.env` (git'e eklenmez):
```
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<Project Settings → API → anon public>
```
Değişkenler yoksa uygulama Demo modunda (tarayıcı içi veri) çalışır.

## Yetki modeli (RLS)
| İşlem | Sahip | Yönetici | Üye | Diğer |
|---|---|---|---|---|
| Kurumu görme | ✓ | ✓ | ✓ | – |
| Kurum bilgilerini düzenleme | ✓ | ✓ | – | – |
| Davet oluşturma / iptal | ✓ | ✓ | – | – |
| Üye çıkarma (sahip hariç) | ✓ | ✓ | – | – |
| Anket oluşturma / düzenleme | ✓ | ✓ | ✓ | – |
| Anket silme | ✓ | ✓ | – | – |
| Yanıtları görme | ✓ | ✓ | ✓ | – |
| Yayındaki ankete yanıt verme (`submit_response`) | ✓ | ✓ | ✓ | ✓ (giriş gerekmez) |

Katılımcılar `surveys` ve `responses` tablolarına doğrudan erişemez; yalnızca `get_public_survey` ve
`submit_response` fonksiyonlarını çağırabilir. Yanıtlar sunucuda doğrulanır (yayında mı, süresi dolmuş mu,
zorunlu sorular, bilinmeyen soru anahtarı, 64 KB sınırı, kimlikli anketlerde kişi başı tek yanıt).
Anonim anketlerde tek yanıt kuralı yalnızca tarayıcıda uygulanır.

## Ekip daveti
Yönetici, Kurum sayfasından e-posta + rol girer; davet bağlantısı (`/davet/<kod>`) panoya kopyalanır ve kişiye iletilir.
Kişi aynı e-postayla giriş yapıp/kayıt olup daveti kabul edince kuruma katılır.
