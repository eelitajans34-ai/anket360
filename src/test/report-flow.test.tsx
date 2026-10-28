import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routerFuture, routes } from "@/App";
import { LocalStore } from "@/lib/data/local-store";
import type { Answers } from "@/lib/types";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

async function seed() {
  const store = new LocalStore();
  const u = await store.signUp({ fullName: "Sahip Kişi", email: "sahip@kurum.com", password: "sifre1234" });
  const org = await store.createOrganization(u!.id, { name: "Demir Lojistik", sector: "Lojistik", size: "1–10", city: "Bursa" });
  const s = await store.createSurvey(org.id, u!.id, {
    title: "Müşteri Anketi",
    description: "",
    status: "yayinda",
    settings: { anonymous: true, singleResponse: false, showProgress: true },
    questions: [
      { id: "nps", type: "nps", title: "Tavsiye eder misiniz?", required: true },
      { id: "hiz", type: "tek_secim", title: "Hangi hizmet?", required: false, options: ["Satış", "Destek"] },
      { id: "puan", type: "derecelendirme", title: "Genel puan", required: false, scaleMax: 5 },
      { id: "not", type: "uzun_metin", title: "Öneriniz", required: false },
    ],
  });
  const ornekler: Answers[] = [
    { nps: 10, hiz: "Destek", puan: 5, not: "Harika" },
    { nps: 9, hiz: "Destek", puan: 4 },
    { nps: 3, hiz: "Satış", puan: 2, not: "Geç kaldı" },
    { nps: 8 },
  ];
  for (const a of ornekler) await store.submitResponse(s.id, a);
  // Bir yanıtı 40 gün önceye taşı (tarih filtresi için)
  const raw = JSON.parse(localStorage.getItem("anket360:db")!);
  raw.responses[3].createdAt = new Date(Date.now() - 40 * 86_400_000).toISOString();
  localStorage.setItem("anket360:db", JSON.stringify(raw));
  return s;
}

describe("Rapor sekmesi", () => {
  it("özet, NPS, seçenek dağılımı, puan ortalaması ve metin yanıtlarını gösterir; filtre ve dışa aktarma çalışır", async () => {
    const s = await seed();
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: [`/panel/anketler/${s.id}/duzenle`], future: routerFuture });
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
    await user.click(await screen.findByRole("tab", { name: /Rapor/ }));

    const ozet = await screen.findByRole("region", { name: "Özet" });
    expect(within(ozet).getByText("Yanıt sayısı").nextSibling).toHaveTextContent("4");
    // NPS: 2 destekleyen, 1 pasif, 1 kötüleyen → (2-1)/4 = +25
    expect(within(ozet).getByText("NPS").nextSibling).toHaveTextContent("+25");

    const npsKart = screen.getByRole("region", { name: "1. Tavsiye eder misiniz?" });
    expect(within(npsKart).getByText("Kötüleyen (0–6):").parentElement).toHaveTextContent("Kötüleyen (0–6): 1");
    expect(within(npsKart).getByText("Destekleyen (9–10):").parentElement).toHaveTextContent("Destekleyen (9–10): 2");

    const hizKart = screen.getByRole("region", { name: "2. Hangi hizmet?" });
    expect(within(hizKart).getByRole("img", { name: "Destek: 2 yanıt, %67" })).toBeInTheDocument();
    expect(within(hizKart).getByText(/1 boş/)).toBeInTheDocument();

    const puanKart = screen.getByRole("region", { name: "3. Genel puan" });
    expect(puanKart).toHaveTextContent("3,7");

    const notKart = screen.getByRole("region", { name: "4. Öneriniz" });
    expect(within(notKart).getByText("Harika")).toBeInTheDocument();

    // Günlük grafik: sütuna odaklanınca ipucu
    const gunluk = screen.getByRole("figure", { name: "Günlük yanıt sayıları" });
    const bugun = within(gunluk).getAllByRole("img").at(-1)!;
    await act(async () => bugun.focus());
    expect(within(gunluk).getByRole("tooltip")).toHaveTextContent("3");

    // Son 30 gün: 40 gün önceki yanıt düşer, NPS (2-1)/3 = +33
    await user.click(screen.getByRole("radio", { name: "Son 30 gün" }));
    expect(within(ozet).getByText("Yanıt sayısı").nextSibling).toHaveTextContent("3");
    expect(within(ozet).getByText("NPS").nextSibling).toHaveTextContent("+33");

    // Dışa aktarma bir dosya indirir
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    await user.click(screen.getByRole("button", { name: "CSV" }));
    await user.click(screen.getByRole("button", { name: "Excel" }));
    // Excel paketi ihtiyaç anında yüklendiği için indirmeyi bekle
    await waitFor(() => expect(clicks).toHaveLength(2));
    HTMLAnchorElement.prototype.click = orig;
    expect(clicks[0]).toMatch(/^Musteri-Anketi-yanitlar-.*\.csv$/);
    expect(clicks[1]).toMatch(/\.xlsx$/);
    const csv = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(created[0]!); });
    expect(csv.trim().split("\r\n")).toHaveLength(4); // başlık + 3 yanıt (filtreli)
  });

  it("yanıt yokken boş durum gösterir ve dışa aktarma kapalıdır", async () => {
    const store = new LocalStore();
    const u = await store.signUp({ fullName: "Sahip", email: "s@k.com", password: "sifre1234" });
    const org = await store.createOrganization(u!.id, { name: "Kurum", sector: "Eğitim", size: "1–10", city: "Van" });
    const s = await store.createSurvey(org.id, u!.id, { title: "Boş", description: "", status: "yayinda", settings: { anonymous: true, singleResponse: false, showProgress: true }, questions: [{ id: "q", type: "kisa_metin", title: "?", required: false }] });
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: [`/panel/anketler/${s.id}/duzenle`], future: routerFuture });
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
    await user.click(await screen.findByRole("tab", { name: /Rapor/ }));
    expect(await screen.findByText("Henüz yanıt yok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excel" })).toBeDisabled();
  });
});
