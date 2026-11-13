#!/bin/bash
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; DIR="$(pwd -W)"
Q="$1"; case "$Q" in *clock=*) ;; *) Q="clock=2026-11-13T21:00&$Q";; esac
"$EDGE" --headless=new --disable-gpu --virtual-time-budget=${2:-4000} --dump-dom "file:///$DIR/v10.html?$Q" 2>/dev/null | head -c 6000 | grep -o '<html[^>]*>' | sed 's/&quot;/"/g'
