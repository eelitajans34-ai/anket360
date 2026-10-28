import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt, type OptionStat } from "@/lib/report";
import { cn } from "@/lib/utils";

/**
 * Grafik renkleri (dataviz referans paleti, beyaz kart yüzeyinde doğrulandı):
 * tek renkli büyüklük = mavi; NPS kutuplu = kırmızı ↔ gri ↔ mavi.
 */
export const CHART = {
  seq: "#2a78d6",
  neg: "#e34948",
  neutral: "#c3c2b7",
  grid: "#e1e0d9",
  track: "#f1f5f9",
} as const;

/** Değer + açıklama içeren küçük ipucu kutusu (değer önde). */
function Tip({ value, label, style }: { value: ReactNode; label: ReactNode; style?: React.CSSProperties }) {
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={style}>
      <span className="font-semibold">{value}</span>
      <span className="ml-1.5 text-slate-300">{label}</span>
    </div>
  );
}

/** Yatay çubuk listesi: seçenek adı solda, adet ve yüzde çubuğun ucunda. */
export function HBarList({ items, unit = "yanıt" }: { items: OptionStat[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <span className="truncate text-sm text-slate-700" title={it.label}>{it.label}</span>
          <div className="flex items-center gap-2" aria-label={`${it.label}: ${it.count} ${unit}, ${fmt.pct(it.percent)}`} role="img">
            <div className="h-5 rounded-r" style={{ width: `${(it.count / max) * 85}%`, minWidth: it.count ? 4 : 0, background: CHART.seq }} />
            <span className="whitespace-nowrap text-xs text-slate-600 tabular-nums">
              <span className="font-semibold text-slate-900">{it.count}</span> · {fmt.pct(it.percent)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Sütun grafik (tek seri). Sütun başına ipucu; en yüksek değer etiketli. */
export function ColumnChart({
  points,
  height = 140,
  tickLabel,
  tipLabel,
  ariaLabel,
  labelEvery = 1,
}: {
  points: Array<{ key: string; count: number }>;
  height?: number;
  tickLabel(key: string): string;
  tipLabel(key: string): string;
  ariaLabel: string;
  labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Etiket sıklığı grafiğin gerçek genişliğine göre: etiket başına en az ~56px
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const every = width ? Math.max(labelEvery, Math.ceil(points.length / Math.max(2, Math.floor(width / 56)))) : labelEvery;
  const max = Math.max(...points.map((p) => p.count), 0);
  const top = niceMax(max);
  const peak = max > 0 ? points.findIndex((p) => p.count === max) : -1;

  return (
    <figure className="relative" aria-label={ariaLabel}>
      <div className="flex">
        <div className="relative mr-2 w-6 shrink-0 text-right text-[10px] text-slate-400 tabular-nums" style={{ height }}>
          <span className="absolute right-0 top-0 -translate-y-1/2">{top}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div ref={plotRef} className="relative flex-1">
          <div className="absolute inset-x-0 top-0 border-t" style={{ borderColor: CHART.grid }} />
          <div className="relative flex items-end gap-[2px] border-b" style={{ height, borderColor: "#c3c2b7" }} onPointerLeave={() => setHover(null)}>
            {points.map((p, i) => (
              <div
                key={p.key}
                tabIndex={0}
                role="img"
                aria-label={`${tipLabel(p.key)}: ${p.count}`}
                className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <div
                  className={cn("w-full max-w-6 rounded-t transition-opacity", hover !== null && hover !== i && "opacity-60", "group-focus-visible:ring-2 group-focus-visible:ring-slate-900")}
                  style={{ height: `${top ? (p.count / top) * 100 : 0}%`, minHeight: p.count ? 2 : 0, background: CHART.seq }}
                />
                {i === peak && hover === null && (
                  <span className="absolute -translate-y-1 text-[10px] font-semibold text-slate-700" style={{ bottom: `${(p.count / top) * 100}%` }}>{p.count}</span>
                )}
                {hover === i && <Tip value={p.count} label={tipLabel(p.key)} style={{ left: "50%", bottom: `calc(${top ? (p.count / top) * 100 : 0}% + 6px)` }} />}
              </div>
            ))}
          </div>
          {/* Etiketler sütunun ortasına hizalanır ve sığmasa da kesilmez; uçtakiler kenara yaslanır */}
          <div className="relative mt-1.5 h-3.5 text-[10px] text-slate-400" aria-hidden>
            {points.map((p, i) => {
              if (i % every !== 0) return null;
              const center = ((i + 0.5) / points.length) * 100;
              const align = i === 0 && points.length > 8 ? "translate-x-0" : i === points.length - 1 && points.length > 8 ? "-translate-x-full" : "-translate-x-1/2";
              const left = i === 0 && points.length > 8 ? 0 : i === points.length - 1 && points.length > 8 ? 100 : center;
              return <span key={p.key} className={cn("absolute top-0 whitespace-nowrap", align)} style={{ left: `${left}%` }}>{tickLabel(p.key)}</span>;
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}

function niceMax(n: number): number {
  if (n <= 5) return Math.max(n, 1);
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= n) return m * pow;
  return n;
}

/** NPS dağılımı: kötüleyen ↔ pasif ↔ destekleyen, 2px boşluklu yığılmış çubuk + lejant. */
export function NpsBar({ detractors, passives, promoters }: { detractors: number; passives: number; promoters: number }) {
  const total = detractors + passives + promoters;
  const parts = [
    { key: "kotuleyen", label: "Kötüleyen (0–6)", n: detractors, color: CHART.neg, ink: "#ffffff" },
    { key: "pasif", label: "Pasif (7–8)", n: passives, color: CHART.neutral, ink: "#0b0b0b" },
    { key: "destekleyen", label: "Destekleyen (9–10)", n: promoters, color: CHART.seq, ink: "#ffffff" },
  ];
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="relative flex h-7 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")} onPointerLeave={() => setHover(null)}>
        {parts.filter((p) => p.n > 0).map((p, i, arr) => {
          const share = (p.n / total) * 100;
          return (
            <div
              key={p.key}
              className={cn("relative flex items-center justify-center text-xs font-semibold", i === 0 && "rounded-l", i === arr.length - 1 && "rounded-r")}
              style={{ width: `${share}%`, background: p.color, color: p.ink }}
              onPointerEnter={() => setHover(p.key)}
            >
              {share >= 12 && fmt.pct(share)}
              {hover === p.key && <Tip value={`${p.n} · ${fmt.pct(share)}`} label={p.label} style={{ left: "50%", top: -4 }} />}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
            {p.label}: <span className="font-semibold text-slate-900">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "good" && "text-emerald-700", tone === "bad" && "text-red-700")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
