import { describe, expect, it } from "vitest";
import { initials, isValidEmail, passwordIssues, slugify } from "@/lib/utils";

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
});
