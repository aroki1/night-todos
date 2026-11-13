//! Motion helpers: twinkle and flicker loops, build-in order, the square burst ring.
//! All motion rides on Rune's own tracks (loops, sequences, presence), so an idle sky
//! draws nothing between loop ticks and reduced motion is honoured by the framework.

use crate::grid::{self, hash3, unit};
use crate::model::Size;
use rune::{Beat, Cycle, Sequence, Spring, SpringPair, Transition};

const TWINKLE: &[(f32, f32)] = &[(0.0, 0.75), (0.5, 1.0), (1.0, 0.75)];
const FLICKER_A: &[(f32, f32)] = &[(0.0, 1.0), (0.22, 0.4), (0.41, 0.95), (0.63, 0.35), (0.8, 0.8), (1.0, 1.0)];
const FLICKER_B: &[(f32, f32)] = &[(0.0, 0.5), (0.15, 1.0), (0.38, 0.38), (0.6, 0.9), (0.85, 0.45), (1.0, 0.5)];
const DUST: &[(f32, f32)] = &[(0.0, 0.25), (0.5, 0.6), (1.0, 0.25)];
const SHIMMER: &[(f32, f32)] = &[(0.0, 0.45), (0.15, 0.6), (0.3, 0.45), (1.0, 0.45)];

/// Slow 0.75..1.0 breathing, 2 to 3 s, with a per-module phase.
pub fn twinkle(id: u64, dx: i32, dy: i32) -> Cycle {
    let h = hash3(id, dx as i64, dy as i64);
    let period = [2.0, 2.5, 3.0][(h % 3) as usize];
    Cycle { period, phase: unit(h >> 8), stops: TWINKLE, still: 0.9, fps: 30.0 }
}

/// Last-gasp flicker, 6 to 9 Hz with irregular phases, 0.35..1.0.
pub fn flicker(id: u64, dx: i32, dy: i32) -> Cycle {
    let h = hash3(id ^ 0xF11C, dx as i64, dy as i64);
    let period = [1.0 / 9.0, 1.0 / 7.5, 1.0 / 6.0][(h % 3) as usize];
    let stops = if (h >> 4) & 1 == 0 { FLICKER_A } else { FLICKER_B };
    Cycle { period, phase: unit(h >> 8), stops, still: 0.7, fps: 30.0 }
}

pub fn dust(x: i32, y: i32) -> Cycle {
    let h = hash3(0xD057 ^ 1, x as i64, y as i64);
    Cycle { period: 4.0, phase: unit(h >> 8), stops: DUST, still: 0.4, fps: 30.0 }
}

/// Travelling shimmer along a path: `t` is the module's position along it, 0..1.
pub fn shimmer(t: f32) -> Cycle {
    Cycle { period: 3.0, phase: t.fract(), stops: SHIMMER, still: 0.45, fps: 30.0 }
}

/// Fade timing for modules dropping out and coming back (about 300 ms).
pub fn fade(exit_secs: f32) -> Transition {
    Transition::opacity().springs(SpringPair::new(Spring::new(0.3, 0.0), Spring::new(exit_secs, 0.0)))
}

/// Centre-out order of a star's modules: index of each offset in `shape(size)` order.
pub fn centre_out_rank(size: Size, dx: i32, dy: i32) -> usize {
    let mut v = grid::shape(size);
    v.sort_by_key(|&(x, y)| (x.abs() + y.abs(), x, y));
    v.iter().position(|&m| m == (dx, dy)).unwrap_or(0)
}

/// Modules at Chebyshev distance `r` from the origin.
pub fn ring(r: i32) -> Vec<(i32, i32)> {
    let mut v = Vec::new();
    for d in -r..=r {
        v.extend([(d, -r), (d, r)]);
        if d.abs() != r {
            v.extend([(-r, d), (r, d)]);
        }
    }
    v
}

const PULSE: &[Beat] = &[Beat::new(0.0).opacity(0.0), Beat::new(0.02).opacity(1.0), Beat::new(0.09).opacity(1.0), Beat::new(0.13).opacity(0.0)];

/// One ring of the burst: it lights up when the ripple reaches radius `r` and is gone again
/// a moment later. The ripple grows from 1 to 7 over about 600 ms.
pub fn burst_pulse(r: i32) -> Sequence {
    Sequence::new(PULSE).delay((r - 1) as f64 * 0.1)
}

/// Brightness of ring `r`: fades from 1 to 0 as the ripple widens.
pub fn burst_alpha(r: i32) -> f32 {
    1.0 - (r - 1) as f32 / 7.0
}

pub const BURST_MAX: i32 = 7;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rings_are_squares_of_8r_modules() {
        for r in 1..=7 {
            let v = ring(r);
            assert_eq!(v.len() as i32, 8 * r);
            assert!(v.iter().all(|&(x, y)| x.abs().max(y.abs()) == r));
            let uniq: std::collections::HashSet<_> = v.iter().collect();
            assert_eq!(uniq.len(), v.len());
        }
    }

    #[test]
    fn build_in_starts_at_the_centre() {
        assert_eq!(centre_out_rank(Size::Large, 0, 0), 0);
        let worst = grid::shape(Size::Large).into_iter().map(|(x, y)| centre_out_rank(Size::Large, x, y)).max();
        assert_eq!(worst, Some(16));
    }

    #[test]
    fn flicker_is_between_6_and_9_hz() {
        for i in 0..20 {
            let hz = 1.0 / flicker(i, 1, 0).period;
            assert!((6.0..=9.0).contains(&hz), "{hz}");
        }
    }
}
