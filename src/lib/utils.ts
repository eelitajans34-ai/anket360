import { clsx, type ClassValue } from "clsx";

/** Uygulamanın tam adresi (alt dizin dahil), ör. https://kullanici.github.io/anket360/panel */
export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}${path}`;
}

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u",
};

export function slugify(text: string): string {
  return text
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase("tr-TR"))
    .join("");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Şifre kuralları: en az 8 karakter, bir harf ve bir rakam. */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push("En az 8 karakter olmalı");
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw)) issues.push("En az bir harf içermeli");
  if (!/\d/.test(pw)) issues.push("En az bir rakam içermeli");
  return issues;
}
