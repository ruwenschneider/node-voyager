import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Satellite } from "lucide-react";
import { ConnectionsModal } from "./components/ConnectionsModal";
import { Header } from "./components/Header";
import { MetricTile } from "./components/MetricTile";
import { NodeExplorer } from "./components/NodeExplorer";
import { TelemetryChart } from "./components/TelemetryChart";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useTelemetryStream } from "./hooks/useTelemetryStream";
import {
  connectOpcua,
  disconnectOpcua,
  errorMessage,
  onConnectionStatus,
  subscribeNode,
  unsubscribeNode,
} from "./services/tauriClient";
import type { ConnectionConfig, NodeItem, ServerConnection, StatusEvent } from "./types/opcua";
import { seriesKey, type SubscriptionConfig } from "./types/telemetry";

const SAMPLE_INTERVAL_MS = 200;
const AUTO_SUBSCRIBE: [nodeId: string, alias: string][] = [
  ["ns=2;s=Turbine.Speed", "Speed"],
  ["ns=2;s=Turbine.Vibration", "Vibration"],
  ["ns=2;s=Turbine.Temperature", "Temperature"],
  ["ns=2;s=Turbine.Pressure", "Pressure"],
];

const STORE_KEY = "nv.connections";
const WIDTH_KEY = "nv.sidebarWidth";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 220;

const DEFAULT_CONFIGS: ConnectionConfig[] = [
  { id: "simulator", name: "Simulator", endpoint: "mock://industrial-core", securityMode: "None" },
];

function loadConfigs(): ConnectionConfig[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ConnectionConfig[]) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_CONFIGS;
}

const toRuntime = (c: ConnectionConfig): ServerConnection => ({ ...c, status: "Disconnected", info: null, error: null });

