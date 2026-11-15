# Manual test environments (web, localhost)

Start: `npm run dev`, then open the links at `http://localhost:5173/`.
`clock=` pins the wall clock (local time) and sky time keeps running from it. Without `freeze`/`scene`/`demo`, the app uses real storage (`localStorage['night-sky:v1']`), so week changes can be tried for real.

## 1. Week change (needs a seeded store)

1. Open `http://localhost:5173/?freeze=1`, DevTools console, paste the seed (last week W46 with 3 done tasks, 1 alive, 1 missed):
```js
const D=(m,d,h=12)=>new Date(2026,m-1,d,h).getTime();
const t=(id,title,deadline,doneAt=null,link=null)=>({id,title,createdAt:deadline-5*864e5,deadline,big:0,x:.2+Math.random()*.6,y:.2+Math.random()*.4,doneAt,link,week:null,steps:[]});
localStorage.setItem('night-sky:v1',JSON.stringify({version:1,weeks:{},lastSeenWeek:'2026-W46',prefs:{reducedMotion:'system'},
 tasks:[t('a','essay',D(11,11),D(11,10)),t('b','lab',D(11,12),D(11,11),'a'),t('c','reading',D(11,13),D(11,12),'b'),t('d','alive project',D(11,20)),t('e','missed quiz',D(11,11))]}));
```
2. Then open one of these (re-seed before each, a run overwrites the store):

| What | URL | Expect |
|---|---|---|
| Monday after a week with done stars | `?clock=2026-11-16T09:00` | the morning plays once the page is visible and focused (if DevTools has focus, click the page): sunrise, meadow with 3 flowers and 1 bud, it holds; Esc or Enter starts the sunset; then only "alive project" is left, counter 0 / 1 |
| Same, week without done stars (delete a, b, c from the seed) | `?clock=2026-11-16T09:00` | the morning still plays (a quiet meadow), week archived |
| Missed 3 weeks (set `lastSeenWeek:'2026-W43'`, move tasks to October) | `?clock=2026-11-16T09:00` | no crash, old weeks recorded |
| Year boundary (`lastSeenWeek:'2026-W53'`, tasks end of Dec) | `?clock=2027-01-04T09:00` | W53 to W01 works |
| Same week reopen | `?clock=2026-11-18T09:00` after seeding W47 | no morning |
| Live Sunday to Monday | `?clock=2026-11-15T23:59:50` and wait ~40 s | morning starts by itself (check runs every 30 s) |
| Morning frame by frame | `?morning=1&at=3000` (change `at`; `&leave=9500&at=14000` for the sunset) | frozen frame; `&at=0&live=1` plays it with working controls |
| Past weeks as constellations | `?weeks=6&t=12` | faint archived shapes at the top |
| Reload while the morning plays | reload during the sunrise or the hold | it plays again (morningDue survives until the sunset starts) |
| Background tab | open the URL in a background tab, wait 10 s, switch to it | nothing plays while hidden; it plays right after you switch |
| Seen once | reload after it finished | no morning, and in the console JSON.parse(localStorage['night-sky:v1']).morningDue is null |
| Name the week | in the hold type `moving day`, Enter | sunset starts, `week 46 · moving day` stays until ~1 s; console: JSON.parse(localStorage['night-sky:v1']).weeks['2026-W46'].name |
| Task from the morning | in the hold type `essay, fri`, Enter | sunset starts; the new star assembles near its end; no name saved |
| Controls | click or Space during the sunrise; Esc during the sunset | jumps to the hold in 0.4 s; the sunset ends in 0.6 s |
| Flower label | `?morning=1&live=1`, hover or tap a flower | `title · wed`; a bud shows its title; it never starts the sunset |
| Name in the night | name the week in the morning, then hover its far constellation | `week 46 · <name> · 3 stars` |
| Away 3 weeks | seed with `lastSeenWeek:'2026-W44'`, open `?clock=2026-11-16T09:00` | the morning says `3 weeks away`; reload before leaving: still `3 weeks away` |

Reset: `localStorage.clear()` on any page.

## 2. Tasks and parser
Bar syntax: `title, deadline / step / step`, `!` at the end = big star. Deadlines: `tomorrow 18:00`, `fri`, `20.11`, `2026-12-01`, `+3d`, `+5h`. Bad input shows "can't read that" / "that's already gone". Keys: `n` focus bar, Enter create, Tab, `z` undo.
- Create, finish (second tap), undo, add/finish steps, drag steps (`?scene=steps`, `&live=1`).
- Reload after creating: tasks stay.
- Corrupt storage: `localStorage.setItem('night-sky:v1','{bad')` and reload: app starts empty, a `:corrupt:` backup key appears.

## 3. First use and help

- Empty storage: desktop says `add your first star — title, deadline`; phone says `add — title, deadline` without clipping.
- After creating the first live star, the bar says `click a star to finish` on desktop or `tap twice to finish` on touch.
- Finish it: the existing undo row shows `undo` and `z`; after it fades, the normal `title, deadline` placeholder returns.
- Enter `/help`: the quiet reference panel opens above the bar. Check desktop and 375 px phone layouts; nothing clips.
- Press Esc, begin typing, or click/tap the sky: help closes and the underlying action still works.

## 4. Scenes (`?scene=...&at=<ms>`)
`finish`, `urgent`, `overlap`, `undo`, `labels&demo=1&hover=hm%20one-pager`, `occlusion`, `expire`, `steps`, `crossfade`. Without `at` some start at 0 and look empty; scrub `at=500…6000`.

## 5. Sky
`?demo=1&freeze=1&t=12&clock=2026-11-13T03:00` (also 07:00, 12:00, 18:30, 22:00): mood by time of day. Moon: `clock=2026-11-09T23:00` (new) vs `2026-11-24T23:00` (full). `seed=N` for other skies. `gl=0` = 2D canvas path.

## 6. Sizes
Resize the window or DevTools device mode: 390x800 (phone), 320x480, 1900x600. Check label clipping at the right edge and the bar.

## 7. Automated
`npm test` (selftests) and `npm run verify` (goldens + perf).
