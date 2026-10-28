import { LocalStore } from "./local-store";
import type { DataStore } from "./store";

export { DataError } from "./store";
export type { DataStore } from "./store";

/**
 * Etkin veri katmanı. Supabase bağlantısı kullanıcı onayı alınana kadar
 * bilinçli olarak devre dışıdır; VITE_DATA_BACKEND=supabase verilse bile
 * yerel depoya düşülür ve konsola uyarı yazılır.
 */
function createStore(): DataStore {
  if (import.meta.env.VITE_DATA_BACKEND === "supabase") {
    console.warn("[Anket360] Supabase bağlantısı henüz etkin değil; yerel veri deposu kullanılıyor.");
  }
  return new LocalStore();
}

export const db: DataStore = createStore();
