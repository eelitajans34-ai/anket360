import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Mail, MessageCircle, X } from "lucide-react";
import { appUrl } from "@/lib/utils";

export function surveyLink(id: string) {
  return appUrl(`/a/${id}`);
}

/** Yayındaki anketi bağlantı, QR kod, WhatsApp ve e-posta ile paylaşma penceresi. */
export function ShareDialog({ surveyId, title, onClose }: { surveyId: string; title: string; onClose(): void }) {
  const link = surveyLink(surveyId);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(link, { width: 512, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } }))
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => { alive = false; };
  }, [link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano erişimi yoksa kullanıcı bağlantıyı kutudan elle kopyalayabilir.
    }
  }

  const text = `"${title}" anketine katılır mısınız? ${link}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="paylas-baslik">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="card relative w-full max-w-md p-6">
        <button className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label="Kapat"><X className="h-5 w-5" /></button>
        <h2 id="paylas-baslik" className="text-lg font-semibold">Anketi paylaş</h2>
        <p className="mt-1 text-sm text-slate-600">Bu bağlantıyı alan herkes giriş yapmadan anketi yanıtlayabilir.</p>

        <label htmlFor="anket-baglantisi" className="label mt-5">Anket bağlantısı</label>
        <div className="flex gap-2">
          <input id="anket-baglantisi" className="input" value={link} readOnly onFocus={(e) => e.target.select()} />
          <button className="btn-primary shrink-0" onClick={copy}>
            {copied ? <><Check className="h-4 w-4" />Kopyalandı</> : <><Copy className="h-4 w-4" />Kopyala</>}
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center rounded-xl border border-slate-200 p-4">
          {qr ? <img src={qr} alt="Anket bağlantısının QR kodu" className="h-48 w-48" /> : <div className="h-48 w-48 animate-pulse rounded bg-slate-100" />}
          {qr && (
            <a href={qr} download={`anket-qr-${surveyId.slice(0, 8)}.png`} className="btn-ghost mt-2 text-brand-600">
              <Download className="h-4 w-4" />QR kodu indir (PNG)
            </a>
          )}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <a className="btn-secondary px-2" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="h-4 w-4" />WhatsApp
          </a>
          <a className="btn-secondary px-2" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`}>
            <Mail className="h-4 w-4" />E-posta
          </a>
          <a className="btn-secondary px-2" href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />Aç
          </a>
        </div>
      </div>
    </div>
  );
}
