export interface TelemetryRecord {
  connection_id: string;
  timestamp: string;
  source_timestamp: string | null;
  node_id: string;
  alias: string;
  value: number | string | boolean | null;
  data_type: string;
  status_code: string;
  client_id: string;
  unit: string | null;
}

export interface SubscriptionConfig {
  connection_id: string;
  node_id: string;
  alias: string;
  interval_ms: number;
}

export interface ChartDataPoint {
  t: number; // epoch ms
  v: number;
}

export interface MetricStats {
  min: number;
  max: number;
  avg: number;
  /** Units per second over the buffered window tail. */
  rate: number;
}

export interface MetricSeries {
  /** `${connection_id}|${node_id}` — unique across servers. */
  key: string;
  connection_id: string;
  node_id: string;
  alias: string;
  unit: string | null;
  latest: number | string | boolean | null;
  status_code: string;
  numeric: boolean;
  points: ChartDataPoint[];
  stats: MetricStats | null;
  updated: number;
}

export const seriesKey = (connectionId: string, nodeId: string) => `${connectionId}|${nodeId}`;
