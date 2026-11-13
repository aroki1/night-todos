//! Data model, derived state and week logic. Everything here is pure.

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveTime, TimeZone, Weekday};
use serde::{Deserialize, Serialize};

pub const STORE_VERSION: u32 = 1;
pub const MAX_TITLE: usize = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Size {
    Small,
    Large,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Task {
    pub id: u64,
    pub title: String,
    pub created_at: i64,
    pub deadline: i64,
    pub size: Size,
    pub gx: i32,
    pub gy: i32,
    pub done_at: Option<i64>,
    pub deleted: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Week {
    pub year: i32,
    pub iso_week: u32,
    pub name: Option<String>,
    pub task_ids: Vec<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Store {
    pub version: u32,
    pub tasks: Vec<Task>,
    pub archive: Vec<Week>,
}

impl Default for Store {
    fn default() -> Self {
        Store { version: STORE_VERSION, tasks: Vec::new(), archive: Vec::new() }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Status {
    Done,
    Missed,
    Alive(f32),
}

/// Fraction of the task's span still ahead of `now`, clamped to 0..=1.
pub fn life(task: &Task, now: i64) -> f32 {
    let span = (task.deadline - task.created_at) as f64;
    if span <= 0.0 {
        return if now < task.deadline { 1.0 } else { 0.0 };
    }
    (((task.deadline - now) as f64) / span).clamp(0.0, 1.0) as f32
}

pub fn status(task: &Task, now: i64) -> Status {
    if task.done_at.is_some() {
        Status::Done
    } else if now > task.deadline {
        Status::Missed
    } else {
        Status::Alive(life(task, now))
    }
}

pub fn clamp_title(s: &str) -> String {
    s.trim().chars().take(MAX_TITLE).collect()
}

/// Local-time view of a unix timestamp.
pub fn local(ts: i64) -> DateTime<Local> {
    Local.timestamp_opt(ts, 0).single().unwrap_or_else(|| DateTime::from(DateTime::<chrono::Utc>::from_timestamp(ts, 0).unwrap_or_default()))
}

/// Resolve a local wall-clock time, nudging forward across a DST gap.
pub fn local_at(date: NaiveDate, time: NaiveTime) -> Option<DateTime<Local>> {
    let naive = date.and_time(time);
    Local
        .from_local_datetime(&naive)
        .earliest()
        .or_else(|| Local.from_local_datetime(&(naive + chrono::Duration::hours(1))).earliest())
}

/// `(iso_year, iso_week)` of a timestamp in local time.
pub fn week_of(ts: i64) -> (i32, u32) {
    let w = local(ts).iso_week();
    (w.year(), w.week())
}

/// Monday 00:00 local of the week containing `ts`, as unix seconds.
pub fn week_start(ts: i64) -> i64 {
    let d = local(ts).date_naive();
    let monday = d.week(Weekday::Mon).first_day();
    local_at(monday, NaiveTime::MIN).map(|d| d.timestamp()).unwrap_or(ts)
}

/// Monday 00:00 local of the following week.
pub fn week_end(ts: i64) -> i64 {
    let d = local(ts).date_naive();
    let next = d.week(Weekday::Mon).first_day() + chrono::Duration::days(7);
    local_at(next, NaiveTime::MIN).map(|d| d.timestamp()).unwrap_or(ts + 7 * 86400)
}

impl Store {
    pub fn archived(&self, id: u64) -> bool {
        self.archive.iter().any(|w| w.task_ids.contains(&id))
    }

    /// Tasks on the sky: not deleted, not archived.
    pub fn sky(&self) -> impl Iterator<Item = &Task> {
        self.tasks.iter().filter(move |t| !t.deleted && !self.archived(t.id))
    }

    pub fn get(&self, id: u64) -> Option<&Task> {
        self.tasks.iter().find(|t| t.id == id)
    }

    pub fn get_mut(&mut self, id: u64) -> Option<&mut Task> {
        self.tasks.iter_mut().find(|t| t.id == id)
    }

    /// Done tasks of the current week, in the order they were finished.
    pub fn constellation(&self, now: i64) -> Vec<&Task> {
        let (a, b) = (week_start(now), week_end(now));
        let mut v: Vec<&Task> = self.sky().filter(|t| matches!(t.done_at, Some(d) if d >= a && d < b)).collect();
        v.sort_by_key(|t| (t.done_at, t.id));
        v
    }

    /// Archive every earlier week's tasks. A task belongs to the week it was finished in,
    /// or the week its deadline fell in. Returns true if anything moved.
    pub fn rollover(&mut self, now: i64) -> bool {
        let current = week_of(now);
        let mut moved = false;
        let eligible: Vec<(u64, (i32, u32))> = self
            .tasks
            .iter()
            .filter(|t| !t.deleted && !self.archived(t.id))
            .map(|t| (t.id, week_of(t.done_at.unwrap_or(t.deadline))))
            .filter(|(_, w)| *w < current)
            .collect();
        for (id, (year, iso_week)) in eligible {
            moved = true;
            match self.archive.iter_mut().find(|w| w.year == year && w.iso_week == iso_week) {
                Some(w) => w.task_ids.push(id),
                None => self.archive.push(Week { year, iso_week, name: None, task_ids: vec![id] }),
            }
        }
        if moved {
            self.archive.sort_by_key(|w| (w.year, w.iso_week));
        }
        moved
    }
}

/// `fri 20 nov 23:59`
pub fn format_deadline(ts: i64) -> String {
    local(ts).format("%a %-d %b %H:%M").to_string().to_lowercase()
}

/// `6d 4h`, `3h 12m`, `12m`, `missed`, `done`.
pub fn time_left(task: &Task, now: i64) -> String {
    match status(task, now) {
        Status::Done => "done".into(),
        Status::Missed => "missed".into(),
        Status::Alive(_) => {
            let s = (task.deadline - now).max(0);
            let (d, h, m) = (s / 86400, (s % 86400) / 3600, (s % 3600) / 60);
            if d > 0 {
                format!("{d}d {h}h")
            } else if h > 0 {
                format!("{h}h {m}m")
            } else if m > 0 {
                format!("{m}m")
            } else {
                "<1m".into()
            }
        }
    }
}

/// The task a fresh install starts with.
pub fn seed(now: i64) -> Task {
    let deadline = NaiveDate::from_ymd_opt(2026, 11, 20)
        .and_then(|d| local_at(d, NaiveTime::from_hms_opt(23, 59, 0)?))
        .map(|d| d.timestamp())
        .unwrap_or(now + 7 * 86400);
    let id = crate::grid::mix(0x4d_5f_6f_6e_65, now as u64);
    let mut t = Task { id, title: "HM one-pager".into(), created_at: now, deadline, size: Size::Large, gx: 0, gy: 0, done_at: None, deleted: false };
    let (gx, gy) = crate::grid::place(id, &[]);
    t.gx = gx;
    t.gy = gy;
    t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(created: i64, deadline: i64) -> Task {
        Task { id: 1, title: "t".into(), created_at: created, deadline, size: Size::Small, gx: 10, gy: 10, done_at: None, deleted: false }
    }

    #[test]
    fn life_is_linear_and_clamped() {
        let t = task(1000, 2000);
        assert_eq!(life(&t, 1000), 1.0);
        assert!((life(&t, 1500) - 0.5).abs() < 1e-6);
        assert_eq!(life(&t, 2000), 0.0);
        assert_eq!(life(&t, 900), 1.0);
        assert_eq!(life(&t, 5000), 0.0);
    }

    #[test]
    fn status_cases() {
        let mut t = task(1000, 2000);
        assert!(matches!(status(&t, 1250), Status::Alive(l) if (l - 0.75).abs() < 1e-6));
        assert_eq!(status(&t, 2000), Status::Alive(0.0));
        assert_eq!(status(&t, 2001), Status::Missed);
        t.done_at = Some(1500);
        assert_eq!(status(&t, 9999), Status::Done);
    }

    #[test]
    fn time_left_formats() {
        let t = task(0, 6 * 86400 + 4 * 3600 + 5);
        assert_eq!(time_left(&t, 0), "6d 4h");
        let t = task(0, 3 * 3600 + 12 * 60);
        assert_eq!(time_left(&t, 0), "3h 12m");
        assert_eq!(time_left(&t, 10 * 3600), "missed");
    }

    fn ts(y: i32, m: u32, d: u32, h: u32) -> i64 {
        local_at(NaiveDate::from_ymd_opt(y, m, d).unwrap(), NaiveTime::from_hms_opt(h, 0, 0).unwrap()).unwrap().timestamp()
    }

    #[test]
    fn week_bounds_are_monday_to_monday() {
        let wed = ts(2026, 11, 18, 12);
        assert_eq!(week_start(wed), ts(2026, 11, 16, 0));
        assert_eq!(week_end(wed), ts(2026, 11, 23, 0));
        let sun = ts(2026, 11, 22, 23);
        assert_eq!(week_start(sun), ts(2026, 11, 16, 0));
    }

    #[test]
    fn rollover_archives_previous_week_only() {
        let mut s = Store::default();
        let mk = |id: u64, created: i64, deadline: i64, done: Option<i64>| Task { id, created_at: created, deadline, done_at: done, ..task(0, 1) };
        // Week of Nov 9: missed; done in it; and one finished early whose deadline is far ahead.
        s.tasks.push(mk(1, ts(2026, 11, 9, 8), ts(2026, 11, 11, 8), None));
        s.tasks.push(mk(2, ts(2026, 11, 9, 8), ts(2026, 11, 13, 8), Some(ts(2026, 11, 12, 8))));
        s.tasks.push(mk(3, ts(2026, 11, 10, 8), ts(2026, 12, 1, 8), Some(ts(2026, 11, 10, 9))));
        // Current week (Nov 16): alive, due this week; and alive, due in a future week.
        s.tasks.push(mk(4, ts(2026, 11, 16, 8), ts(2026, 11, 19, 8), None));
        s.tasks.push(mk(5, ts(2026, 11, 16, 8), ts(2026, 12, 1, 8), None));
        let now = ts(2026, 11, 17, 9);
        assert!(s.rollover(now));
        assert_eq!(s.archive.len(), 1);
        let w = &s.archive[0];
        assert_eq!((w.year, w.iso_week), (2026, 46));
        assert_eq!(w.task_ids, vec![1, 2, 3]);
        let sky: Vec<u64> = s.sky().map(|t| t.id).collect();
        assert_eq!(sky, vec![4, 5]);
        assert!(!s.rollover(now), "idempotent");
    }

    #[test]
    fn constellation_is_this_weeks_done_in_order() {
        let mut s = Store::default();
        let mk = |id: u64, done: Option<i64>| Task { id, deadline: ts(2026, 11, 30, 0), done_at: done, ..task(0, 1) };
        s.tasks.push(mk(1, Some(ts(2026, 11, 18, 10))));
        s.tasks.push(mk(2, Some(ts(2026, 11, 17, 10))));
        s.tasks.push(mk(3, None));
        let ids: Vec<u64> = s.constellation(ts(2026, 11, 19, 0)).iter().map(|t| t.id).collect();
        assert_eq!(ids, vec![2, 1]);
    }
}
