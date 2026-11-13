//! The Rune view: sky, stars, paths, input bar and HUD. Everything is a square module.

use crate::app::{Editing, State};
use crate::fx;
use crate::grid::{self, Layout};
use crate::model::{self, Size, Status, Task};
use rune::{Color, Cx, El, TextStyle, Transition, el, row, col, text, text_input};
use std::collections::HashSet;

pub const DEFAULT_VIEW: (f32, f32) = (1152.0, 648.0);

fn hx(s: &str) -> Color {
    let v = u32::from_str_radix(s.trim_start_matches('#'), 16).unwrap_or(0);
    let dec = |c: u32| {
        let c = c as f32 / 255.0;
        if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
    };
    Color { r: dec((v >> 16) & 255), g: dec((v >> 8) & 255), b: dec(v & 255), a: 1.0 }
}

pub struct Pal {
    pub bg: Color,
    pub dust: Color,
    pub ink: Color,
    pub ink_dim: Color,
    pub done: Color,
    pub done_arm: Color,
    pub trace: Color,
    pub missed: Color,
    pub text: Color,
    pub strong: Color,
}

pub fn pal() -> Pal {
    Pal {
        bg: hx("07080c"),
        dust: hx("3a4152"),
        ink: hx("f4f1e6"),
        ink_dim: hx("c9c3ad"),
        done: hx("ffffff"),
        done_arm: hx("9fb8ff"),
        trace: hx("5b8cff"),
        missed: hx("4a4d55"),
        text: hx("8a8f9c"),
        strong: hx("e6e8ee"),
    }
}

const LABEL: TextStyle = TextStyle::new(11.0, 400.0).lh(14.0);
const UI: TextStyle = TextStyle::new(12.0, 400.0).lh(16.0);
/// Mono advance in em.
const ADVANCE: f32 = 0.6;
const HUD_W: f32 = 256.0;
const HUD_H: f32 = 100.0;

struct Ctx<'a> {
    s: &'a State,
    lay: Layout,
    p: Pal,
    reduced: bool,
}

fn sq(key: String, lay: &Layout, x: i32, y: i32, c: Color) -> El {
    el().key(key).absolute(x as f32 * lay.module, y as f32 * lay.module).size(lay.cell(), lay.cell()).fill(c)
}

fn label_width(title: &str) -> f32 {
    title.chars().count() as f32 * LABEL.size * ADVANCE
}

/// Where a star's label sits: left edge in points, and whether it flipped to the left side.
fn label_x(c: &Ctx, t: &Task, pos: (i32, i32)) -> (f32, bool) {
    let m = c.lay.module;
    let w = label_width(&t.title);
    let right = (pos.0 + grid::arm(t.size) + 2) as f32 * m;
    if right + w <= c.lay.cols as f32 * m {
        (right, false)
    } else {
        ((pos.0 - grid::arm(t.size) - 2) as f32 * m - w, true)
    }
}

fn footprint(c: &Ctx) -> HashSet<(i32, i32)> {
    let mut set = HashSet::new();
    for t in c.s.store.sky() {
        let (x, y) = c.lay.star_pos(t.gx, t.gy);
        for (dx, dy) in grid::shape(t.size) {
            set.insert((x + dx, y + dy));
        }
    }
    set
}

/// Modules under star labels: paths and dust keep clear so the text stays readable.
fn label_cells(c: &Ctx) -> HashSet<(i32, i32)> {
    let mut set = HashSet::new();
    for t in c.s.store.sky().filter(|t| model::status(t, c.s.now) != Status::Missed) {
        let pos = c.lay.star_pos(t.gx, t.gy);
        let (x, _) = label_x(c, t, pos);
        let (a, b) = ((x / c.lay.module).floor() as i32, ((x + label_width(&t.title)) / c.lay.module).floor() as i32);
        for cx in a..=b {
            set.insert((cx, pos.1));
        }
    }
    set
}

