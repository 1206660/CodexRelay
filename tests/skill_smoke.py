"""Exercise the portable skill's observable join and public task lifecycle."""
import json
import pathlib
import subprocess
import sys
import uuid
import argparse

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--url", required=True); args = parser.parse_args()
    root = pathlib.Path(__file__).parents[1]
    script = root / "skills" / "codex-relay" / "scripts" / "relay.py"
    room = "test-skill-" + uuid.uuid4().hex[:8]
    sender = room + "-developer"
    state = root / ".work" / "skill-check" / (room + ".json")
    def run(*command):
        result = subprocess.run([sys.executable, str(script), "--url", args.url, "--room", room,
                                 "--sender", sender, "--state-file", str(state), *command], capture_output=True, encoding="utf-8")
        if result.returncode:
            raise AssertionError(result.stderr)
        return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    joined = run("join", "--role", "developer", "--intro", "测试程序负责人，验证协作技能")
    assert any(e.get("event") == "joined" for e in joined)
    first_count = len(run("history", "--all")[0]["messages"])
    run("status", "--role", "developer", "--state", "working", "--task", "验证重复加入不覆盖状态", "--mode", "manual")
    repeated = run("join", "--role", "developer")
    assert not any(e.get("event") == "joined" for e in repeated)
    assert len(run("history", "--all")[0]["messages"]) == first_count
    assert run("agents")[0]["agents"][0]["state"] == "working"
    task = run("dispatch", "## 测试任务\n- 验证任务闭环", "--summary", "派发协作技能验收任务", "--to", sender)[0]["message"]
    assert task["kind"] == "task"
    claim = run("claim", "## 接单计划\n我接下该任务，开始验证", "--summary", "程序已接单，开始验证", "--reply-to", str(task["id"]))[0]["message"]
    assert claim["kind"] == "claim" and claim["reply_to"] == task["id"]
    result = run("deliver", "## 测试结果\n验证已通过", "--summary", "协作技能验证通过，提交验收", "--reply-to", str(task["id"]))[0]["message"]
    assert result["kind"] == "result" and result["reply_to"] == task["id"]
    assert result["summary"] == "协作技能验证通过，提交验收"
    synced = run("sync")
    assert any(e.get("event") == "message" and e["message"]["id"] == result["id"] for e in synced)
    assert not any(e.get("event") == "message" for e in run("sync"))
    saved = json.loads(state.read_text(encoding="utf-8"))
    assert saved["room"] == room and saved["sender"] == sender and saved["last_read_id"] == result["id"]
    print(f"PASS: portable skill join+retry, state isolation, preserved work status, public dispatch/claim/delivery, incremental sync. room={room}")

if __name__ == "__main__":
    main()
