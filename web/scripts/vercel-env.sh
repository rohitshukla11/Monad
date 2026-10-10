#!/bin/sh
# Copy this machine's configuration to the linked Vercel project (Production): public settings and
# API keys from web/.env.local, signing keys and the C2PA chain from ../.secrets. Values are read from
# the files and piped to the Vercel CLI; none is printed.
#
#   cd web && npx vercel login && npx vercel link     # once, in your own terminal
#   sh scripts/vercel-env.sh https://www.likeness.site
#
# Then redeploy without the build cache (NEXT_PUBLIC_* values are compiled into the page).
set -eu
URL="${1:?usage: sh scripts/vercel-env.sh https://your-domain}"
HOST="$(printf '%s' "$URL" | sed -E 's#^https?://##; s#/.*$##')"
# Passkeys bind to the RP ID: the parent domain covers both example.com and www.example.com.
RP_ID="$(printf '%s' "$HOST" | sed -E 's#^www\.##')"
VERCEL="npx --yes vercel@63.1.2"
[ -f .env.local ] || { echo "run from web/ (no .env.local here)"; exit 1; }
[ -d .vercel ] || { echo "not linked: run 'npx vercel link' in web/ first"; exit 1; }

local_value() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- || true; }

set_value() { # name value [sensitive]
  if [ -z "$2" ]; then echo "skip $1 (no value)"; return; fi
  printf '%s' "$2" | $VERCEL env add "$1" production --force ${3:+--sensitive} >/dev/null 2>&1 && echo "set  $1" || echo "FAIL $1"
}
set_file() { # name file
  if [ ! -s "$2" ]; then echo "skip $1 (no $2)"; return; fi
  $VERCEL env add "$1" production --force --sensitive < "$2" >/dev/null 2>&1 && echo "set  $1" || echo "FAIL $1"
}

# Public (compiled into the page)
set_value NEXT_PUBLIC_RP_ID "$RP_ID"
set_value NEXT_PUBLIC_APP_URL "https://$HOST"
set_value NEXT_PUBLIC_DYNAMIC_ENV_ID "$(local_value NEXT_PUBLIC_DYNAMIC_ENV_ID)"
set_value NEXT_PUBLIC_MONAD_RPC_URL "$(local_value NEXT_PUBLIC_MONAD_RPC_URL)"

# Storage on Vercel: private Blob (connect a Blob store to the project for BLOB_READ_WRITE_TOKEN)
set_value STORE_DRIVER blob

# Server signing keys and the C2PA chain, from ../.secrets
set_file ATTESTER_PRIVATE_KEY ../.secrets/attester.key
set_file RENDER_AGENT_PRIVATE_KEY ../.secrets/render-agent.key
set_file DRIP_PRIVATE_KEY ../.secrets/drip.key
set_file C2PA_CERT_PEM ../.secrets/c2pa/signer.pem
set_file C2PA_KEY_PEM ../.secrets/c2pa/signer.key

# Integrations and settings, from .env.local
for name in DIDIT_API_KEY GEMINI_API_KEY MONAD_RPC_URL DYNAMIC_API_KEY DYNAMIC_WEBHOOK_SECRET DIDIT_WEBHOOK_SECRET; do
  set_value "$name" "$(local_value "$name")" sensitive
done
for name in VERIFICATION_LEVEL DIDIT_WORKFLOW_ID_FREE DIDIT_WORKFLOW_ID_FULL DIDIT_CAPTURE_MATCH_THRESHOLD \
  DRIP_AMOUNT_MON DRIP_PER_IP_PER_HOUR DRIP_PER_HOUR GEMINI_IMAGE_MODEL GEMINI_IMAGE_SIZE GEMINI_FILTER_MODEL ENVIO_GRAPHQL_URL; do
  set_value "$name" "$(local_value "$name")"
done

echo "done. Redeploy without the build cache, then open https://$HOST/status"
