import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Download, PauseCircle, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeader } from "./PanelLayout";
import { Alert, TextField } from "@/components/ui/Field";
import { PasswordField, PasswordStrength } from "@/components/ui/PasswordField";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { download } from "@/lib/export";
import { formatDate, passwordIssues } from "@/lib/utils";

type Msg = { kind: "error" | "success"; text: string } | null;

export default function ProfilePage() {
  const { user, organizations, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: user?.fullName ?? "", phone: user?.phone ?? "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [dialog, setDialog] = useState<"dondur" | "sil" | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [accMsg, setAccMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const owned = organizations.filter((o) => o.role === "sahip");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await db.updateProfile(user!.id, form);
      await refresh();
      setMsg({ kind: "success", text: "Bilgileriniz güncellendi." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Kaydedilemedi." });
    }
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    const issues = passwordIssues(pw.next);
    if (issues.length) return setPwMsg({ kind: "error", text: issues.join(", ") });
    if (pw.next !== pw.confirm) return setPwMsg({ kind: "error", text: "Şifreler eşleşmiyor." });
    try {
      await db.updatePassword(pw.next);
      setPw({ next: "", confirm: "" });
      setPwMsg({ kind: "success", text: "Şifreniz güncellendi." });
    } catch (err) {
      setPwMsg({ kind: "error", text: err instanceof Error ? err.message : "Şifre güncellenemedi." });
    }
  }

  async function exportData() {
    const kurumlar = await Promise.all(
      organizations.map(async (o) => ({ ...o, anketler: (await db.listSurveys(o.id)).map((s) => ({ baslik: s.title, durum: s.status, olusturma: s.createdAt })) })),
    );
    const veri = {
      aciklama: "Anket360 — KVKK kapsamında kişisel verilerinizin dökümü",
      olusturma: new Date().toISOString(),
      hesap: { adSoyad: user!.fullName, eposta: user!.email, telefon: user!.phone ?? null, kayit: user!.createdAt, kvkkOnay: user!.kvkkConsentAt ?? null, durum: user!.status },
      kurumlar,
    };
    download(JSON.stringify(veri, null, 2), `anket360-verilerim-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  }

  async function confirmAction() {
    setBusy(true);
    setAccMsg(null);
    try {
      if (dialog === "dondur") {
        await db.freezeMyAccount();
        await refresh();
      } else {
        await db.deleteMyAccount();
        await signOut();
        navigate("/", { replace: true });
      }
    } catch (err) {
      setAccMsg({ kind: "error", text: err instanceof Error ? err.message : "İşlem tamamlanamadı." });
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Hesabım" description="Bilgilerinizi düzenleyin, hesabınızı yönetin." />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="card space-y-5 p-6" noValidate>
          <h2 className="font-semibold">Kişisel bilgiler</h2>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <TextField label="Ad Soyad" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <TextField label="Telefon" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="05xx xxx xx xx" />
          <TextField label="E-posta" value={user.email} disabled hint="E-posta adresi giriş için kullanılır ve değiştirilemez." />
          <p className="text-xs text-slate-500">Üyelik tarihi: {formatDate(user.createdAt)}</p>
          <div className="flex justify-end"><button className="btn-primary">Kaydet</button></div>
        </form>

        <form onSubmit={onPassword} className="card space-y-5 p-6" noValidate>
          <h2 className="font-semibold">Şifre değiştir</h2>
          {pwMsg && <Alert kind={pwMsg.kind}>{pwMsg.text}</Alert>}
          <div>
            <PasswordField label="Yeni şifre" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
            {pw.next && <PasswordStrength password={pw.next} />}
          </div>
          <PasswordField label="Yeni şifre (tekrar)" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          <div className="flex justify-end"><button className="btn-primary">Şifreyi güncelle</button></div>
        </form>

        <section className="card space-y-3 p-6">
          <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-emerald-600" />Kişisel verileriniz (KVKK)</h2>
          <p className="text-sm text-slate-600">
            Verileriniz şifreli bağlantıyla, yalnızca sizin ve kurumunuzun görebileceği şekilde saklanır. Başka kullanıcılar bilgilerinizi göremez.
          </p>
          <p className="text-sm text-slate-600">
            Aydınlatma metni onayı: <strong>{user.kvkkConsentAt ? new Date(user.kvkkConsentAt).toLocaleString("tr-TR") : "kayıtlı değil"}</strong>
          </p>
          <button type="button" className="btn-secondary" onClick={exportData}><Download className="h-4 w-4" />Verilerimi indir</button>
        </section>

        <section className="card space-y-4 border-red-200 p-6">
          <h2 className="font-semibold text-red-700">Hesap işlemleri</h2>
          {accMsg && <Alert kind={accMsg.kind}>{accMsg.text}</Alert>}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Hesabı dondur</p>
              <p className="text-xs text-slate-500">Geçici olarak kapatır. Verileriniz silinmez; tekrar giriş yapıp açabilirsiniz.</p>
            </div>
            <button type="button" className="btn-secondary shrink-0" onClick={() => setDialog("dondur")}><PauseCircle className="h-4 w-4" />Dondur</button>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4">
            <div>
              <p className="text-sm font-medium">Hesabı tamamen sil</p>
              <p className="text-xs text-slate-500">Hesabınız{owned.length > 0 && ", sahibi olduğunuz kurumlar ve bu kurumların tüm anket ve yanıtları"} kalıcı olarak silinir. Geri alınamaz.</p>
            </div>
            <button type="button" className="btn-danger shrink-0" onClick={() => setDialog("sil")}><Trash2 className="h-4 w-4" />Sil</button>
          </div>
        </section>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="hesap-baslik">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && setDialog(null)} />
          <div className="card relative w-full max-w-md space-y-4 p-6">
            <h2 id="hesap-baslik" className="text-lg font-semibold">{dialog === "dondur" ? "Hesabınız dondurulsun mu?" : "Hesabınız kalıcı olarak silinsin mi?"}</h2>
            {dialog === "dondur" ? (
              <p className="text-sm text-slate-600">Dondurulan hesapla kurum verilerinize erişilemez ve yeni anket oluşturulamaz. Tekrar giriş yaptığınızda hesabınızı açabilirsiniz.</p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Bu işlem geri alınamaz.{owned.length > 0 && <> Şu kurumlar da silinecek: <strong>{owned.map((o) => o.name).join(", ")}</strong>.</>}
                </p>
                <TextField label={`Onaylamak için e-posta adresinizi yazın (${user.email})`} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDialog(null)} disabled={busy}>Vazgeç</button>
              <button
                className={dialog === "dondur" ? "btn-primary" : "btn-danger"}
                onClick={confirmAction}
                disabled={busy || (dialog === "sil" && confirmEmail.trim().toLowerCase() !== user.email)}
              >
                {dialog === "dondur" ? "Evet, dondur" : "Hesabımı kalıcı olarak sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
