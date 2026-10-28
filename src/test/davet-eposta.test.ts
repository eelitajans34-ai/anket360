import { describe, expect, it } from "vitest";
import { escapeHtml, inviteEmail } from "../../supabase/functions/_shared/davet-eposta";

describe("davet e-postası şablonu", () => {
  it("Türkçe içerik, rol ve bağlantıyı içerir", () => {
    const m = inviteEmail({ orgName: "Güneş Okulları", inviterName: "Ayşe Yılmaz", role: "yonetici", link: "https://x.github.io/anket360/davet/abc123" });
    expect(m.subject).toBe("Güneş Okulları sizi Anket360'a davet etti");
    expect(m.html).toContain('<a href="https://x.github.io/anket360/davet/abc123"');
    expect(m.html).toContain("<strong>Yönetici</strong>");
    expect(m.text).toContain("Ayşe Yılmaz, sizi Anket360'ta \"Güneş Okulları\" kurumuna Yönetici olarak davet etti.");
    expect(m.text).toContain("https://x.github.io/anket360/davet/abc123");
  });

  it("kullanıcı metnini HTML'e kaçışlar ve konuya satır sonu sokulmasını engeller", () => {
    const m = inviteEmail({ orgName: 'Kötü <script>alert(1)</script>\r\nBcc: x@y.com', inviterName: '"><img src=x>', role: "uye", link: "https://a/davet/t" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("davet edenin adı boşsa genel ifade kullanır", () => {
    expect(inviteEmail({ orgName: "K", inviterName: "  ", role: "uye", link: "l" }).text).toContain("Bir ekip arkadaşınız, sizi");
  });
});
