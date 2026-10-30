export type ConnectionStatus = "Disconnected" | "Connecting" | "Connected" | "Reconnecting" | "Error";

export type SecurityMode = "None" | "Sign" | "SignAndEncrypt";

export interface ConnectionInfo {
  connection_id: string;
  endpoint: string;
  server_name: string;
  simulation: boolean;
  status: ConnectionStatus;
}

export interface StatusEvent {
  connection_id: string;
  status: ConnectionStatus;
  endpoint: string | null;
  message: string | null;
}

export interface NodeItem {
  node_id: string;
  browse_name: string;
  display_name: string;
  node_class: string;
  has_children: boolean;
  data_type: string | null;
  unit: string | null;
}

export const ROOT_NODE_ID = "ns=0;i=85";

/** User-configured server entry; persisted locally. */
export interface ConnectionConfig {
  id: string;
  name: string;
  endpoint: string;
  securityMode: SecurityMode;
}

/** Config plus runtime state. */
export interface ServerConnection extends ConnectionConfig {
  status: ConnectionStatus;
  info: ConnectionInfo | null;
  error: string | null;
}
