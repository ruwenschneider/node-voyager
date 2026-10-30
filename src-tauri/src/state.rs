use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tokio::sync::Mutex;

use crate::engine::{Engine, TelemetryTx};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    /// Reserved for the auto-reconnect loop (TODO 6.1); the UI already renders it.
    #[allow(dead_code)]
    Reconnecting,
    Error,
}

/// One live (or in-progress) server session.
pub struct Connection {
    pub status: ConnectionStatus,
    pub engine: Option<Engine>,
    /// Task forwarding engine telemetry to the webview; aborted on disconnect.
    pub forwarder: Option<JoinHandle<()>>,
    pub tx: Option<TelemetryTx>,
}

pub struct AppState {
    /// Sessions keyed by the frontend-assigned connection id.
    pub connections: HashMap<String, Connection>,
}

impl AppState {
    pub fn new() -> Self {
        Self { connections: HashMap::new() }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;
