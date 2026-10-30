import type { MetricSeries } from "../types/telemetry";
import { LiveLineChart } from "./charts/LiveLineChart";

interface Props {
  series: MetricSeries | null;
  /** Shown only when more than one server is connected. */
  serverName?: string | null;
}

export function TelemetryChart({ series, serverName }: Props) {
  if (!series || !series.numeric) {
    return (
      <div className="surface flex h-full items-center justify-center rounded-card text-sm text-smoke">
        Subscribe to a numeric tag to see live telemetry.
      </div>
    );
  }

  return (
    <div className="surface flex h-full min-h-0 flex-col rounded-card p-4">
      <div className="mb-2 flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-sm font-medium text-snow">{series.alias}</span>
        <span className="min-w-0 truncate font-mono text-xs text-smoke">{series.node_id}</span>
        <span className="ml-auto flex shrink-0 items-baseline gap-2">
          {serverName && (
            <span className="rounded-full border border-charcoal bg-ash px-2 py-px text-[10px] tracking-wider text-silver">{serverName}</span>
          )}
          {series.unit && <span className="font-mono text-xs text-smoke">{series.unit}</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <LiveLineChart points={series.points} unit={series.unit} />
      </div>
    </div>
  );
}
