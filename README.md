# Anket360

Kurumlar için Türkçe anket ve geri bildirim platformu.

## Teknolojiler
React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · React Router 6 · Vitest + Testing Library

## Çalıştırma
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testler
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
| `/panel/kurum`, `/panel/profil` | Kurum ve profil ayarları |

## Veri katmanı
Şu an veriler **yalnızca tarayıcıda** (localStorage) tutulur. Supabase geçişi için bkz. [docs/SUPABASE-PLANI.md](docs/SUPABASE-PLANI.md).
Ekran görüntüleri: `docs/ekran-goruntuleri/`.
