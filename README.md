# Anket360

Kurumlar için Türkçe anket ve geri bildirim platformu.

## Teknolojiler
React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · React Router 6 · Vitest + Testing Library

## Çalıştırma
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testler
npm run test:rls   # RLS kuralları (yerel geçici PostgreSQL gerekir)
npm run build      # tip denetimi + üretim derlemesi
```

## Sayfalar
| Adres | Açıklama |
|---|---|
| `/` | Türkçe tanıtım ana sayfası |
| `/giris`, `/kayit`, `/sifremi-unuttum` | Kullanıcı giriş ekranları |
| `/kurum/olustur` | Kurum oluşturma |
| `/panel` | Yönetim paneli — genel bakış |
| `/panel/anketler` | Anket listesi (arama, filtre, kopyalama, silme) |
| `/panel/anketler/yeni` · `/panel/anketler/:id/duzenle` | Anket oluşturucu (şablonlar, 9 soru tipi, önizleme, ayarlar) |
| `/panel/kurum` | Kurum bilgileri, ekip, davetler |
| `/panel/profil` | Profil ve şifre değiştirme |
| `/sifre-yenile` | Şifre sıfırlama e-postasındaki bağlantının açtığı sayfa |
| `/davet/:kod` | Ekip davetini kabul etme |

## Veri katmanı
- `.env` içinde Supabase bilgileri varsa veriler **Supabase**'te tutulur — kurulum: [docs/SUPABASE-KURULUM.md](docs/SUPABASE-KURULUM.md).
- Yoksa uygulama **Demo modu**nda çalışır; veriler yalnızca tarayıcıda (localStorage) saklanır.
Ekran görüntüleri: `docs/ekran-goruntuleri/`.
