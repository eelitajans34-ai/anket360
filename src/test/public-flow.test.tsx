import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { LocalStore } from "@/lib/data/local-store";
import type { SurveyInput } from "@/lib/types";

// jsdom'da canvas yok; QR üretimini taklit et
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFuture });
  const view = render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return { router, view };
}

async function seed(over: Partial<SurveyInput> = {}, signOut = true) {
  const store = new LocalStore();
  const u = await store.signUp({ fullName: "Sahip Kişi", email: "sahip@kurum.com", password: "sifre1234" });
  const org = await store.createOrganization(u!.id, { name: "Demir Lojistik", sector: "Lojistik", size: "1–10", city: "Bursa" });
  const s = await store.createSurvey(org.id, u!.id, {
    title: "Yemekhane Anketi",
    description: "Görüşleriniz önemli",
    status: "yayinda",
    settings: { anonymous: true, singleResponse: true, showProgress: true },
    questions: [
      { id: "q1", type: "tek_secim", title: "Yemekleri nasıl buluyorsunuz?", required: true, options: ["Lezzetli", "Ortalama"] },
      { id: "q2", type: "nps", title: "Tavsiye eder misiniz?", required: true },
      { id: "q3", type: "uzun_metin", title: "Öneriniz", required: false },
    ],
    ...over,
  });
  if (signOut) await store.signOut();
  return { store, survey: s };
}

describe("Herkese açık anket sayfası", () => {
  it("giriş yapmadan yanıtlanır; zorunlu sorular denetlenir; tekrar yanıt engellenir", async () => {
    const { store, survey } = await seed();
    const user = userEvent.setup();
    const { view } = renderAt(`/a/${survey.id}`);

    expect(await screen.findByRole("heading", { name: "Yemekhane Anketi" })).toBeInTheDocument();
    expect(screen.getByText("Demir Lojistik")).toBeInTheDocument();
    expect(screen.getByText(/Bu anket anonimdir/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gönder" }));
    expect(screen.getAllByText("Bu soru zorunludur.")).toHaveLength(2);
    expect(screen.getByText("Lütfen 2 zorunlu soruyu yanıtlayın.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Lezzetli" }));
    await user.click(within(screen.getByRole("radiogroup", { name: /0-10/ })).getByRole("radio", { name: "0" }));
    await user.type(screen.getByPlaceholderText("Yanıtınız"), "Daha çok sebze");
    expect(screen.queryByText("Bu soru zorunludur.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gönder" }));

    expect(await screen.findByText(/Yanıtlarınız kaydedildi/)).toBeInTheDocument();
    const rs = await store.listResponses(survey.id);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.answers).toEqual({ q1: "Lezzetli", q2: 0, q3: "Daha çok sebze" });

    view.unmount();
    renderAt(`/a/${survey.id}`);
    expect(await screen.findByRole("heading", { name: "Bu anketi zaten yanıtladınız" })).toBeInTheDocument();
  });

  it("kapalı, taslak ve olmayan anket için uygun mesaj gösterir", async () => {
    const { survey: kapali } = await seed({ status: "kapali" });
    const r1 = renderAt(`/a/${kapali.id}`);
    expect(await screen.findByText(/artık yanıt kabul etmiyor/)).toBeInTheDocument();
    r1.view.unmount();

    const r2 = renderAt("/a/olmayan-anket");
    expect(await screen.findByRole("heading", { name: "Anket bulunamadı" })).toBeInTheDocument();
    r2.view.unmount();
  });

  it("panelde paylaşım penceresi bağlantıyı ve QR kodu gösterir; yanıtlar sekmesi yanıtları listeler", async () => {
    const { store, survey } = await seed({}, false);
    await store.submitResponse(survey.id, { q1: "Ortalama", q2: 7 });
    const user = userEvent.setup();
    renderAt(`/panel/anketler/${survey.id}/duzenle`);

    await user.click(await screen.findByRole("button", { name: "Paylaş" }));
    const dialog = screen.getByRole("dialog", { name: "Anketi paylaş" });
    expect(within(dialog).getByLabelText("Anket bağlantısı")).toHaveValue(`http://localhost:3000/a/${survey.id}`);
    expect(await within(dialog).findByRole("img", { name: /QR kodu/ })).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(within(dialog).getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toContain(encodeURIComponent(`/a/${survey.id}`));
    await user.click(within(dialog).getByRole("button", { name: "Kapat" }));

    await user.click(screen.getByRole("tab", { name: /Yanıtlar/ }));
    expect(await screen.findByText("Toplam 1 yanıt")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Ortalama")).toBeInTheDocument();
    expect(within(table).getByText("7")).toBeInTheDocument();
  });

  it("anket listesinde yalnız yayındaki anket için Paylaş seçeneği vardır", async () => {
    const { store, survey } = await seed({}, false);
    const [org] = await store.listMyOrganizations((await store.currentUser())!.id);
    await store.createSurvey(org!.id, survey.createdBy, { title: "Taslak Anket", description: "", status: "taslak", settings: survey.settings, questions: [] });
    const user = userEvent.setup();
    renderAt("/panel/anketler");
    await user.click(await screen.findByRole("button", { name: "Taslak Anket işlemleri" }));
    expect(screen.queryByRole("menuitem", { name: "Paylaş" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yemekhane Anketi işlemleri" }));
    await user.click(screen.getByRole("menuitem", { name: "Paylaş" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Anketi paylaş" })).toBeInTheDocument());
  });
});
