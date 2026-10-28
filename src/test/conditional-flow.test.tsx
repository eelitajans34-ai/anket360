import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { LocalStore } from "@/lib/data/local-store";
import type { Question } from "@/lib/types";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFuture });
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  return router;
}

const sorular: Question[] = [
  { id: "a", type: "evet_hayir", title: "Ürünü kullandınız mı?", required: true },
  { id: "b", type: "derecelendirme", title: "Ürünü puanlayın", required: true, scaleMax: 5 },
  { id: "c", type: "uzun_metin", title: "Neden kullanmadınız?", required: true },
];

async function seed(questions: Question[], status: "taslak" | "yayinda" = "taslak", signOut = false) {
  const store = new LocalStore();
  const u = await store.signUp({ fullName: "Sahip Kişi", email: "sahip@kurum.com", password: "sifre1234" });
  const org = await store.createOrganization(u!.id, { name: "Demir Lojistik", sector: "Lojistik", size: "1–10", city: "Bursa" });
  const s = await store.createSurvey(org.id, u!.id, { title: "Ürün Anketi", description: "", status, settings: { anonymous: true, singleResponse: false, showProgress: true }, questions });
  if (signOut) await store.signOut();
  return { store, s };
}

describe("Koşullu sorular", () => {
  it("düzenleyicide koşul eklenir, önizlemede soru yanıta göre görünür, kaynak soru silinince koşul kalkar", async () => {
    const { store, s } = await seed(sorular);
    const user = userEvent.setup();
    renderAt(`/panel/anketler/${s.id}/duzenle`);

    const soru1 = await screen.findByRole("article", { name: "Soru 1" });
    expect(within(soru1).getByRole("button", { name: "Koşul ekle" })).toBeDisabled();

    // 2. soru: 1. soru "Evet" ise göster
    const soru2 = screen.getByRole("article", { name: "Soru 2" });
    await user.click(within(soru2).getByRole("button", { name: "Koşul ekle" }));
    expect(within(soru2).getByLabelText("Soru 2 koşulunun bağlı olduğu soru")).toHaveValue("a");
    expect(within(soru2).getByLabelText("Soru 2 koşul değeri")).toHaveValue("Evet");

    // 3. soru: 1. soru "Hayır" ise göster
    const soru3 = screen.getByRole("article", { name: "Soru 3" });
    await user.click(within(soru3).getByRole("button", { name: "Koşul ekle" }));
    await user.selectOptions(within(soru3).getByLabelText("Soru 3 koşulunun bağlı olduğu soru"), "a");
    await user.selectOptions(within(soru3).getByLabelText("Soru 3 koşul değeri"), "Hayır");
    expect(within(soru3).getByText("Koşullu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await screen.findByText("Tüm değişiklikler kaydedildi");
    const kayitli = (await store.getSurvey(s.id))!.questions;
    expect(kayitli[1]!.showIf).toEqual({ questionId: "a", operator: "esittir", value: "Evet" });
    expect(kayitli[2]!.showIf).toEqual({ questionId: "a", operator: "esittir", value: "Hayır" });

    // Önizleme
    await user.click(screen.getByRole("tab", { name: /Önizleme/ }));
    expect(screen.getByRole("group", { name: "Ürünü kullandınız mı?" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ürünü puanlayın" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Evet" }));
    expect(screen.getByRole("group", { name: "Ürünü puanlayın" })).toHaveTextContent("2. Ürünü puanlayın");
    expect(screen.queryByRole("group", { name: "Neden kullanmadınız?" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Hayır" }));
    expect(screen.queryByRole("group", { name: "Ürünü puanlayın" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Neden kullanmadınız?" })).toHaveTextContent("2. Neden kullanmadınız?");

    // Kaynak soru silinince bağlı koşullar kalkar
    await user.click(screen.getByRole("tab", { name: /Sorular/ }));
    await user.click(within(screen.getByRole("article", { name: "Soru 1" })).getByRole("button", { name: "Soruyu sil" }));
    expect(screen.queryByText("Koşullu")).not.toBeInTheDocument();
  });

  it("koşulun sonraki soruya bağlanmasına izin vermez (soru yukarı taşınınca)", async () => {
    const { s } = await seed([sorular[0]!, { ...sorular[1]!, showIf: { questionId: "a", operator: "esittir", value: "Evet" } }]);
    const user = userEvent.setup();
    renderAt(`/panel/anketler/${s.id}/duzenle`);
    await user.click(within(await screen.findByRole("article", { name: "Soru 2" })).getByRole("button", { name: "Yukarı taşı" }));
    expect(within(screen.getByRole("article", { name: "Soru 1" })).getByRole("alert")).toHaveTextContent(/kendisinden sonra gelen/);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect((await screen.findAllByRole("alert")).some((a) => /kendisinden sonra gelen/.test(a.textContent ?? ""))).toBe(true);
  });

  it("katılımcı sayfasında gizli zorunlu soru gönderimi engellemez ve gizli yanıt kaydedilmez", async () => {
    const qs: Question[] = [sorular[0]!, { ...sorular[1]!, showIf: { questionId: "a", operator: "esittir", value: "Evet" } }, { ...sorular[2]!, showIf: { questionId: "a", operator: "esittir", value: "Hayır" } }];
    const { store, s } = await seed(qs, "yayinda", true);
    const user = userEvent.setup();
    renderAt(`/a/${s.id}`);
    await user.click(await screen.findByRole("radio", { name: "Evet" }));
    await user.click(screen.getByRole("radio", { name: "4 puan" }));
    await user.click(screen.getByRole("radio", { name: "Hayır" }));
    expect(screen.getByText("İlerleme").nextSibling).toHaveTextContent("1/2");
    await user.type(screen.getByPlaceholderText("Yanıtınız"), "Pahalı buldum");
    await user.click(screen.getByRole("button", { name: "Gönder" }));
    await screen.findByText(/Yanıtlarınız kaydedildi/);
    const [r] = await store.listResponses(s.id);
    expect(r!.answers).toEqual({ a: "Hayır", c: "Pahalı buldum" });
  });
});
