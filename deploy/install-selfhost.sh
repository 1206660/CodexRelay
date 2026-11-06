#!/usr/bin/env bash
set -euo pipefail
release_id="${1:?release id required}"
archive="${2:?application archive required}"
case "$release_id" in (*[!a-f0-9]*|'') echo "Invalid release id" >&2; exit 1;; esac
base=/opt/codex-relay
if [ -e "$base" ] && [ ! -f "$base/.managed" ]; then echo "Unrecognized target directory" >&2; exit 1; fi
install -d -m 755 "$base" "$base/releases" "$base/runtime"
touch "$base/.managed"
id codex-relay >/dev/null 2>&1 || useradd --system --home-dir /var/lib/codex-relay --shell /usr/sbin/nologin --user-group codex-relay
install -d -m 700 -o codex-relay -g codex-relay /var/lib/codex-relay
release="$base/releases/$release_id"
install -d -m 755 "$release"
tar --no-same-owner -xzf "$archive" -C "$release"
chmod -R go-w "$release"
install -m 755 "$release/deploy/allow-public-port.sh" "$base/allow-public-port.sh"
if [ -e "$base/current" ] && [ ! -L "$base/current" ]; then echo "Current path is not a release link" >&2; exit 1; fi
ln -sfn "$release" "$base/current"
install -m 644 "$release/deploy/codex-relay.service" /etc/systemd/system/codex-relay.service
install -m 644 "$release/deploy/codex-relay-firewall.service" /etc/systemd/system/codex-relay-firewall.service
config=/etc/nginx/conf.d/codex-relay.conf
if [ -e "$config" ] && ! grep -q 'Managed for Codex Relay' "$config"; then echo "Unrecognized nginx configuration" >&2; exit 1; fi
had_config=0
if [ -f "$config" ]; then cp "$config" "$base/nginx-previous.conf"; had_config=1; fi
install -m 644 "$release/deploy/codex-relay.nginx.conf" "$config"
if ! nginx -t; then
  if [ "$had_config" = 1 ]; then cp "$base/nginx-previous.conf" "$config"; else rm -f "$config"; fi
  exit 1
fi
if [ ! -f /etc/codex-relay.env ]; then
  printf '%s\n' 'HOST=127.0.0.1' 'PORT=8790' 'RELAY_DATA_DIR=/var/lib/codex-relay' 'RELAY_PUBLIC_URL=https://192.227.231.68:9444' 'RELAY_READ_ONLY=1' >/etc/codex-relay.env
  chmod 600 /etc/codex-relay.env
fi
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf '%s\n' '#!/bin/sh' '/usr/sbin/nginx -t && /bin/systemctl reload nginx' >/etc/letsencrypt/renewal-hooks/deploy/codex-relay-nginx-reload
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/codex-relay-nginx-reload
systemctl daemon-reload
systemctl enable --now codex-relay-firewall.service
systemctl enable codex-relay.service
systemctl restart codex-relay.service
systemctl reload nginx
systemctl is-active codex-relay.service
