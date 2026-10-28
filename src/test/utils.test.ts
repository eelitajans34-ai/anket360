import { describe, expect, it } from "vitest";
import { initials, isValidEmail, passwordIssues, safeRedirect, slugify } from "@/lib/utils";

describe("yardımcılar", () => {
  it("Türkçe karakterleri slug'a çevirir", () => {
    expect(slugify("Çağdaş Öğretmenler Şirketi İstanbul")).toBe("cagdas-ogretmenler-sirketi-istanbul");
    expect(slugify("  --Ünlü & Güçlü--  ")).toBe("unlu-guclu");
  });

  it("e-posta doğrular", () => {
    expect(isValidEmail("ali@kurum.com.tr")).toBe(true);
    expect(isValidEmail("ali@kurum")).toBe(false);
    expect(isValidEmail("ali kurum.com")).toBe(false);
  });

  it("şifre kurallarını denetler", () => {
    expect(passwordIssues("abc")).toHaveLength(2);
    expect(passwordIssues("abcdefgh")).toEqual(["En az bir rakam içermeli"]);
    expect(passwordIssues("güçlü123")).toEqual([]);
  });

  it("baş harfleri Türkçe kurallarla büyütür", () => {
    expect(initials("ilknur şahin")).toBe("İŞ");
  });

  it("yalnızca uygulama içi yönlendirmeye izin verir", () => {
    expect(safeRedirect("/davet/abc", "/panel")).toBe("/davet/abc");
    for (const kotu of ["//evil.com", "/\\evil.com", "/panel\\..\\x", "https://evil.com", "evil.com", "/a\nb", undefined, 42]) {
      expect(safeRedirect(kotu, "/panel")).toBe("/panel");
    }
  });
});
