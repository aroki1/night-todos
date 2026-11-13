cd "$(dirname "$0")"
bash all.sh; bash a2.sh; bash b2.sh; bash c.sh
./shoot.sh 18-reduced-create.png "seed=7&reduced=1&script=fz:12;key:n;type:read paper, tmr 18;adv:300;key:Enter;adv:200"
./shoot.sh 29d-create-undo-dissolve.png "seed=7&script=fz:12;key:n;type:read paper, tmr 18;adv:300;key:Enter;adv:2000;key:z;adv:200"
