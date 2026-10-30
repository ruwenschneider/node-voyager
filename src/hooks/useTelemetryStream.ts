import { useCallback, useRef, useState } from "react";
import { onTelemetry } from "../services/tauriClient";
import { seriesKey, type ChartDataPoint, type MetricSeries, type MetricStats, type TelemetryRecord } from "../types/telemetry";
import { useTauriEvent } from "./useTauriEvent";

export const BUFFER_SIZE = 120;
const FLUSH_MS = 100;

function computeStats(points: ChartDataPoint[]): MetricStats | null {
  const first = points[0];
  if (!first) return null;
  let min = first.v;
  let max = first.v;
  let sum = 0;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
    sum += p.v;
  }
  const tail = points.slice(-10);
  const a = tail[0];
  const b = tail[tail.length - 1];
  const dt = a && b ? (b.t - a.t) / 1000 : 0;
  return { min, max, avg: sum / points.length, rate: a && b && dt > 0 ? (b.v - a.v) / dt : 0 };
}

/**
 * Collects telemetry into per-metric ring buffers (last BUFFER_SIZE points).
 * Records are staged in refs and flushed to React state at ~10 Hz to keep rendering cheap.
 */
export function useTelemetryStream() {
  const buffers = useRef(new Map<string, MetricSeries>());
  const dirty = useRef(false);
  const latency = useRef<number | null>(null);
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    for (const s of buffers.current.values()) s.stats = s.numeric ? computeStats(s.points) : null;
    setSeries(Array.from(buffers.current.values()).map((s) => ({ ...s, points: s.points.slice() })));
    setLatencyMs(latency.current);
  }, []);

  useTauriEvent<TelemetryRecord>(onTelemetry, (r) => {
    const now = Date.now();
    const ts = Date.parse(r.timestamp);
    if (!Number.isNaN(ts)) {
      const sample = Math.max(0, now - ts);
      latency.current = latency.current === null ? sample : latency.current * 0.9 + sample * 0.1;
    }
    const key = seriesKey(r.connection_id, r.node_id);
    let s = buffers.current.get(key);
    if (!s) {
      s = { key, connection_id: r.connection_id, node_id: r.node_id, alias: r.alias, unit: r.unit, latest: null, status_code: "", numeric: true, points: [], stats: null, updated: 0 };
      buffers.current.set(key, s);
    }
    s.latest = r.value;
    s.status_code = r.status_code;
    s.updated = now;
    if (typeof r.value === "number") {
      s.numeric = true;
      s.points.push({ t: Date.parse(r.source_timestamp ?? r.timestamp) || now, v: r.value });
      if (s.points.length > BUFFER_SIZE) s.points.splice(0, s.points.length - BUFFER_SIZE);
    } else {
      s.numeric = false;
    }
    dirty.current = true;
    if (timer.current === null) timer.current = window.setTimeout(flush, FLUSH_MS);
  });

  const remove = useCallback((key: string) => {
    buffers.current.delete(key);
    dirty.current = true;
    setSeries((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const removeConnection = useCallback((connectionId: string) => {
    for (const [k, s] of buffers.current) if (s.connection_id === connectionId) buffers.current.delete(k);
    dirty.current = true;
    setSeries((prev) => prev.filter((s) => s.connection_id !== connectionId));
  }, []);

  const clear = useCallback(() => {
    buffers.current.clear();
    latency.current = null;
    dirty.current = false;
    setSeries([]);
    setLatencyMs(null);
  }, []);

  return { series, latencyMs, remove, removeConnection, clear };
}
