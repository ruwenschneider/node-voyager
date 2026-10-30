import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Box, ChevronDown, ChevronRight, Folder, Radio, Search, Server, Zap } from "lucide-react";
import { browseNode, errorMessage } from "../services/tauriClient";
import { ROOT_NODE_ID, type NodeItem, type ServerConnection } from "../types/opcua";
import { seriesKey } from "../types/telemetry";

interface Props {
  connections: ServerConnection[];
  width: number;
  subscribed: ReadonlySet<string>;
  onToggleSubscribe: (connectionId: string, node: NodeItem) => void;
  onError: (msg: string) => void;
}

interface TreeProps {
  connection: ServerConnection;
  query: string;
  subscribed: ReadonlySet<string>;
  onToggleSubscribe: (connectionId: string, node: NodeItem) => void;
  onError: (msg: string) => void;
}

const PRELOAD_DEPTH = 3;

function NodeIcon({ item }: { item: NodeItem }) {
  const cls = "h-4 w-4 shrink-0";
  if (item.node_class === "Variable") return <Activity className={`${cls} text-phosphor`} strokeWidth={1.5} />;
  if (item.node_class === "Method") return <Zap className={`${cls} text-silver`} strokeWidth={1.5} />;
  return item.has_children ? <Folder className={`${cls} text-silver`} strokeWidth={1.5} /> : <Box className={`${cls} text-smoke`} strokeWidth={1.5} />;
}

function ConnectionTree({ connection, query, subscribed, onToggleSubscribe, onError }: TreeProps) {
  const connectionId = connection.id;
  const [open, setOpen] = useState(true);
  const [children, setChildren] = useState<Record<string, NodeItem[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const generation = useRef(0);

  const load = useCallback(
    async (nodeId: string, depth: number, gen: number) => {
      try {
        const items = await browseNode(connectionId, nodeId);
        if (gen !== generation.current) return;
        setChildren((prev) => ({ ...prev, [nodeId]: items }));
        if (depth < PRELOAD_DEPTH) {
          await Promise.all(items.filter((i) => i.has_children).map((i) => load(i.node_id, depth + 1, gen)));
        }
      } catch (e) {
        if (gen === generation.current) onError(`Browse ${nodeId}: ${errorMessage(e)}`);
      }
    },
    [connectionId, onError],
  );

  useEffect(() => {
    const gen = ++generation.current;
    setChildren({});
    setExpanded(new Set([ROOT_NODE_ID]));
    void load(ROOT_NODE_ID, 1, gen);
    return () => {
      generation.current++;
    };
  }, [load]);

  const toggleExpand = (item: NodeItem) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(item.node_id)) next.delete(item.node_id);
      else {
        next.add(item.node_id);
        if (!children[item.node_id]) void load(item.node_id, PRELOAD_DEPTH, generation.current);
      }
      return next;
    });
  };

  // When searching: keep matching nodes plus their ancestors, and force-expand them.
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    const walk = (id: string): boolean => {
      let any = false;
      for (const it of children[id] ?? []) {
        const hit = it.display_name.toLowerCase().includes(q) || it.node_id.toLowerCase().includes(q);
        const sub = it.has_children && walk(it.node_id);
        if (hit || sub) {
          keep.add(it.node_id);
          any = true;
        }
      }
      return any;
    };
    walk(ROOT_NODE_ID);
    return keep;
  }, [q, children]);

  const renderLevel = (parentId: string, depth: number): React.ReactNode =>
    (children[parentId] ?? [])
      .filter((it) => !visible || visible.has(it.node_id))
      .map((it) => {
        const isOpen = visible ? true : expanded.has(it.node_id);
        const isVar = it.node_class === "Variable";
        const isSub = subscribed.has(seriesKey(connectionId, it.node_id));
        return (
          <div key={it.node_id}>
            <div
              className="group flex items-center gap-1.5 rounded-input py-1 pr-2 text-sm text-silver hover:bg-ash"
              title={`${it.display_name}\n${it.node_id}`}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {it.has_children ? (
                <button onClick={() => toggleExpand(it)} className="text-smoke hover:text-snow" aria-label="toggle">
                  {isOpen ? <ChevronDown className="h-4 w-4" strokeWidth={1.5} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.5} />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <NodeIcon item={it} />
              <span className="min-w-0 flex-1 truncate">
                {it.display_name}
              </span>
              {it.unit && <span className="font-mono text-[10px] text-smoke">{it.unit}</span>}
              {isVar && (
                <button
                  onClick={() => onToggleSubscribe(connectionId, it)}
                  title={isSub ? "Unsubscribe" : "Subscribe"}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider transition-colors ${
                    isSub
                      ? "border-phosphor text-phosphor"
                      : "border-hairline text-silver opacity-0 hover:border-graphite hover:text-snow group-hover:opacity-100"
                  }`}
                >
                  {isSub ? (
                    <span className="flex items-center gap-1">
                      <Radio className="h-3 w-3" strokeWidth={1.5} /> LIVE
                    </span>
                  ) : (
                    "SUBSCRIBE"
                  )}
                </button>
              )}
            </div>
            {it.has_children && isOpen && renderLevel(it.node_id, depth + 1)}
          </div>
        );
      });

  const empty = visible && visible.size === 0;
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`${connection.name}\n${connection.endpoint}`}
        className="flex w-full items-center gap-1.5 rounded-input px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-widest text-silver hover:bg-ash"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.5} /> : <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
        <Server className="h-4 w-4 shrink-0 text-phosphor" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">{connection.name}</span>
      </button>
      {open &&
        (!children[ROOT_NODE_ID] ? (
          <p className="p-3 text-center text-sm text-smoke">Scanning address space…</p>
        ) : empty ? (
          <p className="p-3 text-center text-sm text-smoke">No tags match “{query}”.</p>
        ) : (
          renderLevel(ROOT_NODE_ID, 0)
        ))}
    </div>
  );
}

export function NodeExplorer({ connections, width, subscribed, onToggleSubscribe, onError }: Props) {
  const [query, setQuery] = useState("");
  const live = connections.filter((c) => c.status === "Connected");

  return (
    <aside className="surface flex shrink-0 flex-col rounded-card" style={{ width }}>
      <div className="border-b border-charcoal p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-smoke">Node Pathfinder</div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-smoke" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={live.length === 0}
            placeholder="Search tags…"
            spellCheck={false}
            className="h-9 w-full rounded-input border border-hairline bg-obsidian py-1 pl-8 pr-3 text-sm text-snow outline-none placeholder:text-smoke focus:border-phosphor disabled:opacity-50"
          />
        </div>
      </div>
      <div className="hairline-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {live.length === 0 ? (
          <p className="p-4 text-center text-sm text-smoke">Connect to a server to explore its address space.</p>
        ) : (
          live.map((c) => (
            <ConnectionTree key={c.id} connection={c} query={query} subscribed={subscribed} onToggleSubscribe={onToggleSubscribe} onError={onError} />
          ))
        )}
      </div>
    </aside>
  );
}
