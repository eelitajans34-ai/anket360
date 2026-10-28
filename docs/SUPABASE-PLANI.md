# Supabase geçiş planı (Aşama 2)

> **Durum: BAĞLANMADI.** Proje sahibi onay vermeden Supabase'e hiçbir bağlantı kurulmayacak, şema uygulanmayacak.

Uygulama tüm veri işlemlerini `src/lib/data/store.ts` içindeki `DataStore` arayüzü üzerinden yapar.
Şu an `LocalStore` (tarayıcı localStorage) kullanılıyor. Geçiş adımları:

1. Proje sahibinden onay ve Supabase proje URL'si + anon anahtarı alınır.
2. `supabase/schema.sql` gözden geçirilip Supabase SQL düzenleyicisinde uygulanır.
3. `@supabase/supabase-js` paketi eklenir, `src/lib/data/supabase-store.ts` yazılır (aynı `DataStore` arayüzü).
4. `src/lib/data/index.ts` içinde `VITE_DATA_BACKEND=supabase` ise yeni depo seçilir.
5. Kayıt sonrası e-posta doğrulaması, şifre sıfırlama e-postası ve ekip daveti Supabase Auth ile etkinleştirilir.
6. Aynı testler Supabase deposuna karşı da (ayrı test projesinde) çalıştırılır.
