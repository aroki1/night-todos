//! The square module grid: sizing, placement, star shapes, dropout order and paths.

use crate::model::Size;
use std::collections::HashSet;

pub const COLS: i32 = 96;
pub const ROWS: i32 = 54;
/// Rows reserved at the bottom for the input bar.
pub const BAR_ROWS: i32 = 6;
pub const EDGE: i32 = 4;
pub const MIN_SPACING: i32 = 8;

/// splitmix64 finaliser over two words.
pub fn mix(a: u64, b: u64) -> u64 {
    let mut z = a.wrapping_add(b.wrapping_mul(0x9E37_79B9_7F4A_7C15)).wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

pub fn hash3(a: u64, b: i64, c: i64) -> u64 {
    mix(mix(a, b as u64), c as u64)
}

/// Unit float in 0..1 from a hash.
pub fn unit(h: u64) -> f32 {
    (h >> 40) as f32 / (1u64 << 24) as f32
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Layout {
    pub cols: i32,
    pub rows: i32,
    pub portrait: bool,
    /// Module size in logical points.
    pub module: f32,
    /// Top-left of the grid in the viewport.
    pub ox: f32,
    pub oy: f32,
}

impl Layout {
    pub fn new(w: f32, h: f32) -> Layout {
        let portrait = h > w;
        let (cols, rows) = if portrait { (ROWS, COLS) } else { (COLS, ROWS) };
        let module = (w / cols as f32).min(h / rows as f32).floor().max(4.0);
        Layout { cols, rows, portrait, module, ox: ((w - module * cols as f32) / 2.0).max(0.0).floor(), oy: ((h - module * rows as f32) / 2.0).max(0.0).floor() }
    }

    pub fn gap(&self) -> f32 {
        if self.module < 8.0 { 1.0 } else { 2.0 }
    }

    /// Drawn size of one module.
    pub fn cell(&self) -> f32 {
        self.module - self.gap()
    }

    /// Grid position of a star centre. Stored positions are in landscape coordinates; in
    /// portrait the grid is transposed and the long axis scaled to leave the bar free.
    pub fn star_pos(&self, gx: i32, gy: i32) -> (i32, i32) {
        if !self.portrait {
            return (gx, gy);
        }
        let span_in = (COLS - 2 * EDGE) as f32;
        let span_out = (self.rows - BAR_ROWS - 2 * EDGE - 2) as f32;
        let y = EDGE + (((gx - EDGE) as f32) * span_out / span_in).round() as i32;
        (gy.clamp(EDGE, self.cols - EDGE - 1), y)
    }

    /// Top row of the input bar.
    pub fn bar_top(&self) -> i32 {
        self.rows - BAR_ROWS
    }
}

pub fn arm(size: Size) -> i32 {
    match size {
        Size::Small => 2,
        Size::Large => 3,
    }
}

/// All module offsets of a star, centre first.
pub fn shape(size: Size) -> Vec<(i32, i32)> {
    let a = arm(size);
    let mut v = vec![(0, 0)];
    for k in 1..=a {
        v.extend([(k, 0), (-k, 0), (0, k), (0, -k)]);
    }
    if size == Size::Large {
        v.extend([(1, 1), (1, -1), (-1, 1), (-1, -1)]);
    }
    v
}

/// Non-centre modules ordered by when they drop out: the first entries go last.
/// A star keeps `visible_count` of them, taken from the front.
pub fn dropout_order(id: u64, size: Size) -> Vec<(i32, i32)> {
    let mut v: Vec<(i32, i32)> = shape(size).into_iter().skip(1).collect();
    v.sort_by_key(|&(dx, dy)| hash3(id, dx as i64, dy as i64));
    v
}

/// Non-centre modules showing at this life: `ceil(life * (n - 1))`.
pub fn visible_count(size: Size, life: f32) -> usize {
    let n = shape(size).len();
    (((life.clamp(0.0, 1.0) as f64) * (n - 1) as f64).ceil() as usize).min(n - 1)
}

/// Modules shown for an alive star, centre first.
pub fn visible_modules(id: u64, size: Size, life: f32) -> Vec<(i32, i32)> {
    let mut v = vec![(0, 0)];
    v.extend(dropout_order(id, size).into_iter().take(visible_count(size, life)));
    v
}

pub fn chebyshev(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs().max((a.1 - b.1).abs())
}

fn candidate(id: u64, k: u64) -> (i32, i32) {
    let h = mix(id, k);
    let w = (COLS - 2 * EDGE) as u64;
    let hgt = (ROWS - BAR_ROWS - 2 * EDGE) as u64;
    (EDGE + (h % w) as i32, EDGE + ((h >> 32) % hgt) as i32)
}

/// Choose a centre deterministically from `id`, at least `MIN_SPACING` from every other star.
/// After 64 failed tries the candidate with the most room wins.
pub fn place(id: u64, others: &[(i32, i32)]) -> (i32, i32) {
    let clearance = |c: (i32, i32)| others.iter().map(|&o| chebyshev(c, o)).min().unwrap_or(i32::MAX);
    let mut best = (candidate(id, 0), clearance(candidate(id, 0)));
    for k in 0..64 {
        let c = candidate(id, k);
        let room = clearance(c);
        if room >= MIN_SPACING {
            return c;
        }
        if room > best.1 {
            best = (c, room);
        }
    }
    best.0
}

/// Orthogonal route from `a` to `b`: horizontal first, then vertical. Modules in `blocked`
/// are skipped, and so are the two endpoints.
pub fn manhattan(a: (i32, i32), b: (i32, i32), blocked: &HashSet<(i32, i32)>) -> Vec<(i32, i32)> {
    let mut out = Vec::new();
    let mut p = a;
    let push = |p: (i32, i32), out: &mut Vec<(i32, i32)>| {
        if p != a && p != b && !blocked.contains(&p) {
            out.push(p);
        }
    };
    while p.0 != b.0 {
        p.0 += (b.0 - p.0).signum();
        push(p, &mut out);
    }
    while p.1 != b.1 {
        p.1 += (b.1 - p.1).signum();
        push(p, &mut out);
    }
    out
}

/// Background dust: about 1.5% of modules.
pub fn is_dust(x: i32, y: i32) -> bool {
    hash3(0xD057, x as i64, y as i64) % 1000 < 15
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_sizes() {
        let l = Layout::new(1920.0, 1080.0);
        assert_eq!((l.cols, l.rows, l.module), (96, 54, 20.0));
        assert!(!l.portrait);
        let p = Layout::new(390.0, 844.0);
        assert_eq!((p.cols, p.rows, p.module), (54, 96, 7.0));
        assert!(p.portrait);
        assert_eq!(p.gap(), 1.0);
        assert_eq!(l.gap(), 2.0);
        // Wide window: height limits, grid is centred horizontally.
        let w = Layout::new(2000.0, 540.0);
        assert_eq!(w.module, 10.0);
        assert_eq!(w.ox, (2000.0 - 960.0) / 2.0);
        // Tiny windows never go below 4.
        assert_eq!(Layout::new(100.0, 50.0).module, 4.0);
    }

    #[test]
    fn shapes_have_the_right_module_counts() {
        assert_eq!(shape(Size::Small).len(), 9);
        assert_eq!(shape(Size::Large).len(), 17);
        assert_eq!(shape(Size::Small)[0], (0, 0));
        let uniq: HashSet<_> = shape(Size::Large).into_iter().collect();
        assert_eq!(uniq.len(), 17);
    }

    #[test]
    fn dropout_counts() {
        // Small: 8 non-centre modules.
        assert_eq!(visible_count(Size::Small, 1.0), 8);
        assert_eq!(visible_count(Size::Small, 0.5), 4);
        assert_eq!(visible_count(Size::Small, 0.1), 1);
        // Large: 16 non-centre modules.
        assert_eq!(visible_count(Size::Large, 1.0), 16);
        assert_eq!(visible_count(Size::Large, 0.5), 8);
        assert_eq!(visible_count(Size::Large, 0.1), 2);
        assert_eq!(visible_count(Size::Large, 0.0), 0);
        // With the centre: totals.
        assert_eq!(visible_modules(7, Size::Large, 1.0).len(), 17);
        assert_eq!(visible_modules(7, Size::Large, 0.5).len(), 9);
        assert_eq!(visible_modules(7, Size::Large, 0.1).len(), 3);
        assert_eq!(visible_modules(7, Size::Small, 0.0), vec![(0, 0)]);
    }

    #[test]
    fn dropout_is_nested_as_life_falls() {
        let hi: HashSet<_> = visible_modules(42, Size::Large, 0.8).into_iter().collect();
        let lo: HashSet<_> = visible_modules(42, Size::Large, 0.3).into_iter().collect();
        assert!(lo.is_subset(&hi));
    }

    #[test]
    fn placement_keeps_spacing_and_margins() {
        let mut centres: Vec<(i32, i32)> = Vec::new();
        for i in 0..30u64 {
            let c = place(mix(99, i), &centres);
            assert!(c.0 >= EDGE && c.0 <= COLS - 1 - EDGE, "{c:?}");
            assert!(c.1 >= EDGE && c.1 <= ROWS - BAR_ROWS - 1 - EDGE + 1, "{c:?}");
            for o in &centres {
                assert!(chebyshev(c, *o) >= MIN_SPACING, "{c:?} too near {o:?}");
            }
            centres.push(c);
        }
        assert_eq!(place(5, &[]), place(5, &[]), "deterministic");
    }

    #[test]
    fn placement_falls_back_when_crowded() {
        // A crowded sky still returns a position inside the margins.
        let mut centres = Vec::new();
        for x in (EDGE..COLS - EDGE).step_by(3) {
            for y in (EDGE..ROWS - BAR_ROWS - EDGE).step_by(3) {
                centres.push((x, y));
            }
        }
        let c = place(1, &centres);
        assert!(c.0 >= EDGE && c.1 >= EDGE);
    }

    #[test]
    fn manhattan_goes_horizontal_then_vertical_and_avoids_stars() {
        let a = (10, 10);
        let b = (14, 13);
        let none = HashSet::new();
        let p = manhattan(a, b, &none);
        assert_eq!(p, vec![(11, 10), (12, 10), (13, 10), (14, 10), (14, 11), (14, 12)]);
        // Block a couple of route modules as a star would.
        let blocked: HashSet<_> = shape(Size::Small).into_iter().map(|(dx, dy)| (12 + dx, 10 + dy)).collect();
        let q = manhattan(a, b, &blocked);
        assert!(q.iter().all(|m| !blocked.contains(m)));
        assert!(!q.contains(&(12, 10)) && q.contains(&(14, 11)));
        // Backwards works too.
        assert_eq!(manhattan(b, a, &none).len(), 6);
    }

    #[test]
    fn dust_is_about_one_and_a_half_percent() {
        let n = (0..COLS).flat_map(|x| (0..ROWS).map(move |y| (x, y))).filter(|&(x, y)| is_dust(x, y)).count();
        let pct = n as f32 * 100.0 / (COLS * ROWS) as f32;
        assert!((1.0..2.0).contains(&pct), "{pct}");
    }

    #[test]
    fn portrait_positions_stay_inside_and_above_the_bar() {
        let l = Layout::new(390.0, 844.0);
        for &(gx, gy) in &[(EDGE, EDGE), (COLS - 1 - EDGE, ROWS - BAR_ROWS - EDGE), (50, 20)] {
            let (x, y) = l.star_pos(gx, gy);
            assert!(x >= EDGE && x < l.cols - 2, "{x}");
            assert!(y >= EDGE && y + 3 < l.bar_top(), "{y}");
        }
    }
}
