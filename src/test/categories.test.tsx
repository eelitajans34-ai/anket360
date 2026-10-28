import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { CATEGORIES, suggestedCategory } from "@/components/survey/categories";
import { LocalStore, validateSurvey } from "@/lib/data/local-store";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

describe("Kategoriler ve hazır anketler", () => {
  it("her kategoride hazır anket var; hepsi geçerli ve yayınlanabilir", () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual(["Belediye", "Siyasi Parti", "STK / Dernek", "İşletme", "Genel"]);
    for (const c of CATEGORIES) {
      expect(c.surveys.length).toBeGreaterThanOrEqual(2);
      for (const t of c.surveys) {
        const s = t.build();
        expect(s.questions.length, `${c.name} / ${t.name}`).toBeGreaterThanOrEqual(4);
        expect(s.settings.category).toBe(c.id);
        expect(() => validateSurvey({ ...s, status: "yayinda" }), `${c.name} / ${t.name}`).not.toThrow();
        expect(new Set(s.questions.map((q) => q.id)).size).toBe(s.questions.length);
      }
    }
  });

  it("siyasi parti anketleri anonimdir (siyasi görüş özel nitelikli veridir)", () => {
    for (const t of CATEGORIES.find((c) => c.id === "siyasi")!.surveys) expect(t.build().settings.anonymous).toBe(true);
  });

  it("kurum sektörüne göre kategori önerir", () => {
    expect(suggestedCategory("Kamu / Belediye")).toBe("belediye");
    expect(suggestedCategory("Siyasi Parti")).toBe("siyasi");
    expect(suggestedCategory("Sivil Toplum / Dernek")).toBe("stk");
    expect(suggestedCategory("Perakende")).toBe("isletme");
    expect(suggestedCategory(undefined)).toBeUndefined();
  });

  it("önce alan, sonra hazır anket seçilir; kurumun alanı öne çıkar ve kategori kaydedilir", async () => {
    const store = new LocalStore();
    const u = await store.signUp({ fullName: "Ali Veli", email: "ali@parti.org", password: "sifre1234" });
    await store.createOrganization(u!.id, { name: "Örnek Parti İl Başkanlığı", sector: "Siyasi Parti", size: "11–50", city: "Ankara" });
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ["/panel/anketler/yeni"], future: routerFuture });
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await screen.findByRole("heading", { name: "Anketiniz kimin için?" });
    const kartlar = screen.getAllByRole("button").filter((b) => /hazır anket/.test(b.textContent ?? ""));
    expect(kartlar[0]).toHaveTextContent("Siyasi Parti");
    expect(within(kartlar[0]!).getByText("Kurumunuz için")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Belediye/ }));
    expect(screen.getByRole("heading", { name: "Hazır bir anket seçin" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alan seçimine dön" }));
    await user.click(screen.getByRole("button", { name: /Siyasi Parti/ }));
    await user.click(screen.getByRole("button", { name: /Gündem ve öncelikler/ }));

    expect(screen.getByLabelText("Anket başlığı")).toHaveValue("Gündem ve Öncelikler Anketi");
    await user.click(screen.getByRole("button", { name: "Taslak olarak kaydet" }));
    await screen.findByText("Tüm değişiklikler kaydedildi");
    const [s] = await store.listSurveys((await store.listMyOrganizations(u!.id))[0]!.id);
    expect(s!.settings).toMatchObject({ category: "siyasi", anonymous: true });

    await user.click(screen.getByRole("link", { name: "Anketlere dön" }));
    expect(await screen.findByText(/🗳️ Siyasi Parti · 8 soru/)).toBeInTheDocument();
  });
});
