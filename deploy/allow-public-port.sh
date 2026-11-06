#!/usr/bin/env bash
set -euo pipefail
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 9444 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 9444 -j ACCEPT
fi
# The private proxy's earlier-priority guard also has a final drop rule.
# Add only this public application port; preserve every proxy admission rule.
if command -v nft >/dev/null 2>&1; then
  for attempt in 1 2 3 4 5; do
    if nft list chain inet codex_private_admission input >/dev/null 2>&1; then
      if ! nft list chain inet codex_private_admission input | grep -q 'comment "codex-relay-public"'; then
        printf '%s\n' 'insert rule inet codex_private_admission input tcp dport 9444 accept comment "codex-relay-public"' | nft -f -
      fi
    fi
    if [ "$attempt" != 5 ]; then sleep 1; fi
  done
fi
