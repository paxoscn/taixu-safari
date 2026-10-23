//! Taixu Safari — a tiny 3D wildlife-park web game hosted on the `taixu` library.
//!
//! The library is synchronous and single-process; this binary is the host:
//! HTTP transport, demo authentication, JSON-file persistence, periodic trade
//! expiry and the static Three.js client.

mod api;
mod guide;
mod seed;
mod store;

use std::sync::Arc;
use std::time::Duration;

use axum::routing::get;
use axum::Router;
use taixu::prelude::*;
use tower_http::services::ServeDir;
use tracing_subscriber::EnvFilter;

use crate::store::JsonFileStore;

#[derive(Clone)]
pub struct AppState {
    pub game: Arc<Game>,
    pub npcs: Arc<NpcRuntime>,
    pub store: Arc<JsonFileStore>,
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("taixu_safari=info,tower_http=warn")),
        )
        .init();

    let state_path =
        std::env::var("TAIXU_SAFARI_STATE").unwrap_or_else(|_| "data/safari_state.json".into());
    let store = Arc::new(JsonFileStore::new(&state_path));
    // Host-tunable limits; configuration is not part of the snapshot.
    let config = GameConfig {
        default_inventory_capacity: 60,
        chat_history_per_channel: 120,
        npc_context_messages: 24,
        ..GameConfig::default()
    };

    let game = match Game::load_from(store.as_ref(), config.clone())? {
        Some(game) => {
            tracing::info!(path = %state_path, "restored taixu snapshot");
            game
        }
        None => {
            let game = Game::with_config(config);
            seed::seed(&game)?;
            game.save_to(store.as_ref())?;
            tracing::info!(path = %state_path, "seeded a fresh safari world");
            game
        }
    };
    let game = Arc::new(game);
    let npcs = Arc::new(api::build_npc_runtime());

    // Host responsibility: expire open trades periodically.
    {
        let game = game.clone();
        let store = store.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(15));
            loop {
                tick.tick().await;
                let expired = game.expire_trades();
                if !expired.is_empty() {
                    tracing::info!(count = expired.len(), "expired trades");
                }
                if let Err(error) = store.save_game(&game) {
                    tracing::warn!(%error, "periodic snapshot save failed");
                }
            }
        });
    }

    let app_state = AppState { game, npcs, store };

    let app = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .merge(api::router())
        .with_state(app_state)
        .fallback_service(ServeDir::new("static"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    tracing::info!("Taixu Safari running at http://127.0.0.1:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
