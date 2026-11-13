#!/bin/bash
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
DIR="$(pwd -W)"
Q="$2"; case "$Q" in *clock=*) ;; *) Q="clock=2026-11-13T21:00&$Q";; esac
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=${4:-1240},${5:-700} --force-device-scale-factor=${3:-1} --virtual-time-budget=${6:-4000} --screenshot="$DIR/shots/v10/$1" "file:///$DIR/v10.html?$Q" >/dev/null 2>&1
ls -la shots/v10/$1 | awk '{print $5,$9}'