fn dust_layer(c: &Ctx, blocked: &HashSet<(i32, i32)>, out: &mut Vec<El>) {
    for x in 0..c.lay.cols {
        for y in 0..c.lay.bar_top() {
            if grid::is_dust(x, y) && !blocked.contains(&(x, y)) {
                out.push(sq(format!("d{x}.{y}"), &c.lay, x, y, c.p.dust).cycle(fx::dust(x, y)));
            }
        }
    }
}

fn star_modules(c: &Ctx, t: &Task, out: &mut Vec<El>) {
    let (cx, cy) = c.lay.star_pos(t.gx, t.gy);
    let now = c.s.now;
    let (mods, stage): (Vec<(i32, i32)>, f32) = match model::status(t, now) {
        Status::Done => (grid::shape(t.size), -1.0),
        Status::Missed => (vec![(0, 0)], -2.0),
        Status::Alive(l) => (grid::visible_modules(t.id, t.size, l), l),
    };
    for (dx, dy) in mods {
        let centre = (dx, dy) == (0, 0);
        let key = format!("m{}.{dx}.{dy}", t.id);
        let (color, _) = match stage {
            s if s == -1.0 => (if centre { c.p.done } else { c.p.done_arm }, 0),
            s if s == -2.0 => (c.p.missed, 0),
            _ => (if centre { c.p.ink } else { c.p.ink_dim }, 0),
        };
        let mut m = sq(key, &c.lay, cx + dx, cy + dy, color);
        m = if stage == -1.0 {
            m.transition(fx::fade(0.3)).enter_delay(fx::centre_out_rank(t.size, dx, dy) as f32 * 0.02)
        } else if stage == -2.0 {
            m.transition(fx::fade(0.4))
        } else {
            let m = m.transition(fx::fade(0.3)).enter_delay(fx::centre_out_rank(t.size, dx, dy) as f32 * 0.015);
            if stage <= 0.25 { m.cycle(fx::flicker(t.id, dx, dy)) } else { m.cycle(fx::twinkle(t.id, dx, dy)) }
        };
        out.push(m);
    }
}

fn star_label(c: &Ctx, t: &Task, out: &mut Vec<El>) {
    let (cx, cy) = c.lay.star_pos(t.gx, t.gy);
    let selected = c.s.selected == Some(t.id);
    let hovered = c.s.hover == Some(t.id);
    let st = model::status(t, c.s.now);
    if st == Status::Missed && !selected && !hovered {
        return;
    }
    let color = if selected || hovered {
        c.p.strong
    } else if st == Status::Done {
        c.p.trace
    } else {
        c.p.text
    };
    let (x, _) = label_x(c, t, (cx, cy));
    let y = (cy as f32 + 0.5) * c.lay.module - LABEL.line_height / 2.0;
    out.push(text(t.title.to_lowercase()).key(format!("l{}", t.id)).font(LABEL).color(color).absolute(x, y).transition(fx::fade(0.3)));
}

fn star_hit(c: &Ctx, t: &Task, out: &mut Vec<El>) {
    let (cx, cy) = c.lay.star_pos(t.gx, t.gy);
    let r = grid::arm(t.size) + 2;
    let m = c.lay.module;
    let id = t.id;
    out.push(
        el().key(format!("h{id}"))
            .absolute((cx - r) as f32 * m, (cy - r) as f32 * m)
            .size((2 * r + 1) as f32 * m, (2 * r + 1) as f32 * m)
            .on_press(move |s: &mut State| s.select(id))
            .on_hover_change(move |s: &mut State, inside, _| {
                if inside {
                    s.hover = Some(id);
                } else if s.hover == Some(id) {
                    s.hover = None;
                }
            }),
    );
}

fn constellation(c: &Ctx, blocked: &HashSet<(i32, i32)>, out: &mut Vec<El>) {
    let stars = c.s.store.constellation(c.s.now);
    let mut cells: Vec<(u64, u64, Vec<(i32, i32)>)> = Vec::new();
    for pair in stars.windows(2) {
        let a = c.lay.star_pos(pair[0].gx, pair[0].gy);
        let b = c.lay.star_pos(pair[1].gx, pair[1].gy);
        cells.push((pair[0].id, pair[1].id, grid::manhattan(a, b, blocked)));
    }
    let total: usize = cells.iter().map(|c| c.2.len()).sum::<usize>().max(1);
    let mut n = 0usize;
    for (from, to, path) in cells {
        for (i, (x, y)) in path.into_iter().enumerate() {
            let m = sq(format!("p{from}.{to}.{x}.{y}"), &c.lay, x, y, c.p.trace)
                .transition(Transition::opacity())
                .enter_delay(i as f32 * 0.012)
                .cycle(fx::shimmer(n as f32 / total as f32));
            n += 1;
            out.push(m);
        }
    }
}

