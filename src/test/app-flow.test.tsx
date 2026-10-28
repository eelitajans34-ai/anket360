import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { LocalStore } from "@/lib/data/local-store";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFuture });
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return router;
}

async function seedUser(withOrg = true) {
  const store = new LocalStore();
  const u = await store.signUp({ fullName: "Mehmet Demir", email: "mehmet@kurum.com", password: "sifre1234" });
  if (withOrg) await store.createOrganization(u.id, { name: "Demir Lojistik", sector: "Lojistik", size: "51–200", city: "Bursa" });
  return u;
}

describe("Uygulama akışları", () => {
  it("ana sayfa Türkçe içerikle açılır", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Kurumunuzun sesini");
    expect(screen.getByRole("heading", { name: "Sıkça sorulan sorular" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Ücretsiz/ }).length).toBeGreaterThan(0);
  });

  it("giriş yapmamış kullanıcı panelden giriş sayfasına yönlendirilir", async () => {
    const router = renderAt("/panel");
    await screen.findByRole("heading", { name: "Tekrar hoş geldiniz" });
    expect(router.state.location.pathname).toBe("/giris");
  });

  it("kayıt → kurum oluşturma → panel", async () => {
    const user = userEvent.setup();
    const router = renderAt("/kayit");
    await screen.findByRole("heading", { name: "Ücretsiz hesap oluşturun" });

    await user.click(screen.getByRole("button", { name: "Hesap oluştur" }));
    expect(screen.getByText("Adınızı ve soyadınızı girin.")).toBeInTheDocument();
    expect(screen.getByText(/aydınlatma metnini onaylayın/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Ad Soyad"), "Zeynep Kaya");
    await user.type(screen.getByLabelText("İş e-postası"), "zeynep@ornek.com");
    await user.type(screen.getByLabelText("Şifre"), "guvenli123");
    await user.type(screen.getByLabelText("Şifre (tekrar)"), "guvenli123");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Hesap oluştur" }));

    await screen.findByRole("heading", { name: "Kurumunuzu oluşturun" });
    expect(router.state.location.pathname).toBe("/kurum/olustur");

    await user.click(screen.getByRole("button", { name: /Kurumu oluştur/ }));
    expect(screen.getByText("Kurum adını girin.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Kurum adı/), "Kaya Danışmanlık");
    await user.selectOptions(screen.getByLabelText(/Sektör/), "Danışmanlık");
    await user.selectOptions(screen.getByLabelText(/Çalışan sayısı/), "1–10");
    await user.type(screen.getByLabelText(/Şehir/), "Ankara");
    await user.click(screen.getByRole("button", { name: /Kurumu oluştur/ }));

    await screen.findByRole("heading", { name: /Merhaba, Zeynep/ });
    expect(router.state.location.pathname).toBe("/panel");
    expect(screen.getAllByText("Kaya Danışmanlık").length).toBeGreaterThan(0);
  });

  it("hatalı şifreyle giriş hata gösterir, doğru şifreyle panele girer", async () => {
    await seedUser();
    await new LocalStore().signOut();
    const user = userEvent.setup();
    const router = renderAt("/giris");
    await screen.findByRole("heading", { name: "Tekrar hoş geldiniz" });
    await user.type(screen.getByLabelText("E-posta"), "mehmet@kurum.com");
    await user.type(screen.getByLabelText("Şifre"), "yanlis9999");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta veya şifre hatalı.");

    await user.clear(screen.getByLabelText("Şifre"));
    await user.type(screen.getByLabelText("Şifre"), "sifre1234");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    await screen.findByRole("heading", { name: /Merhaba, Mehmet/ });
    expect(router.state.location.pathname).toBe("/panel");
  });

  it("kurumu olmayan kullanıcı kurum oluşturmaya yönlendirilir", async () => {
    await seedUser(false);
    const router = renderAt("/panel/anketler");
    await screen.findByRole("heading", { name: "Kurumunuzu oluşturun" });
    expect(router.state.location.pathname).toBe("/kurum/olustur");
  });

  it("şablondan anket oluşturur, soru ekler ve yayınlar", async () => {
    await seedUser();
    const user = userEvent.setup();
    const router = renderAt("/panel/anketler/yeni");
    await screen.findByRole("heading", { name: "Yeni anket oluştur" });

    await user.click(screen.getByRole("button", { name: /Boş anket/ }));
    const title = screen.getByLabelText("Anket başlığı");
    await user.clear(title);
    await user.type(title, "Yemekhane Anketi");

    // Soru eklemeden yayınlama reddedilir
    await user.click(screen.getByRole("button", { name: "Yayınla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("en az bir soru");

    const addMenu = screen.getAllByRole("button", { name: /Tek seçim/ })[0]!;
    await user.click(addMenu);
    await user.type(screen.getByLabelText("Soru 1 metni"), "Yemekleri nasıl buluyorsunuz?");
    await user.clear(screen.getByLabelText("Seçenek 1"));
    await user.type(screen.getByLabelText("Seçenek 1"), "Lezzetli");
    await user.clear(screen.getByLabelText("Seçenek 2"));
    await user.type(screen.getByLabelText("Seçenek 2"), "Ortalama");
    await user.click(screen.getByRole("button", { name: "Seçenek ekle" }));
    expect(screen.getByLabelText("Seçenek 3")).toHaveValue("Seçenek 3");

    await user.click(screen.getByRole("button", { name: "Yayınla" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/panel\/anketler\/.+\/duzenle$/));
    await screen.findByText("Tüm değişiklikler kaydedildi");
    expect(screen.getAllByText("Yayında").length).toBeGreaterThan(0);

    const id = router.state.location.pathname.split("/")[3]!;
    const saved = await new LocalStore().getSurvey(id);
    expect(saved).toMatchObject({ title: "Yemekhane Anketi", status: "yayinda" });
    expect(saved!.questions[0]!.options).toEqual(["Lezzetli", "Ortalama", "Seçenek 3"]);
  });

  it("önizlemede zorunlu sorular denetlenir", async () => {
    await seedUser();
    const user = userEvent.setup();
    renderAt("/panel/anketler/yeni");
    await user.click(await screen.findByRole("button", { name: /Müşteri memnuniyeti/ }));
    await user.click(screen.getByRole("tab", { name: /Önizleme/ }));
    await user.click(screen.getByRole("button", { name: "Gönder" }));
    expect(screen.getAllByText("Bu soru zorunludur.").length).toBe(3);
  });

  it("anket listesinde arama ve silme", async () => {
    const u = await seedUser();
    const store = new LocalStore();
    const [org] = await store.listMyOrganizations(u.id);
    const settings = { anonymous: false, singleResponse: true, showProgress: true };
    await store.createSurvey(org!.id, u.id, { title: "Personel Anketi", description: "", status: "taslak", settings, questions: [] });
    await store.createSurvey(org!.id, u.id, { title: "Müşteri Anketi", description: "", status: "taslak", settings, questions: [] });

    const user = userEvent.setup();
    renderAt("/panel/anketler");
    await screen.findByText("Personel Anketi");
    await user.type(screen.getByLabelText("Anket ara"), "müşteri");
    expect(screen.queryByText("Personel Anketi")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Müşteri Anketi işlemleri" }));
    await user.click(screen.getByRole("menuitem", { name: "Sil" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Evet, sil" }));
    await screen.findByText("Aramanızla eşleşen anket yok");
    expect(await store.listSurveys(org!.id)).toHaveLength(1);
  });

  it("kaydedilmemiş değişiklikte ayrılırken uyarır", async () => {
    await seedUser();
    const user = userEvent.setup();
    const router = renderAt("/panel/anketler/yeni");
    await user.click(await screen.findByRole("button", { name: /Boş anket/ }));
    await user.click(screen.getByRole("link", { name: "Anketlere dön" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Kaydedilmemiş değişiklikler");
    await user.click(screen.getByRole("button", { name: "Değişiklikleri at" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/panel/anketler"));
  });

  it("bilinmeyen adres 404 gösterir", async () => {
    renderAt("/yok-boyle-sayfa");
    expect(await screen.findByText("Sayfa bulunamadı")).toBeInTheDocument();
  });
});
