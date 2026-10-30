import { Gauge, Server } from "lucide-react";
import type { ServerConnection } from "../types/opcua";

interface Props {
  connections: ServerConnection[];
  latencyMs: number | null;
  onOpenConnections: () => void;
}

function latencyTone(ms: number | null) {
  return ms === null ? "text-smoke" : "text-silver";
}

export function Header({ connections, latencyMs, onOpenConnections }: Props) {
  const live = connections.filter((c) => c.status === "Connected").length;
  const busy = connections.some((c) => c.status === "Connecting" || c.status === "Reconnecting");
  const faulted = connections.some((c) => c.status === "Error");
  const beacon = live > 0 ? { color: "bg-phosphor", label: `LIVE · ${live}`, pulse: true } : busy
    ? { color: "bg-silver", label: "LINKING", pulse: true }
    : faulted
      ? { color: "bg-snow", label: "FAULT", pulse: false }
      : { color: "bg-graphite", label: "OFFLINE", pulse: false };

  return (
    <header data-tauri-drag-region className="flex h-16 shrink-0 items-center gap-4 border-b border-charcoal bg-obsidian pl-24 pr-5">
      <div data-tauri-drag-region className="flex items-center gap-2 text-snow">
        <img src="/logo-mark.svg" alt="" className="h-6 w-6" draggable={false} />
        <span className="text-sm font-medium tracking-wide">Node Voyager</span>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-charcoal bg-obsidian px-3 py-1">
        <span className={`h-2.5 w-2.5 rounded-full ${beacon.color} ${beacon.pulse ? "beacon-pulse" : ""}`} />
        <span className="text-[11px] font-medium tracking-widest text-silver">{beacon.label}</span>
      </div>

      <div data-tauri-drag-region className="flex-1" />

      <div className="flex items-center gap-1.5 text-xs" title="IPC latency (backend timestamp → UI)">
        <Gauge className={`h-4 w-4 ${latencyTone(latencyMs)}`} strokeWidth={1.5} />
        <span className={`w-14 font-mono ${latencyTone(latencyMs)}`}>{latencyMs === null ? "— ms" : `${latencyMs.toFixed(0)} ms`}</span>
      </div>

      <button onClick={onOpenConnections} className="pill-btn border-phosphor bg-phosphor text-snow hover:border-forest">
        <Server className="h-4 w-4" strokeWidth={1.5} /> Connections
        <span className="rounded-full bg-black/25 px-1.5 text-[11px] font-mono">{connections.length}</span>
      </button>
    </header>
  );
}
