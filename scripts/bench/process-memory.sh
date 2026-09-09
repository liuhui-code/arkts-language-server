#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf '%s\n' 'usage: process-memory.sh PID' >&2
  exit 2
fi

pid=$1
case "$pid" in
  ''|*[!0-9]*|0)
    printf '%s\n' 'PID must be a positive integer' >&2
    exit 2
    ;;
esac

proc_root=${ARKTS_PROC_ROOT:-/proc}
proc_root=${proc_root%/}
status_path="$proc_root/$pid/status"
smaps_path="$proc_root/$pid/smaps_rollup"

if [ ! -f "$status_path" ]; then
  printf 'process status is unavailable: %s\n' "$status_path" >&2
  exit 3
fi
if [ ! -f "$smaps_path" ]; then
  printf 'process smaps_rollup is unavailable: %s\n' "$smaps_path" >&2
  exit 3
fi

if ! rss_kib=$(awk '
  /^VmRSS:[[:space:]]*[0-9]+[[:space:]]+kB[[:space:]]*$/ { count += 1; value = $2 }
  END { if (count != 1) exit 1; print value }
' "$status_path"); then
  printf '%s\n' 'process status omitted one VmRSS value in kB' >&2
  exit 4
fi

if ! pss_kib=$(awk '
  /^Pss:[[:space:]]*[0-9]+[[:space:]]+kB[[:space:]]*$/ { count += 1; value = $2 }
  END { if (count != 1) exit 1; print value }
' "$smaps_path"); then
  printf '%s\n' 'process smaps_rollup omitted one Pss value in kB' >&2
  exit 4
fi

rss_bytes=$((rss_kib * 1024))
pss_bytes=$((pss_kib * 1024))
printf '{"pid":%s,"rssBytes":%s,"pssBytes":%s}\n' "$pid" "$rss_bytes" "$pss_bytes"
