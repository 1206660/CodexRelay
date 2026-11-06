#!/usr/bin/env python3
"""Compatibility entry point; the portable skill owns the client implementation."""
import importlib.util
import pathlib
import sys

_source = pathlib.Path(__file__).resolve().parents[1] / "skills" / "codex-relay" / "scripts" / "relay.py"
_spec = importlib.util.spec_from_file_location("codex_relay_client", _source)
_client = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_client)
Relay = _client.Relay
DEFAULT_URL = _client.DEFAULT_URL

if __name__ == "__main__":
    try:
        _client.main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
