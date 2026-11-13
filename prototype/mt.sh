cd "$(dirname "$0")"
SP="C:/Users/Yedig/AppData/Local/Temp/claude/19b4cd2901d0a3cb/e8157456-d7dc-41b6-98b0-9b8a225e6878/scratchpad"
out=$1; shift; x=$1; y=$2; w=$3; h=$4; s=$5; c=$6; shift 6
powershell -NoProfile -File montage.ps1 "$SP/$out.png" $x $y $w $h $s $c "$(IFS=,; echo "$*")"
