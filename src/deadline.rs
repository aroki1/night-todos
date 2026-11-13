//! Deadline parser: `fri`, `fri 18:00`, `nov 20`, `20.11`, `2026-11-20`, `+3d`, `tomorrow 6pm`...

use crate::model::local_at;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveTime, Weekday};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeadlineError {
    /// Could not make sense of the text.
    Unreadable,
    /// Parsed fine, but the moment is not in the future.
    Past,
}

impl DeadlineError {
    pub fn message(self) -> &'static str {
        match self {
            DeadlineError::Unreadable => "can't read that deadline \u{2014} try \"fri\", \"fri 18:00\", \"nov 20\", \"+3d\"",
            DeadlineError::Past => "that's already gone",
        }
    }
}

type R<T> = Result<T, DeadlineError>;

const WEEKDAYS: [(&str, Weekday); 7] = [
    ("mon", Weekday::Mon),
    ("tue", Weekday::Tue),
    ("wed", Weekday::Wed),
    ("thu", Weekday::Thu),
    ("fri", Weekday::Fri),
    ("sat", Weekday::Sat),
    ("sun", Weekday::Sun),
];
const MONTHS: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

fn weekday(tok: &str) -> Option<Weekday> {
    if tok.len() < 3 {
        return None;
    }
    // Accept the 3-letter form and any prefix of the full name ("tues", "thurs", "friday").
    const FULL: [&str; 7] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    WEEKDAYS.iter().zip(FULL).find(|((short, _), full)| tok.starts_with(short) && full.starts_with(tok)).map(|((_, d), _)| *d)
}

fn month(tok: &str) -> Option<u32> {
    if tok.len() < 3 {
        return None;
    }
    const FULL: [&str; 12] =
        ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    MONTHS.iter().zip(FULL).position(|(short, full)| tok.starts_with(short) && (full.starts_with(tok) || tok == "sept")).map(|i| i as u32 + 1)
}

