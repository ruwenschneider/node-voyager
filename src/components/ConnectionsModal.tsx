import { useEffect, useState } from "react";
import { Pencil, Plug, PlugZap, Plus, Trash2, X } from "lucide-react";
import type { ConnectionConfig, SecurityMode, ServerConnection } from "../types/opcua";

interface Props {
  connections: ServerConnection[];
  onSave: (config: ConnectionConfig) => void;
  onRemove: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onClose: () => void;
}

const DOT: Record<ServerConnection["status"], string> = {
  Connected: "bg-phosphor",
  Connecting: "bg-silver beacon-pulse",
  Reconnecting: "bg-silver beacon-pulse",
  Error: "bg-snow",
  Disconnected: "bg-graphite",
};

const SECURITY_LABEL: Record<SecurityMode, string> = { None: "None", Sign: "Sign", SignAndEncrypt: "Sign & Encrypt" };

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

const input =
  "h-9 w-full rounded-input border border-hairline bg-obsidian px-3 text-sm text-snow outline-none placeholder:text-smoke focus:border-phosphor";

export function ConnectionsModal({ connections, onSave, onRemove, onConnect, onDisconnect, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [security, setSecurity] = useState<SecurityMode>("None");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setEndpoint("");
    setSecurity("None");
  };

  const edit = (c: ServerConnection) => {
    setEditingId(c.id);
    setName(c.name);
    setEndpoint(c.endpoint);
    setSecurity(c.securityMode);
  };

  const valid = endpoint.trim().length > 0;
  const submit = (connectAfter: boolean) => {
    if (!valid) return;
    const ep = endpoint.trim();
    const id = editingId ?? newId();
    onSave({ id, name: name.trim() || ep.replace(/^[a-z.]+:\/\//, ""), endpoint: ep, securityMode: security });
    reset();
    if (connectAfter) onConnect(id);
  };

  const editingConn = connections.find((c) => c.id === editingId);
  const editLocked = !!editingConn && editingConn.status !== "Disconnected" && editingConn.status !== "Error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Server connections" className="surface flex max-h-full w-[640px] max-w-full flex-col rounded-card">
        <div className="flex items-center justify-between border-b border-charcoal px-5 py-4">
          <h2 className="text-sm font-medium tracking-wide text-snow">Server Connections</h2>
          <button onClick={onClose} className="text-smoke hover:text-snow" aria-label="Close">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="hairline-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          {connections.length === 0 && <p className="py-4 text-center text-sm text-smoke">No servers yet. Add one below.</p>}
          {connections.map((c) => {
            const connected = c.status === "Connected";
            const busy = c.status === "Connecting" || c.status === "Reconnecting";
            return (
              <div key={c.id} className="rounded-input border border-charcoal bg-obsidian p-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} title={c.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-snow">{c.name}</span>
                      {c.info && connected && (
                        <span className="shrink-0 rounded-full border border-charcoal bg-ash px-2 text-[10px] tracking-wider text-silver">
                          {c.info.simulation ? "SIMULATION" : "LIVE PLC"}
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-smoke" title={c.endpoint}>
                      {c.endpoint} · {SECURITY_LABEL[c.securityMode]}
                    </div>
                  </div>
                  <button onClick={() => edit(c)} disabled={connected || busy} title="Edit" className="text-smoke hover:text-snow disabled:opacity-30">
                    <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <button onClick={() => onRemove(c.id)} title="Remove" className="text-smoke hover:text-snow">
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  {connected ? (
                    <button onClick={() => onDisconnect(c.id)} className="pill-btn border-hairline py-1.5 text-snow hover:border-graphite hover:bg-white/[0.04]">
                      <PlugZap className="h-4 w-4" strokeWidth={1.5} /> Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => onConnect(c.id)}
                      disabled={busy}
                      className="pill-btn border-phosphor bg-phosphor py-1.5 text-snow hover:border-forest"
                    >
                      <Plug className="h-4 w-4" strokeWidth={1.5} /> {busy ? "Linking…" : "Connect"}
                    </button>
                  )}
                </div>
                {c.error && c.status === "Error" && <p className="mt-2 break-words text-xs text-silver">{c.error}</p>}
              </div>
            );
          })}
        </div>

        <form
          className="space-y-3 border-t border-charcoal p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="text-[11px] font-medium uppercase tracking-widest text-smoke">{editingId ? "Edit server" : "Add server"}</div>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={editLocked} placeholder="Name (optional)" className={input} />
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={editLocked}
              spellCheck={false}
              placeholder="opc.tcp://host:4840  or  mock://industrial-core"
              className={`${input} font-mono text-xs`}
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={security}
              onChange={(e) => setSecurity(e.target.value as SecurityMode)}
              disabled={editLocked}
              className="h-9 rounded-input border border-hairline bg-obsidian px-2 text-xs text-silver outline-none focus:border-phosphor"
            >
              <option value="None">Security: None</option>
              <option value="Sign">Security: Sign</option>
              <option value="SignAndEncrypt">Security: Sign &amp; Encrypt</option>
            </select>
            <div className="flex-1" />
            {editingId && (
              <button type="button" onClick={reset} className="pill-btn border-hairline text-silver hover:border-graphite">
                Cancel
              </button>
            )}
            <button type="submit" disabled={!valid || editLocked} className="pill-btn border-hairline text-snow hover:border-graphite hover:bg-white/[0.04]">
              <Plus className="h-4 w-4" strokeWidth={1.5} /> {editingId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={!valid || editLocked}
              className="pill-btn border-phosphor bg-phosphor text-snow hover:border-forest"
            >
              <Plug className="h-4 w-4" strokeWidth={1.5} /> {editingId ? "Save & connect" : "Add & connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