fn bursts(c: &Ctx, out: &mut Vec<El>) {
    if c.reduced {
        return;
    }
    for b in &c.s.bursts {
        let Some(t) = c.s.task(b.id) else { continue };
        let (cx, cy) = c.lay.star_pos(t.gx, t.gy);
        for r in 1..=fx::BURST_MAX {
            for (dx, dy) in fx::ring(r) {
                let (x, y) = (cx + dx, cy + dy);
                if x < 0 || y < 0 || x >= c.lay.cols || y >= c.lay.bar_top() {
                    continue;
                }
                out.push(
                    sq(format!("b{}.{}.{r}.{dx}.{dy}", b.id, b.at.to_bits()), &c.lay, x, y, c.p.done)
                        .opacity(fx::burst_alpha(r))
                        .transition(Transition::none())
                        .sequence(fx::burst_pulse(r)),
                );
            }
        }
    }
}

fn bar(c: &Ctx) -> El {
    let m = c.lay.module;
    let p = &c.p;
    let s = c.s;
    let size_btn = |label: &'static str, size: Size| {
        let on = s.new_size == size;
        text(label).key(format!("size-{label}")).font(UI).color(if on { p.strong } else { p.text })
            .on_press(move |s: &mut State| s.new_size = size)
    };
    let input = text_input(&s.input, UI)
        .key("input")
        .single_line()
        .placeholder("new star: title, deadline", p.text)
        .color(p.ink)
        .grow(1.0)
        .h(UI.line_height)
        .on_edit(|s: &mut State| &mut s.input)
        .on_submit(|s: &mut State, _| s.submit_new());
    let msg = match s.bar_error {
        Some(e) => text(e).key("bar-error").font(LABEL).color(p.strong),
        None => text("").key("bar-hint").font(LABEL).color(p.text),
    };
    let inner = col()
        .key("bar-inner")
        .absolute(m, m)
        .size((c.lay.cols - 2) as f32 * m, (grid::BAR_ROWS - 2) as f32 * m)
        .fill(p.bg)
        .px(m)
        .justify_center()
        .gap(2.0)
        .child(row().w_full().center_y().gap(m).child(input).child(size_btn("[s]", Size::Small)).child(size_btn("[l]", Size::Large)))
        .child(msg);
    el().key("bar")
        .absolute(0.0, c.lay.bar_top() as f32 * m)
        .size(c.lay.cols as f32 * m, grid::BAR_ROWS as f32 * m)
        .fill(p.dust)
        .on_press(|_: &mut State| {})
        .child(inner)
}

