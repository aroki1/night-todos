//! Persistence: one JSON document per device. A `Storage` holds the raw text; the rest is
//! plain serde. Corrupt data is copied aside and the sky starts empty. Nothing here panics.

use crate::model::{STORE_VERSION, Store};
use std::cell::RefCell;

pub trait Storage {
    /// The stored JSON, if any.
    fn load(&self) -> Option<String>;
    /// Replace the stored JSON.
    fn save(&self, json: &str) -> Result<(), String>;
    /// Keep a copy of data that could not be read.
    fn backup(&self, raw: &str);
}

/// What a headless run and most tests use: nothing touches the user's real store.
#[derive(Default)]
pub struct MemStorage {
    pub data: RefCell<Option<String>>,
    pub bak: RefCell<Option<String>>,
}

impl Storage for MemStorage {
    fn load(&self) -> Option<String> {
        self.data.borrow().clone()
    }
    fn save(&self, json: &str) -> Result<(), String> {
        *self.data.borrow_mut() = Some(json.to_string());
        Ok(())
    }
    fn backup(&self, raw: &str) {
        *self.bak.borrow_mut() = Some(raw.to_string());
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use file::FileStorage;

#[cfg(not(target_arch = "wasm32"))]
mod file {
    use super::Storage;
    use std::path::PathBuf;

    /// `%APPDATA%/night-sky/store.json` (or the platform's equivalent), written atomically.
    pub struct FileStorage {
        pub path: PathBuf,
    }

    impl FileStorage {
        pub fn default_location() -> Option<FileStorage> {
            Some(FileStorage { path: dirs::config_dir()?.join("night-sky").join("store.json") })
        }
        pub fn at(path: PathBuf) -> FileStorage {
            FileStorage { path }
        }
    }

    impl Storage for FileStorage {
        fn load(&self) -> Option<String> {
            std::fs::read_to_string(&self.path).ok()
        }
        fn save(&self, json: &str) -> Result<(), String> {
            if let Some(dir) = self.path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            let tmp = self.path.with_extension("json.tmp");
            std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())
        }
        fn backup(&self, raw: &str) {
            let _ = std::fs::write(self.path.with_extension("json.bak"), raw);
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub use web::LocalStorage;

#[cfg(target_arch = "wasm32")]
mod web {
    use super::Storage;

    /// `window.localStorage["night-sky"]`.
    pub struct LocalStorage;

    const KEY: &str = "night-sky";

    fn store() -> Option<web_sys::Storage> {
        web_sys::window()?.local_storage().ok()?
    }

    impl Storage for LocalStorage {
        fn load(&self) -> Option<String> {
            store()?.get_item(KEY).ok()?
        }
        fn save(&self, json: &str) -> Result<(), String> {
            store().ok_or("no localStorage")?.set_item(KEY, json).map_err(|e| format!("{e:?}"))
        }
        fn backup(&self, raw: &str) {
            if let Some(s) = store() {
                let _ = s.set_item("night-sky.bak", raw);
            }
        }
    }
}

/// Load the store. First launch (nothing stored) gives `None`; the caller seeds it.
/// Corrupt or unreadable data is backed up and gives an empty store.
pub fn load(storage: &dyn Storage) -> Option<Store> {
    let raw = storage.load()?;
    match serde_json::from_str::<Store>(&raw) {
        Ok(s) if s.version <= STORE_VERSION => Some(s),
        _ => {
            storage.backup(&raw);
            Some(Store::default())
        }
    }
}

pub fn save(storage: &dyn Storage, store: &Store) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    storage.save(&json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Size, Task, Week};

    fn sample() -> Store {
        Store {
            version: STORE_VERSION,
            tasks: vec![
                Task { id: 7, title: "hm one-pager".into(), created_at: 100, deadline: 900, size: Size::Large, gx: 12, gy: 9, done_at: None, deleted: false },
                Task { id: u64::MAX, title: "done \u{2605}".into(), created_at: 1, deadline: 5, size: Size::Small, gx: 40, gy: 20, done_at: Some(3), deleted: true },
            ],
            archive: vec![Week { year: 2026, iso_week: 46, name: None, task_ids: vec![7] }],
        }
    }

    #[test]
    fn roundtrip_in_memory() {
        let m = MemStorage::default();
        assert!(load(&m).is_none(), "first launch");
        save(&m, &sample()).unwrap();
        assert_eq!(load(&m), Some(sample()));
    }

    #[test]
    fn corrupt_data_is_kept_and_the_sky_starts_empty() {
        let m = MemStorage::default();
        m.save("{ not json").unwrap();
        let s = load(&m).unwrap();
        assert!(s.tasks.is_empty());
        assert_eq!(m.bak.borrow().as_deref(), Some("{ not json"));
        // A newer schema is also set aside rather than misread.
        m.save(r#"{"version": 99, "tasks": [], "archive": []}"#).unwrap();
        assert!(load(&m).unwrap().tasks.is_empty());
        assert!(m.bak.borrow().as_deref().unwrap().contains("99"));
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn file_roundtrip_is_atomic_and_recovers_from_corruption() {
        let dir = std::env::temp_dir().join(format!("night-sky-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let f = FileStorage::at(dir.join("nested").join("store.json"));
        assert!(load(&f).is_none());
        save(&f, &sample()).unwrap();
        assert!(!f.path.with_extension("json.tmp").exists(), "temp file renamed away");
        assert_eq!(load(&f), Some(sample()));
        std::fs::write(&f.path, "\u{0}garbage").unwrap();
        assert!(load(&f).unwrap().tasks.is_empty());
        assert_eq!(std::fs::read_to_string(f.path.with_extension("json.bak")).unwrap(), "\u{0}garbage");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
