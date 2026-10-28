import { Link } from "react-router-dom";
import { Check, CreditCard } from "lucide-react";
import { PageHeader } from "./PanelLayout";
import { Alert } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { ORG_STATUS_LABEL, ORG_STATUS_STYLE, formatTL, orgRestriction } from "@/lib/platform";
import { methodLabel } from "@/lib/payments/methods";
import type { Payment } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, formatDate } from "@/lib/utils";

const PAY_STATUS: Record<Payment["status"], { label: string; style: string }> = {
  beklemede: { label: "Onay bekliyor", style: "bg-amber-50 text-amber-700" },
  onaylandi: { label: "Onaylandı", style: "bg-emerald-50 text-emerald-700" },
  reddedildi: { label: "Reddedildi", style: "bg-red-50 text-red-700" },
};

/** Paket bilgisi, IBAN ile ödeme ve ödeme bildirimleri */
export default function SubscriptionPage() {
  const { activeOrg } = useAuth();
  const org = activeOrg!;
  const canPay = org.role === "sahip" || org.role === "yonetici";
  const plans = useAsync(() => db.listPlans(), []);
  const payments = useAsync(() => db.listPayments(org.id), [org.id]);

  const current = plans.data?.find((p) => p.id === org.planId);
  const restriction = orgRestriction(org);
  const pending = payments.data?.find((p) => p.status === "beklemede");

  return (
    <>
      <PageHeader title="Abonelik" description="Paketinizi görüntüleyin, havale/EFT ile ödeme yapın." />

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
              <Link to={`/panel/odeme/${p.id}`} className={cn("btn-primary mt-4", pending && "pointer-events-none opacity-60")} aria-disabled={!!pending}>
                <CreditCard className="h-4 w-4" />{p.id === org.planId ? "Süreyi uzat" : "Bu pakete geç"}
              </Link>
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
              <tr><th className="px-4 py-2.5">Tarih</th><th className="px-4 py-2.5">Paket</th><th className="px-4 py-2.5">Yöntem</th><th className="px-4 py-2.5">Tutar</th><th className="px-4 py-2.5">Kod</th><th className="px-4 py-2.5">Durum</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-2.5">{plans.data?.find((x) => x.id === p.planId)?.name ?? p.planId}</td>
                  <td className="px-4 py-2.5">{methodLabel(p.method)}</td>
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

    </>
  );
}
