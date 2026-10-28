/**
 * Ödeme yöntemleri kayıt defteri.
 *
 * Şimdilik yalnızca banka transferleri (havale / EFT / FAST) kullanılabilir.
 * Yeni bir yöntem (ör. PayTR ile kredi kartı) eklemek için:
 *  1. Buraya `available: true` bir kayıt ekleyin (kind: "kart").
 *  2. Ödeme sayfasında o tür için bir panel yazın (PaymentPage → MethodPanel).
 *  3. Sağlayıcının ödeme onayını sunucuda doğrulayan bir Edge Function ekleyin
 *     (PayTR bildirim URL'si) ve payments.method kısıtına yeni değeri ekleyin.
 */

export type PaymentMethodId = "havale" | "eft" | "fast";

export interface PaymentMethodInfo {
  id: PaymentMethodId | "kredi_karti";
  label: string;
  /** banka: IBAN'a transfer · kart: sağlayıcı üzerinden anında ödeme */
  kind: "banka" | "kart";
  available: boolean;
  description: string;
  hint?: string;
}

export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  {
    id: "havale",
    label: "Havale",
    kind: "banka",
    available: true,
    description: "Aynı bankadaki hesabınızdan gönderim.",
    hint: "Genellikle anında hesaba geçer.",
  },
  {
    id: "eft",
    label: "EFT",
    kind: "banka",
    available: true,
    description: "Farklı bir bankadan gönderim.",
    hint: "İş günlerinde mesai saatleri içinde hesaba geçer.",
  },
  {
    id: "fast",
    label: "FAST",
    kind: "banka",
    available: true,
    description: "Farklı bankadan 7/24 anında gönderim.",
    hint: "Banka uygulamanızdaki FAST tutar sınırına dikkat edin.",
  },
  {
    id: "kredi_karti",
    label: "Kredi / Banka kartı",
    kind: "kart",
    available: false,
    description: "PayTR ile güvenli kartla ödeme.",
    hint: "Yakında",
  },
];

export const methodLabel = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id;
export const isBankMethod = (id: string): id is PaymentMethodId => PAYMENT_METHODS.some((m) => m.id === id && m.kind === "banka" && m.available);
