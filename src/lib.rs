//! Night Sky: a todo app where every task is a star on a squared night sky.

pub mod app;
pub mod deadline;
pub mod fx;
pub mod grid;
pub mod model;
pub mod scenes;
pub mod storage;
pub mod view;

use app::{Editing, State};
#[cfg(test)]
use model::Size;
use rune::{AppSpec, Key, KeyEvent, Tx};

static FONTS: &[&[u8]] = &[include_bytes!("../assets/IBMPlexMono-Regular.ttf")];

fn on_key(s: &mut State, e: &KeyEvent, _tx: &mut Tx) -> bool {
    match &e.key {
        Key::Escape => {
            if s.editing != Editing::None {
                s.cancel_edit();
                _tx.blur();
            } else if s.input.focused {
                _tx.blur();
            } else if s.selected.is_some() {
                s.close_hud();
            } else {
                return false;
            }
            true
        }
        Key::Text(t) if (t == "n" || t == "/") && !e.mods.cmd && !e.mods.ctrl && !e.mods.alt => {
            s.input.focused = true;
            true
        }
        Key::Enter => match s.selected {
            Some(id) if s.editing == Editing::None => {
                s.finish(id);
                true
            }
            _ => false,
        },
        _ => false,
    }
}

pub fn spec() -> AppSpec<State> {
    AppSpec::<State> {
        scenes: scenes::SCENES,
        fonts: FONTS,
        families: ("IBM Plex Mono", "IBM Plex Mono"),
        poll: Some(|s, t, tx| s.tick(t, tx)),
        on_key: Some(on_key),
        min_size: Some((360.0, 300.0)),
        ..AppSpec::new("Night Sky", view::DEFAULT_VIEW, State::open, view::view)
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(start))]
pub fn start() {
    rune::run(spec());
}

#[cfg(test)]
mod ui_tests {
    use super::*;
    use crate::model::Status;
    use rune::{Env, Mods, Runtime};

    fn rt() -> Runtime<State> {
        let mut s = State::frozen_at(scenes::t0());
        scenes::half(&mut s);
        let mut rt = Runtime::new(s, view::view, view::DEFAULT_VIEW, Env { system_dark: true, scale: 2.0 });
        for _ in 0..3 {
            rt.frame(1.0 / 60.0);
        }
        rt
    }

    fn tap(rt: &mut Runtime<State>, key: &str) {
        let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no element {key}"));
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        for _ in 0..3 {
            rt.frame(1.0 / 60.0);
        }
    }

    fn key(rt: &mut Runtime<State>, k: Key) {
        rt.key(KeyEvent { key: k, mods: Mods::default() });
        for _ in 0..2 {
            rt.frame(1.0 / 60.0);
        }
    }

    #[test]
    fn tapping_a_star_opens_the_hud_and_finish_marks_it_done() {
        let mut rt = rt();
        tap(&mut rt, "h12");
        assert_eq!(rt.state.selected, Some(12));
        assert!(rt.find("hud-finish").is_some());
        tap(&mut rt, "hud-finish");
        assert!(rt.state.store.get(12).unwrap().done_at.is_some());
        assert_eq!(model::status(rt.state.store.get(12).unwrap(), rt.state.now), Status::Done);
        assert_eq!(rt.state.bursts.len(), 1);
    }

    #[test]
    fn delete_is_a_soft_delete() {
        let mut rt = rt();
        tap(&mut rt, "h13");
        tap(&mut rt, "hud-delete");
        assert!(rt.state.store.get(13).unwrap().deleted);
        assert!(rt.state.selected.is_none());
        assert!(rt.find("h13").is_none());
    }

    #[test]
    fn typing_in_the_bar_adds_a_star_and_a_bad_deadline_keeps_the_text() {
        let mut rt = rt();
        let before = rt.state.store.tasks.len();
        tap(&mut rt, "input");
        for ch in "read paper, soon".chars() {
            key(&mut rt, Key::Text(ch.to_string()));
        }
        key(&mut rt, Key::Enter);
        assert_eq!(rt.state.store.tasks.len(), before);
        assert!(rt.state.bar_error.is_some());
        assert_eq!(rt.state.input.text, "read paper, soon");
        rt.state.input.replace_text("read paper, fri 18:00");
        key(&mut rt, Key::Enter);
        assert_eq!(rt.state.store.tasks.len(), before + 1);
        assert!(rt.state.input.text.is_empty());
        let t = rt.state.store.tasks.last().unwrap();
        assert_eq!(t.title, "read paper");
        assert_eq!(model::format_deadline(t.deadline), "fri 20 nov 18:00");
    }

    #[test]
    fn modules_fade_out_as_a_star_loses_life() {
        let mut rt = rt();
        let id = 11u64;
        let before = grid::visible_count(Size::Large, model::life(rt.state.store.get(id).unwrap(), rt.state.now));
        rt.state.now += 5 * 86400;
        rt.frame(1.0 / 60.0);
        let after = grid::visible_count(Size::Large, model::life(rt.state.store.get(id).unwrap(), rt.state.now));
        assert!(after < before);
    }

    #[test]
    fn a_missed_star_is_one_grey_module() {
        let mut s = State::frozen_at(scenes::t0());
        scenes::constellation(&mut s);
        let mut rt = Runtime::new(s, view::view, view::DEFAULT_VIEW, Env { system_dark: true, scale: 2.0 });
        for _ in 0..30 {
            rt.frame(1.0 / 60.0);
        }
        assert!(rt.find("m25.0.0").is_some());
        assert!(rt.find("m25.1.0").is_none());
    }
}
