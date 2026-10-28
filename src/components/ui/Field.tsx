import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BaseProps {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export function TextField({ label, hint, error, className, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {rest.required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        className={cn("input", error && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-desc` : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p id={`${id}-desc`} className={cn("mt-1.5 text-xs", error ? "text-red-600" : "text-slate-500")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({ label, hint, error, className, ...rest }: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} className={cn("input min-h-[90px]", error && "border-red-400")} aria-invalid={!!error} {...rest} />
      {(error || hint) && <p className={cn("mt-1.5 text-xs", error ? "text-red-600" : "text-slate-500")}>{error || hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  options,
  placeholder,
  ...rest
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement> & { options: readonly string[]; placeholder?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {rest.required && <span className="text-red-500"> *</span>}
      </label>
      <select id={id} className={cn("input", error && "border-red-400")} aria-invalid={!!error} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {(error || hint) && <p className={cn("mt-1.5 text-xs", error ? "text-red-600" : "text-slate-500")}>{error || hint}</p>}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const style = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-brand-200 bg-brand-50 text-brand-800",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("rounded-lg border px-3.5 py-2.5 text-sm", style)}>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange(v: boolean): void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-800">{label}</label>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}
