//! Named, deterministic states for headless snapshots (`--snap --scene NAME`).
//! Each scene replaces the whole state with an in-memory sky at a fixed `now`.

use crate::app::State;
use crate::grid;
use crate::model::{Size, Task, local_at};
use chrono::{NaiveDate, NaiveTime};

fn at(y: i32, m: u32, d: u32, h: u32, mi: u32) -> i64 {
    local_at(NaiveDate::from_ymd_opt(y, m, d).unwrap_or_default(), NaiveTime::from_hms_opt(h, mi, 0).unwrap_or_default())
        .map(|d| d.timestamp())
        .unwrap_or(0)
}

/// Wed 2026-11-18 12:00 local.
pub fn t0() -> i64 {
    at(2026, 11, 18, 12, 0)
}

fn add(s: &mut State, id: u64, title: &str, size: Size, created: i64, deadline: i64, done: Option<i64>) {
    let (gx, gy) = grid::place(id, &s.centres());
    s.store.tasks.push(Task { id, title: title.into(), created_at: created, deadline, size, gx, gy, done_at: done, deleted: false });
}

pub fn fresh(s: &mut State) {
    // The seeded first star, as a first launch makes it.
    *s = State::frozen_at(at(2026, 11, 13, 18, 0));
}

fn lifes(s: &mut State) {
    *s = State::frozen_at(t0());
    s.store.tasks.clear();
    let span = 10 * 86400;
    let now = t0();
    let rows = [
        (11, "hm one-pager", Size::Large, 1.0f64),
        (12, "stats problem set", Size::Large, 0.6),
        (13, "read ch. 4", Size::Small, 0.3),
        (14, "email supervisor", Size::Small, 0.1),
    ];
    for (id, title, size, life) in rows {
        let deadline = now + (life * span as f64) as i64;
        add(s, id, title, size, deadline - span, deadline, None);
    }
}

pub fn half(s: &mut State) {
    lifes(s);
}

pub fn constellation(s: &mut State) {
    *s = State::frozen_at(t0());
    s.store.tasks.clear();
    let day = 86400;
    let titles = [(21, "lab report", Size::Small), (22, "essay outline", Size::Large), (23, "flashcards", Size::Small), (24, "hm one-pager", Size::Large)];
    for (i, (id, title, size)) in titles.into_iter().enumerate() {
        let done = at(2026, 11, 16, 10, 0) + i as i64 * 8 * 3600;
        add(s, id, title, size, done - 5 * day, done + 2 * day, Some(done));
    }
    // One that slipped by: a single grey module.
    add(s, 25, "call landlord", Size::Small, t0() - 4 * day, t0() - 3600, None);
    // One still alive.
    add(s, 26, "thesis draft", Size::Large, t0() - day, t0() + 5 * day, None);
}

pub fn hud(s: &mut State) {
    lifes(s);
    s.select(12);
}

pub const SCENES: &[(&str, fn(&mut State))] =
    &[("fresh", fresh), ("half", half), ("constellation", constellation), ("hud", hud)];