export default function App() {
  const [connections, setConnections] = useState<ServerConnection[]>(() => loadConfigs().map(toRuntime));
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Map<string, SubscriptionConfig>>(new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(w) && w >= MIN_WIDTH ? w : DEFAULT_WIDTH;
  });
  const { series, latencyMs, remove, removeConnection } = useTelemetryStream();
  const subsRef = useRef(subs);
  subsRef.current = subs;

  useEffect(() => {
    const configs: ConnectionConfig[] = connections.map(({ id, name, endpoint, securityMode }) => ({ id, name, endpoint, securityMode }));
    localStorage.setItem(STORE_KEY, JSON.stringify(configs));
  }, [connections]);

  const patchConnection = useCallback((id: string, patch: Partial<ServerConnection>) => {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  /** Drop everything that belongs to one server session. */
  const dropSession = useCallback(
    (id: string) => {
      setSubs((prev) => {
        const next = new Map(prev);
        for (const [k, s] of prev) if (s.connection_id === id) next.delete(k);
        return next;
      });
      setSelectedKey((cur) => (cur?.startsWith(`${id}|`) ? null : cur));
      removeConnection(id);
    },
    [removeConnection],
  );

  useTauriEvent<StatusEvent>(onConnectionStatus, (e) => {
    patchConnection(e.connection_id, {
      status: e.status,
      error: e.status === "Error" ? e.message : null,
      ...(e.status === "Disconnected" || e.status === "Error" ? { info: null } : {}),
    });
    if (e.status === "Disconnected" || e.status === "Error") dropSession(e.connection_id);
  });

  const subscribe = useCallback(async (connectionId: string, nodeId: string, alias: string) => {
    try {
      await subscribeNode(connectionId, nodeId, alias, SAMPLE_INTERVAL_MS);
      const key = seriesKey(connectionId, nodeId);
      setSubs((prev) => new Map(prev).set(key, { connection_id: connectionId, node_id: nodeId, alias, interval_ms: SAMPLE_INTERVAL_MS }));
      setSelectedKey((cur) => cur ?? key);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const unsubscribe = useCallback(
    async (key: string) => {
      const sub = subsRef.current.get(key);
      if (!sub) return;
      try {
        await unsubscribeNode(sub.connection_id, sub.node_id);
        setSubs((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        remove(key);
        setSelectedKey((cur) => (cur === key ? null : cur));
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [remove],
  );

  const handleConnect = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    patchConnection(id, { status: "Connecting", error: null });
    try {
      const result = await connectOpcua(id, conn.endpoint.trim(), conn.securityMode);
      patchConnection(id, { status: "Connected", info: result, error: null });
      if (result.simulation) await Promise.all(AUTO_SUBSCRIBE.map(([nodeId, alias]) => subscribe(id, nodeId, alias)));
    } catch (e) {
      patchConnection(id, { status: "Error", error: errorMessage(e), info: null });
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await disconnectOpcua(id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleSave = (config: ConnectionConfig) =>
    setConnections((prev) =>
      prev.some((c) => c.id === config.id) ? prev.map((c) => (c.id === config.id ? { ...c, ...config } : c)) : [...prev, toRuntime(config)],
    );

  const handleRemove = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (conn && conn.status !== "Disconnected" && conn.status !== "Error") await handleDisconnect(id);
    dropSession(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleSubscribe = (connectionId: string, node: NodeItem) => {
    const key = seriesKey(connectionId, node.node_id);
    if (subsRef.current.has(key)) void unsubscribe(key);
    else void subscribe(connectionId, node.node_id, node.display_name);
  };

  // Drag the sidebar edge to resize; double-click resets.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const max = () => Math.min(720, Math.round(window.innerWidth * 0.6));
    const move = (ev: PointerEvent) => setSidebarWidth(Math.max(MIN_WIDTH, Math.min(max(), startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // Keep the selection valid once data arrives.
  useEffect(() => {
    if (!selectedKey && series[0]) setSelectedKey(series[0].key);
  }, [selectedKey, series]);

  const selected = series.find((s) => s.key === selectedKey) ?? null;
  const live = connections.filter((c) => c.status === "Connected");
  const multi = live.length > 1;
  const serverName = (id: string) => (multi ? connections.find((c) => c.id === id)?.name ?? null : null);

  return (
    <div className="flex h-full flex-col bg-obsidian">
      <Header connections={connections} latencyMs={latencyMs} onOpenConnections={() => setModalOpen(true)} />

      {error && (
        <div className="flex items-center gap-2 border-b border-charcoal bg-ash px-5 py-2 text-xs text-snow">
          <AlertTriangle className="h-4 w-4 text-silver" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <button onClick={() => setError(null)} className="text-smoke hover:text-snow">
            dismiss
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <NodeExplorer
          connections={connections}
          width={sidebarWidth}
          subscribed={new Set(subs.keys())}
          onToggleSubscribe={toggleSubscribe}
          onError={setError}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize · double-click to reset"
          onPointerDown={startResize}
          onDoubleClick={() => setSidebarWidth(DEFAULT_WIDTH)}
          className="-mx-3 w-2 shrink-0 cursor-col-resize self-stretch rounded-full bg-transparent transition-colors hover:bg-graphite active:bg-phosphor"
        />

        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {series.length === 0 ? (
            <div className="surface flex flex-1 flex-col items-center justify-center gap-3 rounded-card text-smoke">
              <Satellite className="h-10 w-10 text-graphite" strokeWidth={1.25} />
              <p className="text-sm">{live.length > 0 ? "Awaiting telemetry — subscribe to a tag in the Pathfinder." : "Telemetry Sentinel offline — open Connections to link a server."}</p>
            </div>
          ) : (
            <>
              <div className="hairline-scroll grid max-h-[40%] shrink-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 overflow-y-auto">
                {series.map((s) => (
                  <MetricTile key={s.key} series={s} serverName={serverName(s.connection_id)} selected={s.key === selectedKey} onSelect={() => setSelectedKey(s.key)} onRemove={() => void unsubscribe(s.key)} />
                ))}
              </div>
              <div className="min-h-0 flex-1">
                <TelemetryChart series={selected} serverName={selected ? serverName(selected.connection_id) : null} />
              </div>
            </>
          )}
        </section>
      </main>

      {modalOpen && (
        <ConnectionsModal
          connections={connections}
          onSave={handleSave}
          onRemove={(id) => void handleRemove(id)}
          onConnect={(id) => void handleConnect(id)}
          onDisconnect={(id) => void handleDisconnect(id)}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
