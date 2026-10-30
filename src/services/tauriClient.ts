import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConnectionInfo, NodeItem, SecurityMode, StatusEvent } from "../types/opcua";
import type { TelemetryRecord } from "../types/telemetry";

export const connectOpcua = (connectionId: string, endpoint: string, securityMode: SecurityMode) =>
  invoke<ConnectionInfo>("connect_opcua", { connectionId, endpoint, securityMode });

export const disconnectOpcua = (connectionId: string) => invoke<void>("disconnect_opcua", { connectionId });

export const browseNode = (connectionId: string, nodeId: string) => invoke<NodeItem[]>("browse_node", { connectionId, nodeId });

export const subscribeNode = (connectionId: string, nodeId: string, alias: string, intervalMs: number) =>
  invoke<boolean>("subscribe_node", { connectionId, nodeId, alias, intervalMs });

export const unsubscribeNode = (connectionId: string, nodeId: string) =>
  invoke<boolean>("unsubscribe_node", { connectionId, nodeId });

/** Returns an unlisten function; callers must invoke it on unmount. */
export const onTelemetry = (cb: (r: TelemetryRecord) => void): Promise<UnlistenFn> =>
  listen<TelemetryRecord>("telemetry-event", (e) => cb(e.payload));

export const onConnectionStatus = (cb: (e: StatusEvent) => void): Promise<UnlistenFn> =>
  listen<StatusEvent>("connection-status-changed", (e) => cb(e.payload));

export function errorMessage(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : "Unknown error";
}
