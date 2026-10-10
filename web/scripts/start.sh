#!/bin/sh
# Container entry point (see Dockerfile): prepare the volume, then run the server on $PORT.
set -eu
mkdir -p "$STORE_DIR" "$DB_DIR" "$RENDERS_DIR" "$FACE_MODELS_DIR"

# The free level's local face matcher needs its models on the volume (about 260 MB, fetched once and
# checked by sha256). If the download fails, /status shows the matcher as not configured.
if [ "${VERIFICATION_LEVEL:-free}" = "free" ]; then
  sh scripts/face-models.sh || echo "face models not downloaded: the free-level photo check is off" >&2
fi

port="${PORT:-3000}"

# A new volume has no history cache. Each request scans at most INDEX_SCAN_BUDGET_MS of chain history,
# so pages never hang; this loop keeps asking in the background until a request comes back fast,
# meaning the history has caught up with the chain.
(
  sleep 10
  i=0
  while [ "$i" -lt 150 ]; do
    t="$(curl -s -o /dev/null -w '%{time_total}' --max-time 90 "http://127.0.0.1:$port/api/creators" || echo 99)"
    case "$t" in 0.* | 1.* | 2.*) echo "history caught up"; break ;; esac
    i=$((i + 1))
  done
) &

exec node_modules/.bin/next start -H 0.0.0.0 -p "$port"
