import { useState, type FormEvent } from "react";
import { Check, Copy, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { db } from "@/lib/data";
import type { Invitation } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { initials, isValidEmail } from "@/lib/utils";

export function inviteLink(token: string) {
  return `${window.location.origin}/davet/${token}`;
}

export function TeamSection() {
  const { user, activeOrg } = useAuth();
  const orgId = activeOrg?.id;
  const isAdmin = activeOrg?.role === "sahip" || activeOrg?.role === "yonetici";
  const members = useAsync(() => (orgId ? db.listMembers(orgId) : Promise.resolve([])), [orgId]);
  const invites = useAsync(() => (orgId && isAdmin ? db.listInvitations(orgId) : Promise.resolve([])), [orgId, isAdmin]);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Invitation["role"]>("uye");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !user) return;
    setMsg(null);
    if (!isValidEmail(email)) return setMsg({ kind: "error", text: "Geçerli bir e-posta adresi girin." });
    setBusy(true);
    try {
      const inv = await db.createInvitation(orgId, user.id, email, role);
      setEmail("");
      await invites.reload();
      await copy(inv.token);
      setMsg({ kind: "success", text: `Davet oluşturuldu ve bağlantı panoya kopyalandı. Bağlantıyı ${inv.email} adresine iletin.` });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Davet oluşturulamadı." });
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Pano erişimi yoksa bağlantı listede görünmeye devam eder.
    }
  }

  async function run(fn: () => Promise<void>) {
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "İşlem tamamlanamadı." });
    }
  }

  const memberList = members.data ?? [];
  const pending = invites.data ?? [];

  return (
    <section className="card p-6 lg:col-span-2">
      <h2 className="font-semibold">Ekip ({memberList.length})</h2>
      {msg && <div className="mt-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      {isAdmin && (
        <form onSubmit={invite} className="mt-4 space-y-2" noValidate>
          <label htmlFor="davet-eposta" className="label">Ekip arkadaşı davet et</label>
          <input id="davet-eposta" type="email" className="input" placeholder="ornek@kurum.com.tr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Invitation["role"])} aria-label="Rol">
              <option value="uye">Üye</option>
              <option value="yonetici">Yönetici</option>
            </select>
            <button className="btn-primary shrink-0" disabled={busy}><UserPlus className="h-4 w-4" />Davet et</button>
          </div>
          <p className="text-xs text-slate-500">
            {role === "uye" ? "Üyeler anket oluşturur ve düzenler." : "Yöneticiler ayrıca ekibi, kurum bilgilerini yönetir ve anket silebilir."}
          </p>
        </form>
      )}

      <ul className="mt-4 divide-y divide-slate-100">
        {memberList.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold">{initials(m.user.fullName || m.user.email)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.user.fullName || m.user.email}{m.userId === user?.id && <span className="text-slate-400"> (siz)</span>}</p>
              <p className="truncate text-xs text-slate-500">{m.user.email}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{ROLE_LABEL[m.role]}</span>
            {isAdmin && m.role !== "sahip" && m.userId !== user?.id && (
              <button
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`${m.user.fullName || m.user.email} kişisini kurumdan çıkar`}
                title="Kurumdan çıkar"
                onClick={() => run(async () => { await db.removeMember(m.orgId, m.userId); await members.reload(); })}
              >
                <UserMinus className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && pending.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700">Bekleyen davetler ({pending.length})</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inv.email}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABEL[inv.role]}</p>
                </div>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => copy(inv.token)} aria-label={`${inv.email} davet bağlantısını kopyala`}>
                  {copied === inv.token ? <><Check className="h-4 w-4 text-emerald-600" />Kopyalandı</> : <><Copy className="h-4 w-4" />Bağlantı</>}
                </button>
                <button
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`${inv.email} davetini iptal et`}
                  onClick={() => run(async () => { await db.revokeInvitation(inv.id); await invites.reload(); })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Davet edilen kişi bağlantıyı açıp aynı e-posta adresiyle giriş yaptığında kuruma katılır.</p>
        </div>
      )}
    </section>
  );
}
