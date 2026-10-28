import { useState } from "react";
import { Check, Copy, CreditCard } from "lucide-react";
import { PageHeader } from "./PanelLayout";
import { Alert } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { ORG_STATUS_LABEL, ORG_STATUS_STYLE, formatIban, formatTL, orgRestriction } from "@/lib/platform";
import type { Payment, Plan } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, formatDate } from "@/lib/utils";

const PAY_STATUS: Record<Payment["status"], { label: string; style: string }> = {
  beklemede: { label: "Onay bekliyor", style: "bg-amber-50 text-amber-700" },
  onaylandi: { label: "Onaylandı", style: "bg-emerald-50 text-emerald-700" },
  reddedildi: { label: "Reddedildi", style: "bg-red-50 text-red-700" },
};

/** Paket bilgisi, IBAN ile ödeme ve ödeme bildirimleri */
export default function SubscriptionPage() {
  const { activeOrg, refresh } = useAuth();
  const org = activeOrg!;
  const canPay = org.role === "sahip" || org.role === "yonetici";
  const plans = useAsync(() => db.listPlans(), []);
  const bank = useAsync(() => db.getPaymentSettings(), []);
  const payments = useAsync(() => db.listPayments(org.id), [org.id]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const current = plans.data?.find((p) => p.id === org.planId);
  const restriction = orgRestriction(org);
  const pending = payments.data?.find((p) => p.status === "beklemede");

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // pano erişimi yoksa kullanıcı elle kopyalar
    }
  }

  async function notify() {
    if (!selected) return;
    setMsg(null);
    try {
      const p = await db.createPayment(org.id, selected.id, note);
      setSelected(null);
      setNote("");
      await payments.reload();
      await refresh();
      setMsg({ kind: "success", text: `Ödeme bildiriminiz alındı (açıklama kodu: ${p.reference}). Ödeme onaylanınca paketiniz etkinleşir.` });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Bildirim gönderilemedi." });
    }
  }

  return (
    <>
      <PageHeader title="Abonelik" description="Paketinizi görüntüleyin, havale/EFT ile ödeme yapın." />
      {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      <section className="card mb-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between" aria-label="Mevcut paket">
        <div>
          <p className="text-sm text-slate-500">Mevcut paket</p>
          <p className="mt-1 text-2xl font-bold">{current?.name ?? org.planId}</p>
          <p className="mt-1 text-sm text-slate-600">
            {org.endsAt ? <>Bitiş tarihi: <strong>{formatDate(org.endsAt)}</strong></> : "Süresiz"}
            {current?.maxActiveSurveys ? ` · Aynı anda en fazla ${current.maxActiveSurveys} yayında anket` : " · Sınırsız anket"}
          </p>
        </div>
        <span className={cn("inline-flex self-start rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset sm:self-center", ORG_STATUS_STYLE[org.status])}>
          {restriction && org.status === "aktif" ? "Süresi doldu" : ORG_STATUS_LABEL[org.status]}
        </span>
      </section>
      {restriction && <div className="mb-6"><Alert>{restriction}</Alert></div>}

      <h2 className="mb-3 font-semibold">Paketler</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((p) => (
          <div key={p.id} className={cn("card flex flex-col p-5", p.id === org.planId && "border-brand-500 ring-2 ring-brand-500")}>
            <p className="font-semibold">{p.name}</p>
            <p className="mt-1 text-sm text-slate-500">{p.description}</p>
            <p className="mt-3 text-2xl font-bold">{p.price === 0 ? "Ücretsiz" : formatTL(p.price)}<span className="text-sm font-normal text-slate-500">{p.price ? ` / ${p.periodDays} gün` : ""}</span></p>
            <ul className="mt-3 flex-1 space-y-1.5 text-sm text-slate-600">
              {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{f}</li>)}
            </ul>
            {p.price > 0 && canPay && (
              <button className="btn-primary mt-4" onClick={() => { setSelected(p); setMsg(null); }} disabled={!!pending}>
                <CreditCard className="h-4 w-4" />{p.id === org.planId ? "Süreyi uzat" : "Bu pakete geç"}
              </button>
            )}
            {p.id === org.planId && <p className="mt-2 text-center text-xs font-medium text-brand-700">Mevcut paketiniz</p>}
          </div>
        ))}
      </div>
      {pending && <div className="mb-6"><Alert kind="info">Onay bekleyen bir ödeme bildiriminiz var (kod: {pending.reference}). Onaylanınca yeni bildirim yapabilirsiniz.</Alert></div>}
      {!canPay && <p className="mb-6 text-sm text-slate-500">Ödeme bildirimini kurum sahibi ya da yöneticisi yapabilir.</p>}

      <h2 className="mb-3 font-semibold">Ödeme geçmişi</h2>
      <div className="card overflow-x-auto">
        {payments.data?.length ? (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr><th className="px-4 py-2.5">Tarih</th><th className="px-4 py-2.5">Paket</th><th className="px-4 py-2.5">Tutar</th><th className="px-4 py-2.5">Kod</th><th className="px-4 py-2.5">Durum</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-2.5">{plans.data?.find((x) => x.id === p.planId)?.name ?? p.planId}</td>
                  <td className="px-4 py-2.5">{formatTL(p.amount)}</td>
                  <td className="px-4 py-2.5 font-mono">{p.reference}</td>
                  <td className="px-4 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PAY_STATUS[p.status].style)}>{PAY_STATUS[p.status].label}</span>{p.adminNote && <span className="ml-2 text-xs text-slate-500">{p.adminNote}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-center text-sm text-slate-500">Henüz ödeme bildirimi yok.</p>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="odeme-baslik">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSelected(null)} />
          <div className="card relative w-full max-w-md space-y-4 p-6">
            <h2 id="odeme-baslik" className="text-lg font-semibold">{selected.name} — {formatTL(selected.price)}</h2>
            {bank.data?.iban ? (
              <>
                <p className="text-sm text-slate-600">Tutarı aşağıdaki hesaba havale/EFT ile gönderin, sonra "Ödemeyi yaptım" düğmesine basın.</p>
                <dl className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Banka</dt><dd className="font-medium">{bank.data.bankName}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Alıcı</dt><dd className="font-medium">{bank.data.accountHolder}</dd></div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">IBAN</dt>
                    <dd className="flex items-center gap-2 font-mono font-medium">
                      {formatIban(bank.data.iban)}
                      <button className="rounded p-1 text-slate-400 hover:bg-white" aria-label="IBAN'ı kopyala" onClick={() => copy(bank.data!.iban, "iban")}>{copied === "iban" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Açıklama</dt><dd className="font-medium">{org.name} – {selected.name}</dd></div>
                </dl>
                {bank.data.note && <p className="text-xs text-slate-500">{bank.data.note}</p>}
                <label className="block">
                  <span className="label">Not (isteğe bağlı)</span>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. gönderen ad soyad, ödeme tarihi" />
                </label>
                <p className="text-xs text-slate-500">Bildiriminize bir açıklama kodu verilecek; onaylandığında paketiniz {selected.periodDays} gün uzar.</p>
              </>
            ) : (
              <Alert>Ödeme bilgileri henüz tanımlanmamış. Lütfen destek ile iletişime geçin.</Alert>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSelected(null)}>Vazgeç</button>
              <button className="btn-primary" onClick={notify} disabled={!bank.data?.iban}>Ödemeyi yaptım</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
