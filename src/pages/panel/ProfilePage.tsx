import { useState, type FormEvent } from "react";
import { PageHeader } from "./PanelLayout";
import { Alert, TextField } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/data";
import { formatDate } from "@/lib/utils";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

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

  return (
    <>
      <PageHeader title="Profilim" description="Hesap bilgilerinizi görüntüleyin ve düzenleyin." />
      <form onSubmit={onSubmit} className="card max-w-xl space-y-5 p-6" noValidate>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <TextField label="Ad Soyad" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField label="E-posta" value={user?.email ?? ""} disabled hint="E-posta adresi değiştirme Aşama 2'de eklenecek." />
        <p className="text-xs text-slate-500">Üyelik tarihi: {user && formatDate(user.createdAt)}</p>
        <div className="flex justify-end"><button className="btn-primary">Kaydet</button></div>
      </form>
    </>
  );
}
