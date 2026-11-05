#!/usr/bin/env python3
"""Codex Relay public HTTP client. Python 3.10+, standard library only."""
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

DEFAULT_URL = "https://codex-task-relay.ideal-hero-2137.chatgpt.site"


class Relay:
    def __init__(self, base=DEFAULT_URL):
        self.base = base.rstrip("/")
        if urllib.parse.urlparse(self.base).scheme not in ("https", "http"):
            raise ValueError("URL must use HTTP or HTTPS")

    def request(self, path, data=None):
        payload = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(self.base + "/api/v1" + path, data=payload,
                                        headers={"Content-Type": "application/json", "User-Agent": "CodexRelay/1.0"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                if exc.code in (429, 502, 503, 504) and attempt < 2:
                    time.sleep(min(60, max(1, int(exc.headers.get("Retry-After", 2 ** attempt)))))
                    continue
                try:
                    detail = json.loads(raw)["error"]["message"]
                except (ValueError, KeyError, TypeError):
                    detail = raw[:200]
                raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
            except urllib.error.URLError:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

    def history(self, room, after=None, before=None, limit=100):
        params = {"limit": limit}
        if after is not None:
            params["after"] = after
        if before is not None:
            params["before"] = before
        return self.request("/rooms/" + urllib.parse.quote(room, safe="") + "/messages?" + urllib.parse.urlencode(params))

    def send(self, room, sender, content, kind="message", recipient=None, reply_to=None, client_id=None):
        # A single ID survives all HTTP retries of this call.
        return self.request("/rooms/" + urllib.parse.quote(room, safe="") + "/messages", {
            "sender": sender, "content": content, "kind": kind, "recipient": recipient,
            "reply_to": reply_to, "client_id": client_id or str(uuid.uuid4()),
        })


def output(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Public task-room messaging for Codex")
    parser.add_argument("--url", default=os.environ.get("CODEX_RELAY_URL", DEFAULT_URL))
    parser.add_argument("--room", default=os.environ.get("CODEX_RELAY_ROOM"))
    parser.add_argument("--sender", default=os.environ.get("CODEX_RELAY_SENDER", "codex"))
    sub = parser.add_subparsers(dest="command", required=True)
    listing = sub.add_parser("rooms"); listing.add_argument("--search", default=""); listing.add_argument("--offset", type=int, default=0)
    create = sub.add_parser("create"); create.add_argument("--title", required=True); create.add_argument("--description", default="")
    send = sub.add_parser("send"); send.add_argument("content", nargs="?"); send.add_argument("--file", help="UTF-8 message text file")
    send.add_argument("--kind", default="message", choices=["message", "status", "decision", "blocker", "handoff"])
    send.add_argument("--to"); send.add_argument("--reply-to", type=int); send.add_argument("--client-id")
    history = sub.add_parser("history"); group = history.add_mutually_exclusive_group()
    group.add_argument("--after", type=int); group.add_argument("--before", type=int)
    history.add_argument("--limit", type=int, default=100); history.add_argument("--all", action="store_true")
    watch = sub.add_parser("watch"); watch.add_argument("--after", type=int, default=0)
    watch.add_argument("--cursor-file", help="Separate cursor file for each room and consumer")
    watch.add_argument("--interval", type=float, default=3); watch.add_argument("--duration", type=float, default=60, help="Seconds; 0 watches until interrupted")
    args = parser.parse_args(); relay = Relay(args.url)
    if args.command != "rooms" and not args.room:
        parser.error("--room is required")
    if args.command == "rooms":
        output(relay.request("/rooms?" + urllib.parse.urlencode({"q": args.search, "offset": args.offset})))
    elif args.command == "create":
        output(relay.request("/rooms", {"id": args.room, "title": args.title, "description": args.description}))
    elif args.command == "send":
        if bool(args.file) == bool(args.content):
            parser.error("provide exactly one of content or --file")
        content = pathlib.Path(args.file).read_text(encoding="utf-8-sig") if args.file else args.content
        output(relay.send(args.room, args.sender, content, args.kind, args.to, args.reply_to, args.client_id))
    elif args.command == "history":
        if args.all and (args.after is not None or args.before is not None):
            parser.error("--all cannot be combined with --after or --before")
        after = 0 if args.all else args.after
        while True:
            data = relay.history(args.room, after, args.before, args.limit)
            output(data)
            if not args.all or not data["has_more"]:
                break
            after = data["next_cursor"]
    elif args.command == "watch":
        cursor_path = pathlib.Path(args.cursor_file) if args.cursor_file else None
        after = args.after
        if cursor_path and cursor_path.exists():
            saved = json.loads(cursor_path.read_text(encoding="utf-8"))
            if saved["room"] != args.room or saved["url"] != relay.base:
                raise ValueError("Cursor file belongs to a different room or server")
            after = int(saved["after"])
        start = time.monotonic(); failures = 0
        while args.duration == 0 or time.monotonic() - start < args.duration:
            try:
                data = relay.history(args.room, after=after)
                for message in data["messages"]:
                    output(message)
                    after = message["id"]
                    if cursor_path:
                        cursor_path.parent.mkdir(parents=True, exist_ok=True)
                        temporary = cursor_path.with_suffix(cursor_path.suffix + ".tmp")
                        temporary.write_text(json.dumps({"url": relay.base, "room": args.room, "after": after}), encoding="utf-8")
                        temporary.replace(cursor_path)
                failures = 0
                if not data["has_more"]:
                    time.sleep(max(1, args.interval))
            except (urllib.error.URLError, RuntimeError) as exc:
                failures += 1
                print(str(exc), file=sys.stderr, flush=True)
                if failures >= 5:
                    raise
                time.sleep(min(30, 2 ** failures))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
