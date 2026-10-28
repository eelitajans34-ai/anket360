/**
 * Davet e-postası şablonu. Saf TypeScript (Deno ve Node/Vitest'te çalışır).
 * Kullanıcıdan gelen metinler (kurum adı, davet eden) HTML'e kaçışlanarak yazılır.
 */

export interface InviteEmailInput {
  orgName: string;
  inviterName: string;
  role: "yonetici" | "uye";
  link: string;
}

const ROLE: Record<InviteEmailInput["role"], string> = { yonetici: "Yönetici", uye: "Üye" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Konu satırına satır sonu sızmasın (e-posta başlık enjeksiyonu) */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 120);

export function inviteEmail(i: InviteEmailInput): { subject: string; html: string; text: string } {
  const org = oneLine(i.orgName);
  const inviter = oneLine(i.inviterName) || "Bir ekip arkadaşınız";
  const role = ROLE[i.role];
  const subject = `${org} sizi Anket360'a davet etti`;
  const text = [
    `Merhaba,`,
    ``,
    `${inviter}, sizi Anket360'ta "${org}" kurumuna ${role} olarak davet etti.`,
    ``,
    `Daveti kabul etmek için bu bağlantıyı açın:`,
    i.link,
    ``,
    `Bu e-postanın gönderildiği adresle giriş yapmanız ya da kayıt olmanız gerekir.`,
    `Bu daveti beklemiyorsanız e-postayı yok sayabilirsiniz.`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="tr"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 28px 8px"><strong style="font-size:18px">Anket<span style="color:#1d56f1">360</span></strong></td></tr>
<tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">Merhaba,</p>
<p style="margin:0 0 20px"><strong>${escapeHtml(inviter)}</strong>, sizi <strong>${escapeHtml(org)}</strong> kurumuna <strong>${role}</strong> olarak davet etti.</p>
</td></tr>
<tr><td style="padding:0 28px 24px"><a href="${escapeHtml(i.link)}" style="display:inline-block;background:#1d56f1;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Daveti kabul et</a></td></tr>
<tr><td style="padding:0 28px 28px;font-size:12px;line-height:1.6;color:#64748b">
Bu e-postanın gönderildiği adresle giriş yapmanız ya da kayıt olmanız gerekir.<br>
Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br><span style="word-break:break-all">${escapeHtml(i.link)}</span><br><br>
Bu daveti beklemiyorsanız e-postayı yok sayabilirsiniz.
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