/// `18:00`, `18`, `6pm`, `6:30pm`. Returns None if the token is not a time.
fn time_token(tok: &str) -> Option<NaiveTime> {
    let (body, pm) = if let Some(b) = tok.strip_suffix("pm") {
        (b, Some(true))
    } else if let Some(b) = tok.strip_suffix("am") {
        (b, Some(false))
    } else {
        (tok, None)
    };
    let (h, m) = match body.split_once(':') {
        Some((h, m)) => (h, m),
        None => (body, "0"),
    };
    if h.is_empty() || !h.bytes().all(|b| b.is_ascii_digit()) || m.is_empty() || !m.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if h.len() > 2 || m.len() > 2 {
        return None;
    }
    let (mut h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    match pm {
        Some(is_pm) => {
            if !(1..=12).contains(&h) {
                return None;
            }
            h = (h % 12) + if is_pm { 12 } else { 0 };
        }
        None => {}
    }
    NaiveTime::from_hms_opt(h, m, 0)
}

fn end_of_day() -> NaiveTime {
    NaiveTime::from_hms_opt(23, 59, 0).unwrap_or(NaiveTime::MIN)
}

fn relative(tok: &str, now: DateTime<Local>) -> Option<R<DateTime<Local>>> {
    let body = tok.strip_prefix('+')?;
    let unit = body.chars().last()?;
    let n: i64 = body[..body.len() - unit.len_utf8()].parse().ok()?;
    let d = match unit {
        'd' => Duration::days(n),
        'h' => Duration::hours(n),
        'm' => Duration::minutes(n),
        _ => return None,
    };
    if n <= 0 {
        return Some(Err(DeadlineError::Past));
    }
    Some(Ok(now + d))
}

/// A date given as one or two tokens. Returns (date resolver, tokens used).
enum Day {
    /// Exact date (ISO form).
    Exact(NaiveDate),
    /// Month and day: rolls over to next year when already past.
    MonthDay(u32, u32),
    /// A weekday: the next such day.
    Weekday(Weekday),
    Today,
    Tomorrow,
}

fn day_form(toks: &[&str]) -> Option<(Day, usize)> {
    let first = *toks.first()?;
    match first {
        "today" | "tonight" => return Some((Day::Today, 1)),
        "tomorrow" | "tmr" => return Some((Day::Tomorrow, 1)),
        _ => {}
    }
    if let Some(w) = weekday(first) {
        return Some((Day::Weekday(w), 1));
    }
    // 2026-11-20
    if let Some((y, rest)) = first.split_once('-') {
        let (m, d) = rest.split_once('-')?;
        let (y, m, d): (i32, u32, u32) = (y.parse().ok()?, m.parse().ok()?, d.parse().ok()?);
        return Some((Day::Exact(NaiveDate::from_ymd_opt(y, m, d)?), 1));
    }
    // 20.11
    if let Some((d, m)) = first.split_once('.') {
        let (d, m): (u32, u32) = (d.parse().ok()?, m.parse().ok()?);
        NaiveDate::from_ymd_opt(2000, m, d.min(29).max(1))?; // validates the month; day checked at resolve
        return Some((Day::MonthDay(m, d), 1));
    }
    // nov 20 / 20 nov
    if let Some(m) = month(first) {
        let d: u32 = toks.get(1)?.parse().ok()?;
        return Some((Day::MonthDay(m, d), 2));
    }
    if first.bytes().all(|b| b.is_ascii_digit()) {
        let d: u32 = first.parse().ok()?;
        let m = month(toks.get(1)?)?;
        return Some((Day::MonthDay(m, d), 2));
    }
    None
}

pub fn parse_deadline(input: &str, now: DateTime<Local>) -> Result<DateTime<Local>, DeadlineError> {
    let lower = input.trim().to_lowercase();
    let toks: Vec<&str> = lower.split_whitespace().collect();
    if toks.is_empty() {
        return Err(DeadlineError::Unreadable);
    }
    if toks.len() == 1 {
        if let Some(r) = relative(toks[0], now) {
            return r;
        }
    }
    let (day, used) = day_form(&toks).ok_or(DeadlineError::Unreadable)?;
    let time = match &toks[used..] {
        [] => None,
        [t] => Some(time_token(t).ok_or(DeadlineError::Unreadable)?),
        _ => return Err(DeadlineError::Unreadable),
    };
    let today = now.date_naive();
    let at = time.unwrap_or_else(end_of_day);
    let resolve = |date: NaiveDate| local_at(date, at).ok_or(DeadlineError::Unreadable);
    let date = match day {
        Day::Today => today,
        Day::Tomorrow => today + Duration::days(1),
        Day::Exact(d) => d,
        Day::Weekday(w) => {
            let ahead = (7 + w.num_days_from_monday() as i64 - today.weekday().num_days_from_monday() as i64) % 7;
            if ahead == 0 {
                // Today is that day: today if still ahead, otherwise next week.
                if resolve(today)? > now { today } else { today + Duration::days(7) }
            } else {
                today + Duration::days(ahead)
            }
        }
        Day::MonthDay(m, d) => {
            let this_year = NaiveDate::from_ymd_opt(today.year(), m, d).ok_or(DeadlineError::Unreadable);
            match this_year {
                Ok(date) if date >= today => date,
                _ => NaiveDate::from_ymd_opt(today.year() + 1, m, d).ok_or(DeadlineError::Unreadable)?,
            }
        }
    };
    let out = resolve(date)?;
    if out <= now { Err(DeadlineError::Past) } else { Ok(out) }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Wed 2026-11-18 15:30 local.
    fn now() -> DateTime<Local> {
        local_at(NaiveDate::from_ymd_opt(2026, 11, 18).unwrap(), NaiveTime::from_hms_opt(15, 30, 0).unwrap()).unwrap()
    }
    fn at(y: i32, m: u32, d: u32, h: u32, mi: u32) -> DateTime<Local> {
        local_at(NaiveDate::from_ymd_opt(y, m, d).unwrap(), NaiveTime::from_hms_opt(h, mi, 0).unwrap()).unwrap()
    }
    fn p(s: &str) -> R<DateTime<Local>> {
        parse_deadline(s, now())
    }

    #[test]
    fn today_tonight_tomorrow() {
        assert_eq!(p("today"), Ok(at(2026, 11, 18, 23, 59)));
        assert_eq!(p("tonight"), Ok(at(2026, 11, 18, 23, 59)));
        assert_eq!(p("tomorrow"), Ok(at(2026, 11, 19, 23, 59)));
        assert_eq!(p("TMR"), Ok(at(2026, 11, 19, 23, 59)));
        assert_eq!(p("  tomorrow 9  "), Ok(at(2026, 11, 19, 9, 0)));
    }

    #[test]
    fn weekdays() {
        assert_eq!(p("fri"), Ok(at(2026, 11, 20, 23, 59)));
        assert_eq!(p("Friday"), Ok(at(2026, 11, 20, 23, 59)));
        assert_eq!(p("fri 18:00"), Ok(at(2026, 11, 20, 18, 0)));
        assert_eq!(p("mon"), Ok(at(2026, 11, 23, 23, 59)));
        // Today is Wednesday.
        assert_eq!(p("wed"), Ok(at(2026, 11, 18, 23, 59)));
        assert_eq!(p("wed 18:00"), Ok(at(2026, 11, 18, 18, 0)));
        assert_eq!(p("wed 9am"), Ok(at(2026, 11, 25, 9, 0)), "time already passed today means next week");
    }

    #[test]
    fn dates() {
        assert_eq!(p("nov 20"), Ok(at(2026, 11, 20, 23, 59)));
        assert_eq!(p("20 nov"), Ok(at(2026, 11, 20, 23, 59)));
        assert_eq!(p("20.11"), Ok(at(2026, 11, 20, 23, 59)));
        assert_eq!(p("2026-11-20"), Ok(at(2026, 11, 20, 23, 59)));
        assert_eq!(p("november 20 18:00"), Ok(at(2026, 11, 20, 18, 0)));
        assert_eq!(p("nov 18"), Ok(at(2026, 11, 18, 23, 59)), "today, no time");
        // Already past this year: next year. ISO form is exact.
        assert_eq!(p("nov 2"), Ok(at(2027, 11, 2, 23, 59)));
        assert_eq!(p("2 nov"), Ok(at(2027, 11, 2, 23, 59)));
        assert_eq!(p("2026-11-02"), Err(DeadlineError::Past));
    }

    #[test]
    fn relative() {
        assert_eq!(p("+3d"), Ok(now() + Duration::days(3)));
        assert_eq!(p("+5h"), Ok(now() + Duration::hours(5)));
        assert_eq!(p("+90m"), Ok(now() + Duration::minutes(90)));
    }

    #[test]
    fn times() {
        assert_eq!(p("fri 18"), Ok(at(2026, 11, 20, 18, 0)));
        assert_eq!(p("fri 6pm"), Ok(at(2026, 11, 20, 18, 0)));
        assert_eq!(p("fri 6:30pm"), Ok(at(2026, 11, 20, 18, 30)));
        assert_eq!(p("fri 12am"), Ok(at(2026, 11, 20, 0, 0)));
        assert_eq!(p("fri 12pm"), Ok(at(2026, 11, 20, 12, 0)));
        assert_eq!(p("nov 20 7:05"), Ok(at(2026, 11, 20, 7, 5)));
    }

    #[test]
    fn errors() {
        assert_eq!(p(""), Err(DeadlineError::Unreadable));
        assert_eq!(p("soon"), Err(DeadlineError::Unreadable));
        assert_eq!(p("fri 25:00"), Err(DeadlineError::Unreadable));
        assert_eq!(p("fri 13pm"), Err(DeadlineError::Unreadable));
        assert_eq!(p("nov 31"), Err(DeadlineError::Unreadable));
        assert_eq!(p("18"), Err(DeadlineError::Unreadable));
        assert_eq!(p("fri 18:00 now"), Err(DeadlineError::Unreadable));
        assert_eq!(p("today 9"), Err(DeadlineError::Past));
        assert_eq!(p("+0m"), Err(DeadlineError::Past));
        assert_eq!(p("+3x"), Err(DeadlineError::Unreadable));
    }
}
