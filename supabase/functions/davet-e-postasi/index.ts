// Ekip daveti e-postası — Supabase Edge Function (Deno)
// Gerekli gizli değerler (GitHub Actions tanımlar): RESEND_API_KEY, MAIL_FROM, SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { inviteEmail } from "../_shared/davet-eposta.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { code: "yontem", message: "Yalnızca POST." });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  const site = Deno.env.get("SITE_URL")?.replace(/\/+$/, "");
  if (!apiKey || !from || !site) return json(503, { code: "eposta_kapali", message: "E-posta gönderimi yapılandırılmamış." });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { code: "oturum", message: "Oturum gerekli." });

  let invitationId: unknown;
  try {
    ({ invitationId } = await req.json());
  } catch {
    return json(400, { code: "istek", message: "Geçersiz istek." });
  }
  if (typeof invitationId !== "string" || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return json(400, { code: "istek", message: "Geçersiz davet kimliği." });
  }

  // Kullanıcının kendi oturumuyla: RLS gereği daveti yalnızca kurum yöneticisi görebilir
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: inv, error } = await sb
    .from("invitations")
    .select("id, email, role, token, accepted_at, organizations(name), davet_eden:profiles!invitations_invited_by_fkey(full_name, email)")
    .eq("id", invitationId)
    .maybeSingle();
  if (error) return json(500, { code: "veritabani", message: error.message });
  if (!inv || inv.accepted_at) return json(404, { code: "bulunamadi", message: "Davet bulunamadı." });

  const { data: allowed, error: limitError } = await sb.rpc("mark_invitation_emailed", { p_id: invitationId });
  if (limitError) return json(400, { code: "veritabani", message: limitError.message });
  if (!allowed) return json(429, { code: "cok_sik", message: "Bu davet az önce gönderildi. Bir dakika sonra tekrar deneyin." });

  // deno-lint-ignore no-explicit-any
  const org = (inv as any).organizations?.name ?? "Anket360";
  // deno-lint-ignore no-explicit-any
  const inviter = (inv as any).davet_eden;
  const mail = inviteEmail({
    orgName: org,
    inviterName: inviter?.full_name || inviter?.email || "",
    role: inv.role === "yonetici" ? "yonetici" : "uye",
    link: `${site}/davet/${inv.token}`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [inv.email], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend hatası", res.status, detail);
    return json(502, { code: "saglayici", message: "E-posta sağlayıcısı isteği reddetti." });
  }
  return json(200, { sent: true });
});
