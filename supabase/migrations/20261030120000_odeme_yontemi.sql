-- =====================================================================
-- Ödeme yöntemi
-- Şimdilik banka transferleri: havale, EFT, FAST.
-- Kredi kartı (PayTR vb.) eklenirken bu listeye yeni değer eklenir ve
-- ödeme sağlayıcısının onayı sunucu tarafında (Edge Function) işlenir.
-- =====================================================================

alter table public.payments
  add column method text not null default 'havale'
  constraint payments_method_check check (method in ('havale', 'eft', 'fast'));

comment on column public.payments.method is
  'Ödeme yöntemi: havale | eft | fast. Yeni yöntem (ör. kredi_karti) eklenirken payments_method_check genişletilir.';
