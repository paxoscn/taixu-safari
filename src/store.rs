//! Host-side persistence: the taixu library never touches the filesystem.
//!
//! `GameStore` is synchronous, so this is a tiny atomic JSON-file store used by
//! both boot-time restore and the periodic autosave task.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use taixu::prelude::*;
use taixu::store::StoreError;

pub struct JsonFileStore {
    path: PathBuf,
    /// Serialize concurrent saves so two snapshots never interleave.
    save_lock: Mutex<()>,
}

impl JsonFileStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            save_lock: Mutex::new(()),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Save a game's current snapshot through the `GameStore` trait.
    pub fn save_game(&self, game: &Game) -> GameResult<()> {
        game.save_to(self)
    }
}

impl GameStore for JsonFileStore {
    fn load(&self) -> std::result::Result<Option<GameState>, StoreError> {
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|error| StoreError::new(format!("decode snapshot: {error}"))),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(StoreError::new(format!("read snapshot: {error}"))),
        }
    }

    fn save(&self, state: &GameState) -> std::result::Result<(), StoreError> {
        let _guard = self
            .save_lock
            .lock()
            .map_err(|_| StoreError::new("save lock poisoned"))?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| StoreError::new(format!("create data dir: {error}")))?;
        }
        let json = serde_json::to_vec_pretty(state)
            .map_err(|error| StoreError::new(format!("encode snapshot: {error}")))?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)
            .map_err(|error| StoreError::new(format!("write temp snapshot: {error}")))?;
        fs::rename(&tmp, &self.path)
            .map_err(|error| StoreError::new(format!("commit snapshot: {error}")))?;
        Ok(())
    }
}
