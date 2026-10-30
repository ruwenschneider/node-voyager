mod commands;
mod engine;
mod state;

use std::sync::Arc;

use tokio::sync::Mutex;

use state::{AppState, SharedState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared: SharedState = Arc::new(Mutex::new(AppState::new()));

    let app = tauri::Builder::default()
        .manage(shared)
        .invoke_handler(tauri::generate_handler![
            commands::connect_opcua,
            commands::disconnect_opcua,
            commands::browse_node,
            commands::subscribe_node,
            commands::unsubscribe_node,
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|handle, event| {
            // Stop engine tasks so no subscription thread outlives the app.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                let state: SharedState = handle.state::<SharedState>().inner().clone();
                tauri::async_runtime::block_on(async move {
                    let ids: Vec<String> = state.lock().await.connections.keys().cloned().collect();
                    for id in ids {
                        commands::close_connection(&state, &id).await;
                    }
                });
            }
        }),
        Err(e) => eprintln!("Node Voyager failed to start: {e}"),
    }
}
