import { useState, type FormEvent } from "react";
import { PageHeader } from "./PanelLayout";
import { Alert, TextField } from "@/components/ui/Field";
import { PasswordField, PasswordStrength } from "@/components/ui/PasswordField";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { formatDate, passwordIssues } from "@/lib/utils";

type Msg = { kind: "error" | "success"; text: string } | null;

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    try {
      await db.updateProfile(user.id, { fullName });
      await refresh();
      setMsg({ kind: "success", text: "Profiliniz güncellendi." });
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

  return (
    <>
      <PageHeader title="Profilim" description="Hesap bilgilerinizi görüntüleyin ve düzenleyin." />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="card space-y-5 p-6" noValidate>
          <h2 className="font-semibold">Kişisel bilgiler</h2>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <TextField label="Ad Soyad" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <TextField label="E-posta" value={user?.email ?? ""} disabled hint="E-posta adresi değiştirilemez." />
          <p className="text-xs text-slate-500">Üyelik tarihi: {user && formatDate(user.createdAt)}</p>
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
      </div>
    </>
  );
}
