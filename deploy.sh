#!/usr/bin/env bash
#
# Build WonderPark Tycoon and publish it to the local Apache docroot.
#
# Run this ON the EC2 instance, as ec2-user, from a clone of this repo:
#
#   ./deploy.sh                      # pull, build, publish, reload httpd
#   ./deploy.sh --no-pull            # publish the working tree as-is
#   DOCROOT=/var/www/html/foo ./deploy.sh
#
# Do NOT run the whole script as root: npm would build as root and leave
# root-owned files in the clone. The handful of privileged steps use sudo
# individually.

set -euo pipefail

DOCROOT="${DOCROOT:-/var/www/html/park}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_SRC="$REPO_DIR/deploy/park.conf"
CONF_DEST="/etc/httpd/conf.d/park.conf"
PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0

die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------- checks ---
# The publish step clears $DOCROOT/assets, so refuse to point at a directory
# that is shared with anything else.
case "$DOCROOT" in
  ""|"/"|/var/www|/var/www/html)
    die "DOCROOT='$DOCROOT' is a shared or root path. Use a dedicated subdirectory." ;;
  /*) ;;
  *) die "DOCROOT must be an absolute path (got '$DOCROOT')." ;;
esac

[ -f "$CONF_SRC" ] || die "missing $CONF_SRC — run this from inside the repo clone."

command -v node >/dev/null \
  || die "node not found. Install it (sudo dnf install -y nodejs22) or use nvm."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] \
  || die "Node $(node -v) is too old — Vite 8 needs Node 20.19+ or 22.12+."

systemctl is-active --quiet httpd || warn "httpd is not running (systemctl status httpd)."

# park.conf uses directives from these three modules. Apache refuses to start on
# an unknown directive, so check before installing rather than after.
step "Checking Apache modules"
missing=""
for m in deflate_module expires_module headers_module; do
  sudo httpd -M 2>/dev/null | grep -q "$m" || missing="$missing ${m%_module}"
done
[ -z "$missing" ] \
  && echo "deflate, expires, headers: present" \
  || die "httpd is missing mod:$missing — enable them in /etc/httpd/conf.modules.d/ and retry."

# ---------------------------------------------------------------- build ----
if [ "$PULL" -eq 1 ]; then
  step "Pulling latest"
  git -C "$REPO_DIR" pull --ff-only
fi

step "Installing dependencies"
# Playwright is a devDependency worth a few hundred MB and is only used by the
# smoke/soak scripts; the build needs nothing but three and vite.
npm ci --omit=dev

step "Building"
npm run build
[ -f "$REPO_DIR/dist/index.html" ] || die "build produced no dist/index.html"

# -------------------------------------------------------------- publish ----
step "Publishing to $DOCROOT"
sudo mkdir -p "$DOCROOT"
# Old hashed bundles would otherwise accumulate forever. Only the assets
# directory we own is cleared; anything else under $DOCROOT is left alone.
sudo rm -rf "${DOCROOT:?}/assets"
# cp (unlike mv) lets new files inherit the destination's SELinux label;
# restorecon is belt-and-braces for anything that slipped through.
sudo cp -r "$REPO_DIR/dist/." "$DOCROOT/"
if command -v restorecon >/dev/null; then sudo restorecon -R "$DOCROOT"; fi

step "Installing Apache config"
tmp_conf="$(mktemp)"
trap 'rm -f "$tmp_conf"' EXIT
sed "s#/var/www/html/park#$DOCROOT#g" "$CONF_SRC" > "$tmp_conf"
if sudo cmp -s "$tmp_conf" "$CONF_DEST" 2>/dev/null; then
  echo "unchanged — no reload needed"
else
  sudo cp "$tmp_conf" "$CONF_DEST"
  sudo chmod 644 "$CONF_DEST"
  sudo apachectl configtest
  sudo systemctl reload httpd
  echo "installed and reloaded"
fi

# --------------------------------------------------------------- verify ----
url_path="/${DOCROOT#/var/www/html/}"
step "Verifying"
code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://localhost${url_path}/" || true)"
if [ "$code" = "200" ]; then
  echo "http://localhost${url_path}/ -> 200 OK"
  echo
  echo "Live at: http://$(curl -fsS --max-time 2 ifconfig.me || echo '<public-ip>')${url_path}/"
else
  warn "local request returned '${code:-no response}' — check: sudo tail /var/log/httpd/error_log"
fi
