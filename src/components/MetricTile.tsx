import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import type { MetricSeries } from "../types/telemetry";
import { Sparkline } from "./charts/Sparkline";
import { FitText } from "./FitText";

interface Props {
  series: MetricSeries;
  selected: boolean;
  serverName?: string | null;
  onSelect: () => void;
  onRemove: () => void;
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toFixed(1) : Math.abs(n) >= 100 ? n.toFixed(2) : n.toFixed(3));

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-smoke">{label}</div>
      <div className="truncate font-mono text-xs text-silver">{fmt(value)}</div>
    </div>
  );
}

export function MetricTile({ series, serverName, selected, onSelect, onRemove }: Props) {
  const good = series.status_code === "Good";
  const stale = Date.now() - series.updated > 5000;
  const { stats } = series;
  const rate = stats?.rate ?? 0;
  const text = typeof series.latest === "number" ? fmt(series.latest) : String(series.latest ?? "—");

  return (
    <div
      onClick={onSelect}
      className={`surface group relative min-w-0 cursor-pointer overflow-hidden rounded-card p-4 transition-colors ${
        selected ? "border-phosphor" : "hover:border-graphite"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2 pr-5">
        <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-widest text-silver" title={`${series.alias}\n${series.node_id}`}>
          {series.alias}
        </span>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-medium tracking-wider ${
            good && !stale ? "border-charcoal text-phosphor" : "border-graphite text-silver"
          }`}
        >
          {stale ? "STALE" : series.status_code.toUpperCase() || "—"}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Unsubscribe"
        className="absolute right-3 top-3 text-smoke opacity-0 transition-opacity hover:text-snow group-hover:opacity-100"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {serverName && <div className="mt-0.5 truncate text-[10px] text-smoke">{serverName}</div>}

      <FitText max={30} min={13} className="mt-2 font-mono font-medium text-snow">
        {text}
        {series.unit && <span className="ml-1.5 text-[0.55em] font-normal text-smoke">{series.unit}</span>}
      </FitText>

      {series.numeric && stats ? (
        <>
          <div className="mt-1 flex">
            <span
              title="Rate of change"
              className={`inline-flex items-center gap-0.5 rounded-full border border-charcoal bg-ash px-2 py-0.5 font-mono text-[11px] ${
                rate >= 0 ? "text-mint" : "text-silver"
              }`}
            >
              {rate >= 0 ? <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} /> : <ArrowDownRight className="h-3 w-3" strokeWidth={1.5} />}
              {Math.abs(rate).toFixed(2)}/s
            </span>
          </div>
          <div className="mt-3">
            <Sparkline points={series.points} color={good ? "#3ecf8e" : "#898989"} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-charcoal pt-2">
            <Stat label="min" value={stats.min} />
            <Stat label="avg" value={stats.avg} />
            <Stat label="max" value={stats.max} />
          </div>
        </>
      ) : (
        <div className="mt-3 text-xs text-smoke">{series.numeric ? "Waiting for data…" : "Non-numeric signal"}</div>
      )}
    </div>
  );
}
