import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Lock, SearchX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { FullPageSpinner } from "@/components/RouteGuards";
import { SurveyForm } from "@/components/survey/SurveyPreview";
import { Alert } from "@/components/ui/Field";
import { db } from "@/lib/data";
import type { Answers } from "@/lib/types";
import { useAsync } from "@/lib/use-async";

const answeredKey = (id: string) => `anket360:yanitlandi:${id}`;

function readAnswered(id: string): boolean {
  try {
    return localStorage.getItem(answeredKey(id)) !== null;
  } catch {
    return false;
  }
}

/** Katılımcıların anketi yanıtladığı herkese açık sayfa: /a/:id */
export default function PublicSurveyPage() {
  const { id = "" } = useParams();
  const { data: survey, loading, error } = useAsync(() => db.getPublicSurvey(id), [id]);
  const [alreadyAnswered] = useState(() => readAnswered(id));

  async function submit(answers: Answers) {
    await db.submitResponse(id, answers);
    try {
      localStorage.setItem(answeredKey(id), new Date().toISOString());
    } catch {
      // Tarayıcı depolaması kapalıysa yalnızca tekrar yanıt uyarısı gösterilemez.
    }
  }

  if (loading) return <FullPageSpinner />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex-1 px-4 py-8 sm:py-12">
        {error ? (
          <Message title="Anket yüklenemedi" text="Lütfen biraz sonra tekrar deneyin."><Alert>{error.message}</Alert></Message>
        ) : !survey ? (
          <Message icon={<SearchX className="h-10 w-10 text-slate-400" />} title="Anket bulunamadı" text="Bu bağlantı hatalı olabilir ya da anket henüz yayınlanmamış olabilir." />
        ) : survey.status === "kapali" ? (
          <Message icon={<Lock className="h-10 w-10 text-slate-400" />} title={survey.title} text="Bu anket artık yanıt kabul etmiyor. İlginiz için teşekkür ederiz." />
        ) : survey.settings.singleResponse && alreadyAnswered ? (
          <Message title="Bu anketi zaten yanıtladınız" text="Katılımınız için teşekkür ederiz. Bu anket kişi başı tek yanıt kabul ediyor." />
        ) : (
          <SurveyForm survey={survey} orgName={survey.orgName} onSubmit={submit} />
        )}
      </main>
      <footer className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
        <span>Bu anket</span>
        <Logo className="scale-75" />
        <span>ile oluşturuldu ·</span>
        <Link to="/" className="font-medium text-brand-600 hover:underline">Siz de ücretsiz anket oluşturun</Link>
      </footer>
    </div>
  );
}

function Message({ icon, title, text, children }: { icon?: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      {icon && <div className="mb-4 flex justify-center">{icon}</div>}
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      {children && <div className="mt-4 text-left">{children}</div>}
    </div>
  );
}
