import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PasswordField({ label, error, hint, ...rest }: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} className={cn("input pr-10", error && "border-red-400")} aria-invalid={!!error} {...rest} />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
          aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {(error || hint) && <p className={cn("mt-1.5 text-xs", error ? "text-red-600" : "text-slate-500")}>{error || hint}</p>}
    </div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { ok: password.length >= 8, label: "En az 8 karakter" },
    { ok: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password), label: "Harf" },
    { ok: /\d/.test(password), label: "Rakam" },
    { ok: /[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(password) || password.length >= 12, label: "Özel karakter veya 12+ karakter" },
  ];
  const score = checks.filter((c) => c.ok).length;
  const colors = ["bg-slate-200", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= score ? colors[score] : "bg-slate-200")} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {checks.map((c) => (
          <li key={c.label} className={cn("text-xs", c.ok ? "text-emerald-600" : "text-slate-500")}>{c.ok ? "✓" : "•"} {c.label}</li>
        ))}
      </ul>
    </div>
  );
}
