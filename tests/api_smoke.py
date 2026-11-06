"""Integration tests against a running server, using two independent clients."""
import argparse
import concurrent.futures
import importlib.util
import pathlib
import uuid

spec = importlib.util.spec_from_file_location("relay", pathlib.Path(__file__).parents[1] / "clients" / "relay.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--url", required=True); args = parser.parse_args()
    a, b = module.Relay(args.url), module.Relay(args.url)
    room = "test-" + uuid.uuid4().hex[:10]
    other = room + "-other"
    a.request("/rooms", {"id": room, "title": "接口验收 · 两端协作", "description": "自动检查专用房间"})
    a.request("/rooms", {"id": other, "title": "隔离检查"})
    assert a.history(room)["messages"] == []
    first = a.send(room, "codex-a", "你好，已接手任务。", "status", client_id="first")["message"]
    assert b.history(room, after=0)["messages"][0]["id"] == first["id"]
    reply = b.send(room, "codex-b", "收到，继续联调。", "handoff", "codex-a", first["id"], "reply")["message"]
    assert a.history(room, after=first["id"])["messages"][0]["id"] == reply["id"]
    assert a.send(room, "codex-a", "你好，已接手任务。", "status", client_id="first")["deduplicated"]
    try:
        a.send(room, "codex-a", "另一条内容", "status", client_id="first")
        raise AssertionError("idempotency conflict accepted")
    except RuntimeError as exc:
        assert "409" in str(exc)
    assert a.history(other, after=0)["messages"] == []
    try:
        b.send(other, "codex-b", "跨房间引用", reply_to=first["id"])
        raise AssertionError("cross-room reply accepted")
    except RuntimeError as exc:
        assert "400" in str(exc)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        values = list(executor.map(lambda _: a.send(room, "codex-a", "并发重试", client_id="same-retry"), range(4)))
    assert len({v["message"]["id"] for v in values}) == 1
    for i in range(4):
        a.send(room, "codex-a", f"进展 {i}")
    collected = []; cursor = 0
    while True:
        data = b.history(room, after=cursor, limit=2)
        collected.extend(data["messages"]); cursor = data["next_cursor"]
        if not data["has_more"]:
            break
    assert len(collected) == 7
    assert len({m["id"] for m in collected}) == 7
    assert [m["id"] for m in collected] == sorted(m["id"] for m in collected)
    newest = a.history(room, limit=2)
    older = a.history(room, before=newest["oldest_cursor"], limit=100)
    assert len(older["messages"]) == 5
    assert all(m["id"] < newest["oldest_cursor"] for m in older["messages"])
    assert a.history(room, after=cursor)["messages"] == []
    assert a.request(f"/rooms/{room}/agents")["agents"] == []
    reported = a.status(room, "codex-a", "developer", "working", "Integration test", mode="manual", last_read_id=first["id"])["agent"]
    assert reported["last_read_id"] == first["id"]
    assert reported["task"] == "Integration test"
    observed = b.request(f"/rooms/{room}/agents")
    assert observed["agents"][0]["state"] == "working"
    assert observed["agents"][0]["stale"] is False
    assert observed["server_time"] >= reported["updated_at"]
    changed = a.status(room, "codex-a", "developer", "waiting", "Waiting for the next task", last_read_id=0)["agent"]
    assert changed["last_read_id"] == first["id"]
    assert a.request(f"/rooms/{other}/agents")["agents"] == []
    for payload in [
        {"sender": "codex-a", "role": "owner", "state": "working"},
        {"sender": "codex-a", "role": "developer", "state": "invented"},
        {"sender": "codex-a", "role": "developer", "state": "working", "mode": "invented"},
        {"sender": "codex-a", "role": "developer", "state": "working", "last_read_id": -1},
    ]:
        try:
            a.request(f"/rooms/{room}/agents", payload)
            raise AssertionError("invalid status accepted")
        except RuntimeError as exc:
            assert "400" in str(exc)
    try:
        a.status(other, "codex-a", "developer", "working", last_read_id=first["id"])
        raise AssertionError("cross-room read cursor accepted")
    except RuntimeError as exc:
        assert "400" in str(exc)
    assert a.request("/rooms?q=" + room)["rooms"]
    for path in [f"/rooms/{room}/messages?after=-1", f"/rooms/{room}/messages?after=0&before=9"]:
        try:
            a.request(path)
            raise AssertionError("invalid cursor accepted")
        except RuntimeError as exc:
            assert "400" in str(exc)
    print(f"PASS: two clients, messages, isolation, replies, deduplication, pagination, status reporting+transitions+monotonic cursor+timestamps, input validation. room={room}")


if __name__ == "__main__":
    main()
