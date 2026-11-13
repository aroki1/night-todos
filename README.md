# Night Sky

Every task is a star on a squared night sky. Stars lose modules as the deadline nears.

- Desktop: `cargo run --release` (Rune is pinned by git rev; first build is long). Data: `%APPDATA%/night-sky/store.json`.
- Add a star: press `n` or `/`, type `title, deadline` (`fri`, `fri 18:00`, `nov 20`, `+3d`), Enter. `[s]`/`[l]` picks the size.
- Click a star for the panel: edit title/deadline, `[finish]` (or Enter), `[delete]`. Esc closes.
- Tests: `cargo test`. Snapshots: `target/release/night-sky --snap snapshots/x.png --scene half|fresh|constellation|hud [--size 390x844] --at 1.0`.
- Web (needs WebGPU; Git Bash, `wasm32-unknown-unknown`, `wasm-bindgen-cli 0.2.129`, a `python3` on PATH): `RUNE=../rune-src web/build.sh`, then `python web/serve.py dist 8080`.
- Build output goes to `C:/nstarget` (see `.cargo/config.toml`); change it if you like.
