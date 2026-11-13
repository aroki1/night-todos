cd "$(dirname "$0")"
B="seed=7&t=12&script=fz:12;key:n;type:read paper, tmr 18;adv:500;key:Enter"
for ms in 120 300 480 600 700 800 900 1000 1200 2400; do ./shoot.sh c-$ms.png "$B;adv:$ms"; done
