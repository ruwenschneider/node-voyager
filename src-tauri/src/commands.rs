use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::engine::{self, client::OpcClient, mock::MockEngine, Engine, EndpointKind, NodeItem, TelemetryRecord};
use crate::state::{Connection, ConnectionStatus, SharedState};

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionInfo {
    pub connection_id: String,
    pub endpoint: String,
    pub server_name: String,
    pub simulation: bool,
    pub status: ConnectionStatus,
}

#[derive(Debug, Clone, Serialize)]
struct StatusEvent {
    connection_id: String,
    status: ConnectionStatus,
    endpoint: Option<String>,
    message: Option<String>,
}

/// Telemetry record tagged with the session it came from.
#[derive(Debug, Clone, Serialize)]
struct TaggedRecord {
    connection_id: String,
    #[serde(flatten)]
    record: TelemetryRecord,
}

fn emit_status(app: &AppHandle, connection_id: &str, status: ConnectionStatus, endpoint: Option<String>, message: Option<String>) {
    let _ = app.emit(
        "connection-status-changed",
        StatusEvent { connection_id: connection_id.to_string(), status, endpoint, message },
    );
}

#[tauri::command]
pub async fn connect_opcua(
    app: AppHandle,
    state: State<'_, SharedState>,
    connection_id: String,
    endpoint: String,
    security_mode: String,
) -> Result<ConnectionInfo, String> {
    let state: SharedState = state.inner().clone();
    let kind = engine::parse_endpoint(&endpoint)?;
    let endpoint = endpoint.trim().to_string();

    {
        let mut s = state.lock().await;
        if s.connections.contains_key(&connection_id) {
            return Err("Already connected. Disconnect first.".into());
        }
        s.connections.insert(
            connection_id.clone(),
            Connection { status: ConnectionStatus::Connecting, engine: None, forwarder: None, tx: None },
        );
    }
    emit_status(&app, &connection_id, ConnectionStatus::Connecting, Some(endpoint.clone()), None);

    let engine = match kind {
        EndpointKind::Simulation => Ok(Engine::Mock(Arc::new(MockEngine::new()))),
        EndpointKind::Live => OpcClient::connect(&endpoint, &security_mode).await.map(|c| Engine::Opc(Arc::new(c))),
    };
    let engine = match engine {
        Ok(e) => e,
        Err(msg) => {
            state.lock().await.connections.remove(&connection_id);
            emit_status(&app, &connection_id, ConnectionStatus::Error, Some(endpoint), Some(msg.clone()));
            return Err(msg);
        }
    };

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<TelemetryRecord>();
    let app_fwd = app.clone();
    let id_fwd = connection_id.clone();
    let forwarder = tauri::async_runtime::spawn(async move {
        while let Some(record) = rx.recv().await {
            let tagged = TaggedRecord { connection_id: id_fwd.clone(), record };
            if app_fwd.emit("telemetry-event", tagged).is_err() {
                break;
            }
        }
    });

    let info = ConnectionInfo {
        connection_id: connection_id.clone(),
        endpoint: endpoint.clone(),
        server_name: engine.server_name(),
        simulation: engine.is_simulation(),
        status: ConnectionStatus::Connected,
    };
    let orphan = {
        let mut s = state.lock().await;
        match s.connections.get_mut(&connection_id) {
            Some(c) => {
                c.engine = Some(engine.clone());
                c.forwarder = Some(forwarder);
                c.status = ConnectionStatus::Connected;
                c.tx = Some(tx);
                None
            }
            None => Some((forwarder, tx)),
        }
    };
    if let Some((forwarder, tx)) = orphan {
        // Disconnected while the handshake was still running.
        drop(tx);
        engine.disconnect().await;
        forwarder.abort();
        return Err("Connection cancelled".into());
    }
    emit_status(&app, &connection_id, ConnectionStatus::Connected, Some(endpoint), None);
    Ok(info)
}

/// Tear down one session and drop it from state; returns without error if it is already gone.
pub async fn close_connection(state: &SharedState, connection_id: &str) {
    let conn = state.lock().await.connections.remove(connection_id);
    if let Some(c) = conn {
        drop(c.tx);
        if let Some(e) = c.engine {
            e.disconnect().await;
        }
        if let Some(f) = c.forwarder {
            f.abort();
        }
    }
}

#[tauri::command]
pub async fn disconnect_opcua(app: AppHandle, state: State<'_, SharedState>, connection_id: String) -> Result<(), String> {
    let state: SharedState = state.inner().clone();
    close_connection(&state, &connection_id).await;
    emit_status(&app, &connection_id, ConnectionStatus::Disconnected, None, None);
    Ok(())
}

async fn current_engine(state: &SharedState, connection_id: &str) -> Result<Engine, String> {
    state
        .lock()
        .await
        .connections
        .get(connection_id)
        .and_then(|c| c.engine.clone())
        .ok_or_else(|| "Not connected".to_string())
}

#[tauri::command]
pub async fn browse_node(state: State<'_, SharedState>, connection_id: String, node_id: String) -> Result<Vec<NodeItem>, String> {
    let state: SharedState = state.inner().clone();
    let engine = current_engine(&state, &connection_id).await?;
    engine.browse(&node_id).await
}

#[tauri::command]
pub async fn subscribe_node(
    state: State<'_, SharedState>,
    connection_id: String,
    node_id: String,
    alias: String,
    interval_ms: u32,
) -> Result<bool, String> {
    let state: SharedState = state.inner().clone();
    let (engine, tx) = {
        let s = state.lock().await;
        let c = s.connections.get(&connection_id).ok_or_else(|| "Not connected".to_string())?;
        (
            c.engine.clone().ok_or_else(|| "Not connected".to_string())?,
            c.tx.clone().ok_or_else(|| "Telemetry channel closed".to_string())?,
        )
    };
    engine.subscribe(&node_id, &alias, interval_ms, tx).await
}

#[tauri::command]
pub async fn unsubscribe_node(state: State<'_, SharedState>, connection_id: String, node_id: String) -> Result<bool, String> {
    let state: SharedState = state.inner().clone();
    let engine = current_engine(&state, &connection_id).await?;
    engine.unsubscribe(&node_id).await
}
