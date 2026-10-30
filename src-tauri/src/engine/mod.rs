pub mod client;
pub mod explorer;
pub mod mock;

use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tokio::sync::mpsc::UnboundedSender;

use client::OpcClient;
use mock::MockEngine;

/// Unified telemetry payload (see SPEC.md §3).
#[derive(Debug, Clone, Serialize)]
pub struct TelemetryRecord {
    pub timestamp: DateTime<Utc>,
    pub source_timestamp: Option<DateTime<Utc>>,
    pub node_id: String,
    pub alias: String,
    pub value: serde_json::Value,
    pub data_type: String,
    pub status_code: String,
    pub client_id: String,
    pub unit: Option<String>,
}

pub type TelemetryTx = UnboundedSender<TelemetryRecord>;

#[derive(Debug, Clone, Serialize)]
pub struct NodeItem {
    pub node_id: String,
    pub browse_name: String,
    pub display_name: String,
    /// Object | Variable | Folder | Method | Other
    pub node_class: String,
    pub has_children: bool,
    pub data_type: Option<String>,
    pub unit: Option<String>,
}

pub const CLIENT_ID: &str = "NodeVoyager-Instance-01";

pub const ROOT_NODE: &str = "ns=0;i=85";

/// Enum dispatch between the simulator and a real OPC UA session.
#[derive(Clone)]
pub enum Engine {
    Mock(Arc<MockEngine>),
    Opc(Arc<OpcClient>),
}

impl Engine {
    pub fn is_simulation(&self) -> bool {
        matches!(self, Engine::Mock(_))
    }

    pub fn server_name(&self) -> String {
        match self {
            Engine::Mock(_) => "Node Voyager Simulator".into(),
            Engine::Opc(c) => c.server_name(),
        }
    }

    pub async fn browse(&self, node_id: &str) -> Result<Vec<NodeItem>, String> {
        match self {
            Engine::Mock(m) => m.browse(node_id),
            Engine::Opc(c) => c.browse(node_id).await,
        }
    }

    pub async fn subscribe(
        &self,
        node_id: &str,
        alias: &str,
        interval_ms: u32,
        tx: TelemetryTx,
    ) -> Result<bool, String> {
        match self {
            Engine::Mock(m) => m.subscribe(node_id, alias, interval_ms, tx),
            Engine::Opc(c) => c.subscribe(node_id, alias, interval_ms, tx).await,
        }
    }

    pub async fn unsubscribe(&self, node_id: &str) -> Result<bool, String> {
        match self {
            Engine::Mock(m) => m.unsubscribe(node_id),
            Engine::Opc(c) => c.unsubscribe(node_id).await,
        }
    }

    pub async fn disconnect(&self) {
        match self {
            Engine::Mock(m) => m.shutdown(),
            Engine::Opc(c) => c.disconnect().await,
        }
    }
}

/// Endpoint classification used by `connect_opcua`.
pub enum EndpointKind {
    Simulation,
    Live,
}

pub fn parse_endpoint(raw: &str) -> Result<EndpointKind, String> {
    let url = raw.trim();
    if url.starts_with("mock://") || url.starts_with("sim://") {
        Ok(EndpointKind::Simulation)
    } else if url.starts_with("opc.tcp://") && url.len() > "opc.tcp://".len() {
        Ok(EndpointKind::Live)
    } else {
        Err("Unsupported endpoint. Use opc.tcp://host:port or mock://industrial-core".into())
    }
}
