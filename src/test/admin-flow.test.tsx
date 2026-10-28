import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { LocalStore } from "@/lib/data/local-store";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFuture });
  const view = render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return { router, view };
}

async function setup() {
  const st = new LocalStore();
  const u = (await st.signUp({ fullName: "Ayşe Demir", email: "ayse@belediye.gov.tr", password: "sifre1234", kvkkConsent: true }))!;
  const org = await st.createOrganization(u.id, { name: "Örnek Belediyesi", sector: "Kamu / Belediye", size: "201–1000", city: "Bursa" });
  await st.signOut();
  await st.signUp({ fullName: "Mustafa Subaşı", email: "mustafasubasinin@gmail.com", password: "sifre1234" });
  return { st, u, org };
}

describe("Süper yönetici ve abonelik akışı", () => {
  it("süper yönetici paneli: fiyat, IBAN, kurum durumu; kurum ödeme bildirir, yönetici onaylar", async () => {
    const { st, u } = await setup();
    const user = userEvent.setup();
    const r1 = renderAt("/panel");
    // Kurumu olmayan süper yönetici yönetim paneline yönlendirilir
    await screen.findByRole("tab", { name: /Genel Bakış/ });
    expect(r1.router.state.location.pathname).toBe("/yonetim");

    // Paket fiyatı
    await user.click(screen.getByRole("tab", { name: /Paketler/ }));
    const pro = await screen.findByRole("form", { name: "Profesyonel paketi" });
    const fiyat = within(pro).getByLabelText("Fiyat (₺)");
    await user.clear(fiyat);
    await user.type(fiyat, "650");
    await user.click(within(pro).getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Profesyonel paketi kaydedildi.")).toBeInTheDocument();

    // IBAN (geçersiz → hata, geçerli → kaydedilir)
    await user.click(screen.getByRole("tab", { name: /Ödeme Bilgileri/ }));
    await user.type(await screen.findByLabelText("Banka"), "Örnek Bank");
    await user.type(screen.getByLabelText("Alıcı (hesap sahibi)"), "Anket360 Ltd.");
    await user.type(screen.getByLabelText("IBAN"), "TR330006100519786457841327");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText(/Geçerli bir TR IBAN/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("IBAN"));
    await user.type(screen.getByLabelText("IBAN"), "TR330006100519786457841326");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText(/Ödeme bilgileri kaydedildi/)).toBeInTheDocument();
    r1.view.unmount();

    // Kurum ödeme bildirir
    await st.signOut();
    await st.signIn("ayse@belediye.gov.tr", "sifre1234");
    const r2 = renderAt("/panel/abonelik");
    expect(await screen.findByRole("region", { name: "Mevcut paket" })).toHaveTextContent("Başlangıç");
    await user.click((await screen.findAllByRole("button", { name: /Bu pakete geç/ }))[0]!);
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveTextContent("Profesyonel — ₺650");
    expect(dlg).toHaveTextContent("TR33 0006 1005 1978 6457 8413 26");
    await user.type(within(dlg).getByPlaceholderText(/gönderen ad soyad/), "Ayşe Demir 28.10");
    await user.click(within(dlg).getByRole("button", { name: "Ödemeyi yaptım" }));
    expect(await screen.findByText(/Ödeme bildiriminiz alındı/)).toBeInTheDocument();
    expect(screen.getByText("Onay bekliyor")).toBeInTheDocument();
    r2.view.unmount();

    // Süper yönetici onaylar ve kurumu yönetir
    await st.signOut();
    await st.signIn("mustafasubasinin@gmail.com", "sifre1234");
    renderAt("/yonetim");
    await user.click(await screen.findByRole("tab", { name: /Ödemeler/ }));
    await user.click(await screen.findByRole("button", { name: "Onayla" }));
    expect(await screen.findByText(/Ödeme onaylandı/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Kurumlar/ }));
    await user.click(await screen.findByRole("button", { name: /Örnek Belediyesi/ }));
    expect(screen.getByLabelText("Örnek Belediyesi paketi")).toHaveValue("profesyonel");
    await user.click(screen.getByRole("button", { name: "Dondur" }));
    expect(await screen.findByText("Örnek Belediyesi: Donduruldu")).toBeInTheDocument();
    const org = (await st.adminListOrganizations())[0]!;
    expect(org).toMatchObject({ status: "donduruldu", planId: "profesyonel" });
    expect((await st.listPayments(org.id))[0]).toMatchObject({ status: "onaylandi", amount: 650 });
    expect(u.id).toBeTruthy();
  });

  it("kullanıcı hesabını dondurur ve yeniden açar; engellenen kullanıcı bilgi ekranı görür", async () => {
    const { st } = await setup();
    await st.signOut();
    await st.signIn("ayse@belediye.gov.tr", "sifre1234");
    const user = userEvent.setup();
    const r = renderAt("/panel/profil");
    expect(await screen.findByText(/Aydınlatma metni onayı/)).toHaveTextContent(/\d{2}\.\d{2}\.\d{4}/);
    await user.type(screen.getByLabelText("Telefon"), "0555 111 22 33");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Bilgileriniz güncellendi.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dondur" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Evet, dondur" }));
    expect(await screen.findByRole("heading", { name: "Hesabınız donduruldu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hesabımı yeniden aç" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Hesabınız donduruldu" })).not.toBeInTheDocument());
    r.view.unmount();

    const id = (await st.currentUser())!.id;
    await st.signOut();
    await st.signIn("mustafasubasinin@gmail.com", "sifre1234");
    await st.adminSetUserStatus(id, "engellendi");
    await st.signOut();
    await st.signIn("ayse@belediye.gov.tr", "sifre1234");
    renderAt("/panel");
    expect(await screen.findByRole("heading", { name: "Hesabınız engellendi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hesabımı yeniden aç" })).not.toBeInTheDocument();
  });

  it("hesap silme e-posta onayı ister ve hesabı kurumuyla siler", async () => {
    const { st } = await setup();
    await st.signOut();
    await st.signIn("ayse@belediye.gov.tr", "sifre1234");
    const user = userEvent.setup();
    const { router } = renderAt("/panel/profil");
    await user.click(await screen.findByRole("button", { name: "Sil" }));
    const dlg = screen.getByRole("alertdialog");
    expect(dlg).toHaveTextContent("Örnek Belediyesi");
    const sil = within(dlg).getByRole("button", { name: "Hesabımı kalıcı olarak sil" });
    expect(sil).toBeDisabled();
    await user.type(within(dlg).getByRole("textbox"), "ayse@belediye.gov.tr");
    await user.click(sil);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await st.signIn("mustafasubasinin@gmail.com", "sifre1234");
    expect(await st.adminListOrganizations()).toEqual([]);
  });

  it("genel sorularda genel eğilim göstergesi görünür", async () => {
    const { st } = await setup();
    await st.signOut();
    const u = (await st.signIn("ayse@belediye.gov.tr", "sifre1234"));
    const [org] = await st.listMyOrganizations(u.id);
    const q = { id: "q", type: "tek_secim" as const, title: "Sizce ilçemizin en önemli sorunu nedir?", required: true, options: ["Trafik ve ulaşım", "Altyapı ve yollar"], statKey: "ilce-en-onemli-sorun" };
    const s = await st.createSurvey(org!.id, u.id, { title: "T", description: "", status: "yayinda", settings: { anonymous: true, singleResponse: false, showProgress: true }, questions: [q] });
    for (let i = 0; i < 12; i++) await st.submitResponse(s.id, { q: i < 9 ? "Trafik ve ulaşım" : "Altyapı ve yollar" });
    renderAt(`/panel/anketler/${s.id}/duzenle`);
    expect(await screen.findByText(/Genel eğilim/)).toBeInTheDocument();
    expect(screen.getByText(/Genel eğilim/).parentElement).toHaveTextContent('12 yanıt: %75 "Trafik ve ulaşım" dedi · %25 "Altyapı ve yollar" dedi');
  });
});
