import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2 font-extrabold tracking-tight", className)} aria-label="Anket360 ana sayfa">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-brand-600" />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="3" />
        <path d="M16 8a8 8 0 0 1 8 8h-8z" fill="#fff" />
      </svg>
      <span className={cn("text-xl", light ? "text-white" : "text-slate-900")}>
        Anket<span className="text-brand-600">360</span>
      </span>
    </Link>
  );
}
