import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Copy, CreditCard, Landmark } from "lucide-react";
import { Alert } from "@/components/ui/Field";
import { FullPageSpinner } from "@/components/RouteGuards";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { PAYMENT_METHODS, type PaymentMethodId, type PaymentMethodInfo } from "@/lib/payments/methods";
import { copyText, formatTL, maskIban, maskName } from "@/lib/platform";
import type { Payment, PaymentSettings, Plan } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

/** Paket ödeme sayfası: /panel/odeme/:planId */
export default function PaymentPage() {
  const { planId = "" } = useParams();
  const { activeOrg } = useAuth();
  const org = activeOrg!;
  const data = useAsync(async () => {
    const [plans, bank, payments] = await Promise.all([db.listPlans(), db.getPaymentSettings(), db.listPayments(org.id)]);
    return { plan: plans.find((p) => p.id === planId && p.active), bank, pending: payments.find((p) => p.status === "beklemede") };
  }, [planId, org.id]);
  const [method, setMethod] = useState<PaymentMethodId>("havale");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (data.loading) return <FullPageSpinner />;
  const { plan, bank, pending } = data.data!;
  const canPay = org.role === "sahip" || org.role === "yonetici";

  async function notify() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await db.createPayment(org.id, plan.id, note, method));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bildirim gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  const back = <Link to="/panel/abonelik" className="btn-ghost -ml-2 mb-4 px-2"><ArrowLeft className="h-4 w-4" />Abonelik</Link>;

  if (!plan) {
    return <div className="max-w-xl">{back}<Alert>Paket bulunamadı ya da satışta değil.</Alert></div>;
  }
  if (plan.price === 0) {
    return <div className="max-w-xl">{back}<Alert kind="info">{plan.name} paketi ücretsizdir; ödeme gerekmez.</Alert></div>;
  }

  if (done) {
    return (
      <div className="max-w-xl">
        <div className="card p-8 text-center" role="status">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 text-xl font-bold">Ödeme bildiriminiz alındı</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bildirim kodu: <strong className="font-mono">{done.reference}</strong>. Ödemeniz kontrol edilip onaylandığında <strong>{plan.name}</strong> paketiniz {plan.periodDays} gün süreyle etkinleşir.
          </p>
          <Link to="/panel/abonelik" className="btn-primary mt-6">Abonelik sayfasına dön</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {back}
      <h1 className="text-2xl font-bold tracking-tight">Ödeme</h1>
      <p className="mt-1 text-sm text-slate-600">{org.name} için paket ödemesi</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {error && <Alert>{error}</Alert>}
          {pending && <Alert kind="info">Onay bekleyen bir ödeme bildiriminiz var (kod: {pending.reference}). Onaylanınca yeni bildirim yapabilirsiniz.</Alert>}
          {!canPay && <Alert>Ödeme bildirimini kurum sahibi ya da yöneticisi yapabilir.</Alert>}

          <section className="card p-5" aria-labelledby="yontem-baslik">
            <h2 id="yontem-baslik" className="mb-3 font-semibold">1. Ödeme yöntemi</h2>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ödeme yöntemi">
              {PAYMENT_METHODS.map((m) => (
                <MethodOption key={m.id} m={m} selected={method === m.id} onSelect={() => m.available && setMethod(m.id as PaymentMethodId)} />
              ))}
            </div>
          </section>

          <MethodPanel method={method} plan={plan} bank={bank} orgName={org.name} />

          <section className="card space-y-4 p-5" aria-labelledby="bildirim-baslik">
            <h2 id="bildirim-baslik" className="font-semibold">3. Ödeme bildirimi</h2>
            <label className="block">
              <span className="label">Not (isteğe bağlı)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. gönderen ad soyad, ödeme tarihi" />
            </label>
            <button className="btn-primary w-full sm:w-auto" onClick={notify} disabled={busy || !bank.iban || !!pending || !canPay}>
              {busy ? "Gönderiliyor…" : "Ödemeyi yaptım"}
            </button>
            <p className="text-xs text-slate-500">Bildiriminiz yönetici tarafından kontrol edilir; onaylanınca paketiniz otomatik etkinleşir.</p>
          </section>
        </div>

        <aside className="card h-fit p-5 lg:sticky lg:top-6" aria-label="Sipariş özeti">
          <p className="text-sm text-slate-500">Seçilen paket</p>
          <p className="mt-1 text-xl font-bold">{plan.name}</p>
          <p className="text-sm text-slate-500">{plan.description}</p>
          <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
            {plan.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{f}</li>)}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-600">Tutar ({plan.periodDays} gün)</span>
            <span className="text-2xl font-extrabold">{formatTL(plan.price)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MethodOption({ m, selected, onSelect }: { m: PaymentMethodInfo; selected: boolean; onSelect(): void }) {
  const Icon = m.kind === "kart" ? CreditCard : Landmark;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={!m.available}
      disabled={!m.available}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition",
        selected ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300",
        !m.available && "cursor-not-allowed opacity-60",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected ? "text-brand-600" : "text-slate-400")} />
      <span>
        <span className="flex items-center gap-2 font-medium">
          {m.label}
          {!m.available && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Yakında</span>}
        </span>
        <span className="block text-xs text-slate-500">{m.description}</span>
      </span>
    </button>
  );
}

