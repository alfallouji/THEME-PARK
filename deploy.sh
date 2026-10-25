#!/usr/bin/env bash
#
# Build WonderPark Tycoon locally and ship the bundle to the web server.
#
# Run this on your WORKSTATION, not on the server. The target instance is
# Amazon Linux 2 (glibc 2.26), which cannot run the Node 20+ that Vite 8
# requires — official Node builds need glibc 2.28+. Building here and copying
# the result sidesteps that entirely: the server only ever serves static files.
#
# Requires locally: node 20.19+/22.12+, npm, ssh, scp.
# Requires on the server: nothing. No Node, no npm, no build tools.
#
# Configure by copying deploy/deploy.env.example to deploy/deploy.env and
# editing it, or by setting the same variables in the environment:
#
#   ./deploy.sh                 # build and ship
#   ./deploy.sh --no-build      # ship whatever is already in dist/
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_DIR/deploy/deploy.env"

die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

# shellcheck source=/dev/null
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

PARK_USER="${PARK_USER:-ec2-user}"
PARK_HOST="${PARK_HOST:-}"
PARK_REMOTE="${PARK_REMOTE:-}"
PARK_KEY="${PARK_KEY:-}"
PARK_URL="${PARK_URL:-}"
BUILD=1
[ "${1:-}" = "--no-build" ] && BUILD=0

# ---------------------------------------------------------------- checks ---
[ -n "$PARK_HOST" ]   || die "PARK_HOST is not set. Copy deploy/deploy.env.example to deploy/deploy.env."
[ -n "$PARK_REMOTE" ] || die "PARK_REMOTE is not set (the directory Apache serves the game from)."

# The publish step clears \$PARK_REMOTE/assets, so refuse a path shared with
# anything else.
case "$PARK_REMOTE" in
  ""|"/"|/var/www|/var/www/html|/data/var/www/html)
    die "PARK_REMOTE='$PARK_REMOTE' is a shared or root path. Use a dedicated subdirectory." ;;
  /*) ;;
  *) die "PARK_REMOTE must be an absolute path (got '$PARK_REMOTE')." ;;
esac

SSH_OPTS=()
[ -n "$PARK_KEY" ] && SSH_OPTS=(-i "$PARK_KEY")
TARGET="$PARK_USER@$PARK_HOST"

# ----------------------------------------------------------------- build ---
if [ "$BUILD" -eq 1 ]; then
  command -v node >/dev/null || die "node not found."
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old — Vite 8 needs 20.19+ or 22.12+."

  step "Building with Node $(node -v)"
  (cd "$REPO_DIR" && npm ci && npm run build)
fi
[ -f "$REPO_DIR/dist/index.html" ] || die "no dist/index.html — build first (drop --no-build)."

# ------------------------------------------------------------------ ship ---
STAGING="/tmp/park-$(date +%Y%m%d-%H%M%S)-$$"

step "Copying bundle to $TARGET:$STAGING"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p '$STAGING'"
scp "${SSH_OPTS[@]}" -q -r "$REPO_DIR"/dist/* "$TARGET:$STAGING/"

step "Installing into $PARK_REMOTE"
# Quoted heredoc: this runs verbatim on the server, nothing expands locally,
# so the paths are injected deliberately via the two assignments below.
ssh "${SSH_OPTS[@]}" "$TARGET" bash -s <<REMOTE
set -euo pipefail
remote='$PARK_REMOTE'
staging='$STAGING'

sudo mkdir -p "\$remote"
# Old content-hashed bundles would otherwise accumulate forever. Only the
# assets directory this app owns is cleared; anything else is left alone.
sudo rm -rf "\${remote:?}/assets"
# cp (unlike mv) lets new files inherit the destination's SELinux label.
sudo cp -r "\$staging/." "\$remote/"
if command -v restorecon >/dev/null 2>&1; then sudo restorecon -R "\$remote"; fi
rm -rf "\$staging"
echo "installed \$(find "\$remote" -type f | wc -l) files"
REMOTE

# No httpd reload: static files are read per-request. A reload is only needed
# when deploy/park.conf itself changes, which this script does not touch.

# ---------------------------------------------------------------- verify ---
if [ -n "$PARK_URL" ]; then
  step "Verifying $PARK_URL"
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$PARK_URL" || true)"
  if [ "$code" = "200" ]; then
    echo "200 OK — $PARK_URL"
  else
    warn "got '${code:-no response}'. Check the Alias/vhost for $PARK_REMOTE and sudo tail /var/log/httpd/error_log"
  fi
else
  step "Done"
  echo "Set PARK_URL in deploy/deploy.env to have the script verify the result."
fi
