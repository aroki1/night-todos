//! App state and the actions that change it. The view only reads this.

use crate::deadline::{DeadlineError, parse_deadline};
use crate::grid::{self, Layout};
use crate::model::{self, Size, Status, Store, Task};
use crate::storage::{self, MemStorage, Storage};
use rune::{TextEdit, Tx};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Editing {
    None,
    Title,
    Deadline,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Burst {
    pub id: u64,
    /// Poll clock (seconds) when the finish happened.
    pub at: f64,
}

pub const BURST_SECS: f64 = 1.0;

pub struct State {
    pub store: Store,
    storage: Box<dyn Storage>,
    /// Unix seconds as of the last poll or action.
    pub now: i64,
    /// A fixed `now` (snapshots, tests): wall-clock time is ignored.
    pub frozen: bool,
    /// The poll clock, seconds since the window opened (virtual when headless).
    pub clock: f64,
    pub input: TextEdit,
    pub new_size: Size,
    pub bar_error: Option<&'static str>,
    pub selected: Option<u64>,
    pub hover: Option<u64>,
    pub editing: Editing,
    pub title_edit: TextEdit,
    pub deadline_edit: TextEdit,
    pub hud_error: Option<&'static str>,
    pub bursts: Vec<Burst>,
    pub save_error: Option<String>,
    /// Hash of everything time-derived the view shows; a change means a redraw is due.
    sig: u64,
}

pub fn wall_now() -> i64 {
    chrono::Utc::now().timestamp()
}

impl State {
    pub fn with_storage(storage: Box<dyn Storage>, now: i64) -> State {
        let (store, fresh) = match storage::load(storage.as_ref()) {
            Some(s) => (s, false),
            None => (Store::default(), true),
        };
        let mut s = State {
            store,
            storage,
            now,
            frozen: false,
            clock: 0.0,
            input: TextEdit::new(""),
            new_size: Size::Small,
            bar_error: None,
            selected: None,
            hover: None,
            editing: Editing::None,
            title_edit: TextEdit::new(""),
            deadline_edit: TextEdit::new(""),
            hud_error: None,
            bursts: Vec::new(),
            save_error: None,
            sig: 0,
        };
        if fresh {
            s.store.tasks.push(model::seed(now));
            s.persist();
        }
        if s.store.rollover(now) {
            s.persist();
        }
        s
    }

    /// Real storage for a real window; nothing persistent for headless runs.
    pub fn open() -> State {
        let now = wall_now();
        let headless = rune::tooling::headless_run().is_some();
        let storage: Box<dyn Storage> = if headless { Box::new(MemStorage::default()) } else { default_storage() };
        let mut s = State::with_storage(storage, now);
        s.sig = s.signature();
        s
    }

    /// A fresh in-memory sky at a fixed time, for snapshots and tests.
    pub fn frozen_at(now: i64) -> State {
        let mut s = State::with_storage(Box::new(MemStorage::default()), now);
        s.frozen = true;
        s.sig = s.signature();
        s
    }

    pub fn persist(&mut self) {
        self.save_error = storage::save(self.storage.as_ref(), &self.store).err();
    }

    pub fn refresh_now(&mut self) {
        if !self.frozen {
            self.now = wall_now();
        }
    }

    /// Centres of the stars on the sky, in stored (landscape) coordinates.
    pub fn centres(&self) -> Vec<(i32, i32)> {
        self.store.sky().map(|t| (t.gx, t.gy)).collect()
    }

    fn signature(&self) -> u64 {
        let mut h = 0u64;
        for t in self.store.sky() {
            let tag = match model::status(t, self.now) {
                Status::Done => 1_000,
                Status::Missed => 2_000,
                Status::Alive(l) => 3_000 + grid::visible_count(t.size, l) as u64,
                // `<=0.25` flips the twinkle to flicker.
            };
            let flick = matches!(model::status(t, self.now), Status::Alive(l) if l <= 0.25) as u64;
            h = grid::mix(h, t.id ^ tag.rotate_left(20) ^ (flick << 50) ^ (t.deadline as u64));
        }
        if let Some(id) = self.selected {
            if let Some(t) = self.store.get(id) {
                h = grid::mix(h, (model::time_left(t, self.now).len() as u64) ^ ((self.now / 60) as u64));
            }
        }
        h
    }

    /// Called every poll: pull in wall-clock time, roll the week over, expire effects.
    /// Returns true when what's on screen should change.
    pub fn tick(&mut self, clock: f64, tx: &mut Tx) -> bool {
        self.clock = clock;
        let mut changed = false;
        self.refresh_now();
        if self.store.rollover(self.now) {
            self.persist();
            if self.selected.is_some_and(|id| self.store.get(id).is_none_or(|t| self.store.archived(t.id))) {
                self.close_hud();
            }
            changed = true;
        }
        let before = self.bursts.len();
        self.bursts.retain(|b| clock - b.at < BURST_SECS);
        changed |= before != self.bursts.len();
        let sig = self.signature();
        if sig != self.sig {
            self.sig = sig;
            changed = true;
        }
        tx.wake_after(Duration::from_millis(if self.bursts.is_empty() { 1000 } else { 120 }));
        changed
    }

    pub fn task(&self, id: u64) -> Option<&Task> {
        self.store.get(id).filter(|t| !t.deleted)
    }

    // ---- actions ----

    pub fn submit_new(&mut self) {
        self.refresh_now();
        let raw = self.input.text.clone();
        let Some((title, when)) = raw.rsplit_once(',') else {
            self.bar_error = Some(DeadlineError::Unreadable.message());
            return;
        };
        let title = model::clamp_title(title);
        if title.is_empty() {
            self.bar_error = Some("give it a title first: title, deadline");
            return;
        }
        match parse_deadline(when, model::local(self.now)) {
            Err(e) => self.bar_error = Some(e.message()),
            Ok(deadline) => {
                let id = grid::mix(self.now as u64, (self.store.tasks.len() as u64) ^ self.clock.to_bits());
                let (gx, gy) = grid::place(id, &self.centres());
                self.store.tasks.push(Task {
                    id,
                    title,
                    created_at: self.now,
                    deadline: deadline.timestamp(),
                    size: self.new_size,
                    gx,
                    gy,
                    done_at: None,
                    deleted: false,
                });
                self.persist();
                self.input.clear();
                self.bar_error = None;
            }
        }
    }

    pub fn toggle_size(&mut self) {
        self.new_size = if self.new_size == Size::Small { Size::Large } else { Size::Small };
    }

    pub fn select(&mut self, id: u64) {
        if self.selected != Some(id) {
            self.selected = Some(id);
            self.editing = Editing::None;
            self.hud_error = None;
        }
    }

    pub fn close_hud(&mut self) {
        self.selected = None;
        self.editing = Editing::None;
        self.hud_error = None;
    }

    pub fn finish(&mut self, id: u64) {
        self.refresh_now();
        let now = self.now;
        let clock = self.clock;
        let Some(t) = self.store.get_mut(id) else { return };
        if t.deleted || t.done_at.is_some() {
            return;
        }
        t.done_at = Some(now);
        self.bursts.push(Burst { id, at: clock });
        self.persist();
        self.editing = Editing::None;
    }

    pub fn delete(&mut self, id: u64) {
        if let Some(t) = self.store.get_mut(id) {
            t.deleted = true;
        }
        self.persist();
        if self.selected == Some(id) {
            self.close_hud();
        }
    }

    pub fn begin_edit(&mut self, what: Editing) {
        let Some(t) = self.selected.and_then(|id| self.task(id)) else { return };
        match what {
            Editing::Title => {
                let title = t.title.clone();
                self.title_edit = TextEdit::new(&title);
                self.title_edit.focused = true;
            }
            Editing::Deadline => {
                let text = model::format_deadline(t.deadline);
                self.deadline_edit = TextEdit::new(&text);
                self.deadline_edit.focused = true;
            }
            Editing::None => {}
        }
        self.hud_error = None;
        self.editing = what;
    }

    pub fn commit_edit(&mut self) {
        self.refresh_now();
        let Some(id) = self.selected else { return };
        match self.editing {
            Editing::Title => {
                let title = model::clamp_title(&self.title_edit.text);
                if !title.is_empty() {
                    if let Some(t) = self.store.get_mut(id) {
                        t.title = title;
                    }
                    self.persist();
                }
                self.editing = Editing::None;
            }
            Editing::Deadline => match parse_deadline(&self.deadline_edit.text, model::local(self.now)) {
                Ok(d) => {
                    if let Some(t) = self.store.get_mut(id) {
                        t.deadline = d.timestamp();
                    }
                    self.persist();
                    self.editing = Editing::None;
                    self.hud_error = None;
                }
                Err(e) => self.hud_error = Some(e.message()),
            },
            Editing::None => {}
        }
    }

    pub fn cancel_edit(&mut self) {
        self.editing = Editing::None;
        self.hud_error = None;
    }

    /// Layout-independent placement check used by tests and the view.
    pub fn layout_pos(&self, lay: &Layout, t: &Task) -> (i32, i32) {
        lay.star_pos(t.gx, t.gy)
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn default_storage() -> Box<dyn Storage> {
    match crate::storage::FileStorage::default_location() {
        Some(f) => Box::new(f),
        None => Box::new(MemStorage::default()),
    }
}

#[cfg(target_arch = "wasm32")]
fn default_storage() -> Box<dyn Storage> {
    Box::new(crate::storage::LocalStorage)
}