/** Seçilen yöntemin ödeme talimatı. Kart yöntemleri eklendiğinde burada kendi paneliyle gösterilir. */
function MethodPanel({ method, plan, bank, orgName }: { method: PaymentMethodId; plan: Plan; bank: PaymentSettings; orgName: string }) {
  const info = PAYMENT_METHODS.find((m) => m.id === method)!;
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const aciklama = `${orgName} - ${plan.name}`;
  async function copy(text: string, key: string) {
    const ok = await copyText(text);
    setCopyFailed(!ok);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }
  const Row = ({ label, value, copyValue, k, mono }: { label: string; value: string; copyValue?: string; k: string; mono?: boolean }) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={cn("flex items-center gap-2 text-right text-sm font-semibold", mono && "font-mono")}>
        {value}
        {copyValue !== undefined && (
          <button
            type="button"
            className={cn("inline-flex items-center gap-1 rounded px-1.5 py-1 font-sans text-xs font-medium", copied === k ? "text-emerald-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}
            aria-label={`${label} kopyala`}
            onClick={() => copy(copyValue, k)}
          >
            {copied === k ? <><Check className="h-4 w-4" />Kopyalandı</> : <><Copy className="h-4 w-4" />Kopyala</>}
          </button>
        )}
      </dd>
    </div>
  );

  return (
    <section className="card p-5" aria-labelledby="talimat-baslik">
      <h2 id="talimat-baslik" className="font-semibold">2. {info.label} ile ödeme</h2>
      {!bank.iban ? (
        <div className="mt-3"><Alert>Ödeme bilgileri henüz tanımlanmamış. Lütfen destek ile iletişime geçin.</Alert></div>
      ) : (
        <>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Banka uygulamanızdan <strong>{info.label}</strong> ile aşağıdaki hesaba <strong>{formatTL(plan.price)}</strong> gönderin.</li>
            <li>Açıklama alanına aşağıdaki açıklamayı yazın.</li>
            <li>Gönderimden sonra "Ödemeyi yaptım" düğmesine basın.</li>
          </ol>
          {info.hint && <p className="mt-2 text-xs text-slate-500">{info.hint}</p>}
          <dl className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 px-4">
            <Row label="Banka" value={bank.bankName} k="banka" />
            {/* IBAN ve alıcı ekranda maskeli; kopyala düğmesi tam bilgiyi kopyalar */}
            <Row label="Alıcı" value={maskName(bank.accountHolder)} copyValue={bank.accountHolder} k="alici" />
            <Row label="IBAN" value={maskIban(bank.iban)} copyValue={bank.iban} k="iban" mono />
            <Row label="Tutar" value={formatTL(plan.price)} copyValue={String(plan.price)} k="tutar" />
            <Row label="Açıklama" value={aciklama} copyValue={aciklama} k="aciklama" />
          </dl>
          <p className="mt-3 text-xs text-slate-500">Güvenliğiniz için IBAN ve alıcı adı kısmen gizlenmiştir. <strong>Kopyala</strong> düğmesi tam bilgiyi kopyalar; banka uygulamanıza yapıştırdığınızda eksiksiz görünür.</p>
          {copyFailed && <div className="mt-3"><Alert>Tarayıcınız kopyalamaya izin vermedi. Tarayıcı ayarlarından pano iznini açın ya da farklı bir tarayıcı deneyin.</Alert></div>}
          {bank.note && <p className="mt-2 text-xs text-slate-500">{bank.note}</p>}
        </>
      )}
    </section>
  );
}