fn hud(c: &Ctx, t: &Task) -> El {
    let m = c.lay.module;
    let p = &c.p;
    let s = c.s;
    let id = t.id;
    let (cx, cy) = c.lay.star_pos(t.gx, t.gy);
    let (wm, hm) = ((HUD_W / m).ceil() as i32, (HUD_H / m).ceil() as i32);
    let (lx, flipped) = label_x(c, t, (cx, cy));
    let lw = label_width(&t.title);
    let cols = c.lay.cols;
    let arm = grid::arm(t.size);
    let mods = |pts: f32| (pts / m).ceil() as i32;
    let candidates = if !flipped {
        [mods(lx + lw) + 2, cx - arm - 3 - wm]
    } else {
        [cx + arm + 3, mods(lx) - 2 - wm]
    };
    let x0 = candidates.into_iter().find(|&x| x >= 0 && x + wm <= cols).unwrap_or((cx - wm / 2).clamp(0, (cols - wm).max(0)));
    let y0 = (cy - hm / 2).clamp(0, (c.lay.bar_top() - hm).max(0));

    let title: El = if s.editing == Editing::Title {
        text_input(&s.title_edit, UI).key("hud-title-edit").single_line().color(p.strong).w_full().h(UI.line_height)
            .on_edit(|s: &mut State| &mut s.title_edit)
            .on_submit(|s: &mut State, tx| { s.commit_edit(); tx.blur(); })
    } else {
        text(t.title.to_lowercase()).key("hud-title").font(UI).color(p.strong).truncate()
            .on_press(|s: &mut State| s.begin_edit(Editing::Title))
    };
    let when: El = if s.editing == Editing::Deadline {
        text_input(&s.deadline_edit, UI).key("hud-deadline-edit").single_line().color(p.strong).grow(1.0).h(UI.line_height)
            .on_edit(|s: &mut State| &mut s.deadline_edit)
            .on_submit(|s: &mut State, tx| { s.commit_edit(); tx.blur(); })
    } else {
        text(model::format_deadline(t.deadline)).key("hud-deadline").font(UI).color(p.text).grow(1.0)
            .on_press(|s: &mut State| s.begin_edit(Editing::Deadline))
    };
    let left = text(model::time_left(t, s.now)).key("hud-left").font(UI).color(match model::status(t, s.now) {
        Status::Done => p.trace,
        Status::Missed => p.missed,
        Status::Alive(_) => p.ink,
    });
    let mut buttons = row().gap(m);
    if t.done_at.is_none() {
        buttons = buttons.child(text("[finish]").key("hud-finish").font(UI).color(p.ink).on_press(move |s: &mut State| s.finish(id)));
    }
    buttons = buttons.child(text("[delete]").key("hud-delete").font(UI).color(p.text).on_press(move |s: &mut State| s.delete(id)));
    let note = text(s.hud_error.unwrap_or("")).key("hud-note").font(LABEL).color(p.strong);

    let body = col()
        .absolute(1.0, 1.0)
        .size(wm as f32 * m - 2.0, hm as f32 * m - 2.0)
        .fill(p.bg)
        .padding(m)
        .gap(6.0)
        .child(title)
        .child(row().w_full().gap(8.0).center_y().child(when).child(left))
        .child(buttons)
        .child(note);
    el().key("hud")
        .absolute(x0 as f32 * m, y0 as f32 * m)
        .size(wm as f32 * m, hm as f32 * m)
        .fill(p.dust)
        .on_press(|_: &mut State| {})
        .transition(Transition::opacity())
        .child(body)
}

pub fn view(s: &State, cx: &mut Cx<State>) -> El {
    let [vw, vh] = cx.layout_size("sky").unwrap_or([DEFAULT_VIEW.0, DEFAULT_VIEW.1]);
    let c = Ctx { s, lay: Layout::new(vw, vh), p: pal(), reduced: cx.is_reduced_motion() };
    let m = c.lay.module;

    let mut blocked = footprint(&c);
    blocked.extend(label_cells(&c));
    let mut layer: Vec<El> = Vec::new();
    dust_layer(&c, &blocked, &mut layer);
    constellation(&c, &blocked, &mut layer);
    let tasks: Vec<&Task> = s.store.sky().collect();
    for t in &tasks {
        star_modules(&c, t, &mut layer);
    }
    bursts(&c, &mut layer);
    for t in &tasks {
        star_label(&c, t, &mut layer);
    }
    for t in &tasks {
        star_hit(&c, t, &mut layer);
    }
    layer.push(bar(&c));
    if let Some(t) = s.selected.and_then(|id| s.task(id)) {
        layer.push(hud(&c, t));
    }

    let grid = el().key("grid").absolute(c.lay.ox, c.lay.oy).size(c.lay.cols as f32 * m, c.lay.rows as f32 * m).children(layer);
    col()
        .key("sky")
        .w_full()
        .h_full()
        .fill(c.p.bg)
        .on_background_press_tx(|s: &mut State, tx| {
            s.close_hud();
            tx.blur();
        })
        .child(grid)
}
