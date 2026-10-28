import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { LocalStore } from "@/lib/data/local-store";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFuture });
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return router;
}

describe("Ekip ve şifre akışları", () => {
  it("yönetici davet oluşturur; davetli kayıt olup daveti kabul eder", async () => {
    const store = new LocalStore();
    await store.signUp({ fullName: "Sahip Kişi", email: "sahip@kurum.com", password: "sifre1234" });
    const owner = await store.currentUser();
    await store.createOrganization(owner!.id, { name: "Demir Lojistik", sector: "Lojistik", size: "51–200", city: "Bursa" });

    const user = userEvent.setup();
    const r1 = renderAt("/panel/kurum");
    await user.type(await screen.findByLabelText("Ekip arkadaşı davet et"), "yeni@kurum.com");
    await user.selectOptions(screen.getByLabelText("Rol"), "yonetici");
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    expect(await screen.findByText(/Davet oluşturuldu/)).toBeInTheDocument();
    expect(screen.getByText("yeni@kurum.com")).toBeInTheDocument();
    r1.dispose();

    const [org] = await store.listMyOrganizations(owner!.id);
    const [inv] = await store.listInvitations(org!.id);
    await store.signOut();
    document.body.innerHTML = "";

    const router = renderAt(`/davet/${inv!.token}`);
    await user.click(await screen.findByRole("link", { name: "Hesap oluştur" }));
    await user.type(await screen.findByLabelText("Ad Soyad"), "Yeni Üye");
    await user.type(screen.getByLabelText("İş e-postası"), "yeni@kurum.com");
    await user.type(screen.getByLabelText("Şifre"), "guvenli123");
    await user.type(screen.getByLabelText("Şifre (tekrar)"), "guvenli123");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Hesap oluştur" }));

    await user.click(await screen.findByRole("button", { name: "Daveti kabul et ve katıl" }));
    await screen.findByRole("heading", { name: /Merhaba, Yeni/ });
    expect(router.state.location.pathname).toBe("/panel");
    expect(screen.getAllByText("Demir Lojistik").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yönetici").length).toBeGreaterThan(0);
  });

  it("yanlış hesapla davet kabulü hata gösterir", async () => {
    const store = new LocalStore();
    const owner = await store.signUp({ fullName: "Sahip", email: "sahip@kurum.com", password: "sifre1234" });
    const org = await store.createOrganization(owner!.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    const inv = await store.createInvitation(org.id, owner!.id, "baskasi@kurum.com", "uye");

    const user = userEvent.setup();
    renderAt(`/davet/${inv.token}`);
    await user.click(await screen.findByRole("button", { name: "Daveti kabul et ve katıl" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("baskasi@kurum.com adresine gönderildi");
  });

  it("şifre yenileme sayfası: oturum yoksa geçersiz bağlantı, varsa şifreyi günceller", async () => {
    const user = userEvent.setup();
    const r = renderAt("/sifre-yenile");
    expect(await screen.findByRole("heading", { name: "Bağlantı geçersiz" })).toBeInTheDocument();
    r.dispose();
    document.body.innerHTML = "";

    const store = new LocalStore();
    const u = await store.signUp({ fullName: "Ayşe", email: "a@b.co", password: "sifre1234" });
    await store.createOrganization(u!.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    const router = renderAt("/sifre-yenile");
    await user.type(await screen.findByLabelText("Yeni şifre"), "yenisifre77");
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), "yenisifre77");
    await user.click(screen.getByRole("button", { name: "Şifremi güncelle" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/panel"));
    expect(await screen.findByText("Şifreniz güncellendi.")).toBeInTheDocument();
    await store.signOut();
    await expect(store.signIn("a@b.co", "yenisifre77")).resolves.toBeTruthy();
  });

  it("üye rolündeki kullanıcı anket silme seçeneğini görmez", async () => {
    const store = new LocalStore();
    const owner = await store.signUp({ fullName: "Sahip", email: "sahip@kurum.com", password: "sifre1234" });
    const org = await store.createOrganization(owner!.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    await store.createSurvey(org.id, owner!.id, { title: "Anket A", description: "", status: "taslak", settings: { anonymous: false, singleResponse: true, showProgress: true }, questions: [] });
    const inv = await store.createInvitation(org.id, owner!.id, "uye@kurum.com", "uye");
    const member = await store.signUp({ fullName: "Üye", email: "uye@kurum.com", password: "sifre1234" });
    await store.acceptInvitation(inv.token, member!.id);

    const user = userEvent.setup();
    renderAt("/panel/anketler");
    await user.click(await screen.findByRole("button", { name: "Anket A işlemleri" }));
    expect(screen.getByRole("menuitem", { name: "Kopyala" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Sil" })).not.toBeInTheDocument();
  });
});
