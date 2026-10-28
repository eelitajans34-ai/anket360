import { LocalStore } from "./local-store";
import { SupabaseStore } from "./supabase-store";
import type { DataStore } from "./store";

export { DataError } from "./store";
export type { DataStore } from "./store";

export type Backend = "local" | "supabase";

/**
 * Etkin veri katmanı. VITE_DATA_BACKEND=supabase ve Supabase bilgileri
 * tanımlıysa SupabaseStore, aksi halde tarayıcıda çalışan LocalStore kullanılır.
 */
function createStore(): { store: DataStore; backend: Backend } {
  const env = import.meta.env;
  if (env.VITE_DATA_BACKEND === "supabase") {
    if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
      return { store: new SupabaseStore(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY), backend: "supabase" };
    }
    console.error("[Anket360] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eksik; yerel veri deposu kullanılıyor.");
  }
  return { store: new LocalStore(), backend: "local" };
}

const created = createStore();
export const db: DataStore = created.store;
export const backend: Backend = created.backend;
