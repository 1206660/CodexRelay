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
import hashlib
import re

DEFAULT_URL = "https://192.227.231.68:9444"
LEGACY_URL = "https://codex-task-relay.ideal-hero-2137.chatgpt.site"
ROLES = {"planner": "策划：输出设计想法、需求和验收标准，协调程序打包发布", "ui": "UI：设计与替换界面，承接新界面制作并提交给程序接入", "developer": "程序：按需求开发、集成和验证发布，无需求时主动脑暴分享"}


class Relay:
    def __init__(self, base=DEFAULT_URL):
        self.base = base.rstrip("/")
        if urllib.parse.urlparse(self.base).scheme not in ("https", "http"):
            raise ValueError("URL must use HTTP or HTTPS")

    def request(self, path, data=None, method=None):
        payload = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(self.base + "/api/v1" + path, data=payload, method=method,
                                        headers={"Content-Type": "application/json", "User-Agent": "CodexRelay/1.0"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                if exc.code in (301,302,307,308) and exc.headers.get("Location"):
                    location=urllib.parse.urljoin(request.full_url,exc.headers["Location"])
                    old=urllib.parse.urlparse(request.full_url);new=urllib.parse.urlparse(location)
                    old_origin=f"{old.scheme}://{old.netloc}";new_origin=f"{new.scheme}://{new.netloc}"
                    if new.username or new.password or not (new_origin==old_origin or old_origin==LEGACY_URL and new_origin==DEFAULT_URL):
                        raise RuntimeError("Relay redirected to another server; update --url after confirming the destination") from exc
                    request=urllib.request.Request(location,data=payload,headers={"Content-Type":"application/json","User-Agent":"CodexRelay/2.0"},method=request.get_method())
                    continue
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

    def send(self, room, sender, content, kind="message", recipient=None, reply_to=None, client_id=None, summary=None):
        # A single ID survives all HTTP retries of this call.
        return self.request("/rooms/" + urllib.parse.quote(room, safe="") + "/messages", {
            "sender": sender, "content": content, "kind": kind, "recipient": recipient,
            "reply_to": reply_to, "client_id": client_id or str(uuid.uuid4()),
            **({"summary": summary} if summary is not None else {}),
        })

    def status(self, room, sender, role, state, task="", waiting_for=None, mode="manual", last_read_id=0, display_name=None, responsibility=None, polling_interval_minutes=1, next_check_at=None, automation_id=None):
        return self.request("/rooms/" + urllib.parse.quote(room, safe="") + "/agents", {
            "sender": sender, "role": role, "state": state, "task": task,
            "waiting_for": waiting_for, "mode": mode, "last_read_id": last_read_id,
            **({"display_name":display_name} if display_name is not None else {}),
            **({"responsibility":responsibility} if responsibility is not None else {}),
            "polling_interval_minutes":polling_interval_minutes,
            **({"next_check_at":next_check_at} if next_check_at is not None else {}),
            **({"automation_id":automation_id} if automation_id else {}),
        })


def output(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def journal(relay, args):
    server = hashlib.sha256(relay.base.encode()).hexdigest()[:12]
    person = hashlib.sha256(args.sender.encode()).hexdigest()[:16]
    path = pathlib.Path(args.state_file) if args.state_file else pathlib.Path.cwd() / ".work" / "relay" / server / args.room / (person + ".json")
    state = {"url": relay.base, "room": args.room, "sender": args.sender, "last_read_id": 0}
    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        if saved.get("url")==LEGACY_URL and relay.base==DEFAULT_URL:
            saved["url"]=relay.base
        if any(saved.get(key) != state[key] for key in ("url", "room", "sender")):
            raise ValueError("State file belongs to another server, room or sender")
        state = saved
    return path, state


def save_journal(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def sync_history(relay, room, path, state):
    count = 0; relevant=False
    while True:
        data = relay.history(room, after=state["last_read_id"])
        for message in data["messages"]:
            output({"event": "message", "message": message})
            count += 1
            if message["sender"]!=state["sender"] and message.get("recipient") in (None,"",state["sender"]) and (message["kind"]!="status" or message.get("recipient")==state["sender"] or message["sender"]==room[:60]+"-owner"):
                relevant=True
        state["last_read_id"] = data["next_cursor"]
        save_journal(path, state)
        if not data["has_more"]:
            break
    return count,relevant


def update_cadence(state, now, activity=False, working=False, can_work=True, available_ids=()):
    """Propose cadence; only a confirmed native scheduler update changes applied cadence."""
    levels=(1,2,5,10,20,30);previous=state.get("cadence",{});available=set(available_ids)
    newly_available=available-set(previous.get("available_ids",[]))
    active=bool(activity or working or newly_available or previous.get("suspended") and can_work)
    idle=max(0,min(10,int(previous.get("idle_rounds",0))));last=float(previous.get("evaluated_at",0));interval=max(1,min(30,int(previous.get("interval_minutes",1))))
    if not can_work:idle=10;interval=30;last=now
    elif active:idle=0;interval=1;last=now
    elif not last:last=now
    elif now-last>=max(55,interval*60-5):idle=min(10,idle+1);interval=levels[min(len(levels)-1,idle//2)];last=now
    state["cadence"]={"idle_rounds":idle,"interval_minutes":interval,"evaluated_at":last,"available_ids":sorted(available),"suspended":not can_work}
    binding=state.get("listener",{});applied=binding.get("applied_minutes")
    return {"event":"cadence","recommended_minutes":interval,"idle_rounds":idle,"maximum_minutes":30,"automation_id":binding.get("automation_id"),"applied_minutes":applied,"schedule_update_required":applied!=interval,"needs_setup":not binding.get("automation_id"),"reason":"项目暂停、成员停用或服务只读" if not can_work else "有新消息、订单或正在推进的工作" if active else "空闲退避；同一轮重复sync不会累加空转次数","note":"这是调度建议，不代表已经修改宿主定时任务；工具确认更新后用listener记录回执。"}


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Public task-room messaging for Codex")
    parser.add_argument("--url", default=os.environ.get("CODEX_RELAY_URL", DEFAULT_URL))
    parser.add_argument("--room", default=os.environ.get("CODEX_RELAY_ROOM"))
    parser.add_argument("--sender", default=os.environ.get("CODEX_RELAY_SENDER", "codex"))
    parser.add_argument("--state-file", help="Optional room+sender scoped state file; defaults under .work/relay")
    sub = parser.add_subparsers(dest="command", required=True)
    listing = sub.add_parser("rooms"); listing.add_argument("--search", default=""); listing.add_argument("--offset", type=int, default=0)
    create = sub.add_parser("create"); create.add_argument("--title", required=True); create.add_argument("--description", default="")
    send = sub.add_parser("send", aliases=["dispatch", "claim", "deliver"]); send.add_argument("content", nargs="?"); send.add_argument("--file", help="UTF-8 message text file")
    send.add_argument("--kind", default="message", choices=["message", "status", "decision", "blocker", "handoff", "task", "claim", "result"])
    send.add_argument("--to"); send.add_argument("--reply-to", type=int); send.add_argument("--client-id")
    send.add_argument("--summary", help="One-sentence plain-text conclusion, at most 160 characters")
    history = sub.add_parser("history"); group = history.add_mutually_exclusive_group()
    group.add_argument("--after", type=int); group.add_argument("--before", type=int)
    history.add_argument("--limit", type=int, default=100); history.add_argument("--all", action="store_true")
    watch = sub.add_parser("watch"); watch.add_argument("--after", type=int, default=0)
    watch.add_argument("--cursor-file", help="Separate cursor file for each room and consumer")
    watch.add_argument("--interval", type=float, default=3); watch.add_argument("--duration", type=float, default=60, help="Seconds; 0 watches until interrupted")
    status = sub.add_parser("status"); status.add_argument("--role", required=True)
    status.add_argument("--state", required=True, choices=["listening", "working", "waiting", "brainstorming", "blocked", "done", "offline"])
    status.add_argument("--task", default=""); status.add_argument("--waiting-for"); status.add_argument("--mode", default="manual", choices=["manual", "scheduled", "continuous"])
    status.add_argument("--last-read-id", type=int, default=0)
    join = sub.add_parser("join"); join.add_argument("--role", required=True); join.add_argument("--intro", default=""); join.add_argument("--name", help="Display name; defaults to sender")
    sync=sub.add_parser("sync");sync.add_argument("--active",action="store_true",help="Actual work is in progress outside tracked orders")
    listener=sub.add_parser("listener");listener.add_argument("--automation-id");listener.add_argument("--thread-id");listener.add_argument("--applied-minutes",type=int,choices=[1,2,5,10,20,30])
    sub.add_parser("agents"); sub.add_parser("meta")
    project_list = sub.add_parser("projects"); project_list.add_argument("--search", default=""); project_list.add_argument("--filter", default="all"); project_list.add_argument("--include-test", action="store_true")
    task_list = sub.add_parser("tasks"); task_list.add_argument("--filter", default="open"); task_list.add_argument("--assignee"); task_list.add_argument("--offset", type=int, default=0)
    task_detail = sub.add_parser("task"); task_detail.add_argument("id", type=int)
    task_action = sub.add_parser("task-action"); task_action.add_argument("id", type=int); task_action.add_argument("--action", required=True, choices=["claim","start","block","submit","accept","reject","request_decision","resolve_decision","reassign","cancel"])
    task_action.add_argument("--note", default=""); task_action.add_argument("--file"); task_action.add_argument("--assigned-to"); task_action.add_argument("--waiting-for"); task_action.add_argument("--needs-owner", action="store_true"); task_action.add_argument("--client-id")
    args = parser.parse_args(); relay = Relay(args.url)
    if args.command in ("join","status") and (not args.role.strip() or len(args.role)>40 or '\n' in args.role or '\r' in args.role):
        parser.error("role must be a single-line name of 1–40 characters")
    if args.command=="join" and (len(args.intro)>2000 or args.name and (len(args.name)>80 or '\n' in args.name or '\r' in args.name)):
        parser.error("intro must fit 2000 characters and display name must be a single line up to 80 characters")
    if args.command not in ("rooms", "meta", "projects") and not args.room:
        parser.error("--room is required")
    if args.room and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", args.room):
        parser.error("invalid room ID")
    if args.command == "join" and args.sender == "codex":
        saved_identity=None
        if args.state_file and pathlib.Path(args.state_file).exists():
            saved_identity=json.loads(pathlib.Path(args.state_file).read_text(encoding="utf-8"))
            if saved_identity.get("room")!=args.room or saved_identity.get("url")!=relay.base:
                raise ValueError("State file belongs to another room or server")
        role_slug=re.sub(r"[^A-Za-z0-9_-]","",args.role).lower()[:16] or "member"
        args.sender=saved_identity["sender"] if saved_identity else args.room[:40]+"-"+role_slug+"-"+uuid.uuid4().hex[:6]
    if args.command == "rooms":
        output(relay.request("/rooms?" + urllib.parse.urlencode({"q": args.search, "offset": args.offset})))
    elif args.command == "create":
        output(relay.request("/rooms", {"id": args.room, "title": args.title, "description": args.description}))
    elif args.command in ("send", "dispatch", "claim", "deliver"):
        if bool(args.file) == bool(args.content):
            parser.error("provide exactly one of content or --file")
        content = pathlib.Path(args.file).read_text(encoding="utf-8-sig") if args.file else args.content
        if args.command in ("claim", "deliver") and args.reply_to is None:
            parser.error("claim and deliver require --reply-to with the original task message ID")
        if args.command in ("dispatch", "claim", "deliver") and not args.summary:
            parser.error("dispatch, claim and deliver require --summary with a one-sentence conclusion")
        kind = {"dispatch": "task", "claim": "claim", "deliver": "result"}.get(args.command, args.kind)
        output(relay.send(args.room, args.sender, content, kind, args.to, args.reply_to, args.client_id, args.summary))
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
    elif args.command == "status":
        _,state=journal(relay,args);binding=state.get("listener",{});interval=binding.get("applied_minutes",1) if args.mode=="scheduled" and args.state in ("waiting","listening") else 1
        output(relay.status(args.room, args.sender, args.role, args.state, args.task, args.waiting_for, args.mode, args.last_read_id,polling_interval_minutes=interval,next_check_at=int((time.time()+interval*60)*1000) if args.mode=="scheduled" else None,automation_id=binding.get("automation_id")))
    elif args.command == "listener":
        path,state=journal(relay,args)
        if args.automation_id or args.applied_minutes is not None:
            if not args.automation_id or args.applied_minutes is None:parser.error("record both --automation-id and --applied-minutes only after native scheduler success")
            state["listener"]={"automation_id":args.automation_id,"thread_id":args.thread_id or state.get("listener",{}).get("thread_id"),"applied_minutes":args.applied_minutes,"confirmed_at":time.time()};save_journal(path,state)
        output({"event":"listener_binding","listener":state.get("listener"),"cadence":state.get("cadence"),"note":"Local record of the caller-confirmed scheduler result; not a scheduler activation by this script."})
    elif args.command == "agents":
        output(relay.request("/rooms/" + args.room + "/agents"))
    elif args.command == "meta":
        output(relay.request("/meta"))
    elif args.command == "projects":
        output(relay.request("/projects?" + urllib.parse.urlencode({"q":args.search,"filter":args.filter,"include_test":"1" if args.include_test else "0"})))
    elif args.command == "tasks":
        query={"filter":args.filter,"offset":args.offset}
        if args.assignee: query["assignee"]=args.assignee
        output(relay.request("/projects/"+args.room+"/tasks?"+urllib.parse.urlencode(query)))
    elif args.command == "task":
        output(relay.request(f"/projects/{args.room}/tasks/{args.id}"))
    elif args.command == "task-action":
        task=relay.request(f"/projects/{args.room}/tasks/{args.id}")["task"]
        note=pathlib.Path(args.file).read_text(encoding="utf-8-sig") if args.file else args.note
        output(relay.request(f"/projects/{args.room}/tasks/{args.id}/actions", {"actor":args.sender,"action":args.action,"note":note,"assigned_to":args.assigned_to,"waiting_for":args.waiting_for,"needs_decision":args.needs_owner,"expected_version":task["version"],"client_id":args.client_id or str(uuid.uuid4())}))
    elif args.command in ("join", "sync"):
        path, state = journal(relay, args)
        pending=[];available=[]
        if args.command == "join":
            try:
                relay.request("/rooms/" + args.room)
            except RuntimeError as exc:
                if "HTTP 404:" not in str(exc):
                    raise
                try:
                    relay.request("/rooms", {"id": args.room, "title": ("PoorKing" if args.room == "poorking" else args.room) + " · 项目协作"})
                except RuntimeError as conflict:
                    if "HTTP 409:" not in str(conflict):
                        raise
            state["role"] = args.role
            state.setdefault("join_id", str(uuid.uuid4()))
            save_journal(path, state)
        meta = relay.request("/meta")
        output({"event":"server_state","read_only":bool(meta.get("read_only")),"canonical_url":meta.get("canonical_url",relay.base)})
        if args.command=="join" and meta.get("read_only"):
            raise RuntimeError("Relay is temporarily read-only; resume after migration at "+meta.get("canonical_url",relay.base))
        protocol_changed=state.get("protocol_version") != meta["protocol_version"]
        if protocol_changed:
            output({"event": "protocol_update", "metadata": meta})
            # A change is read, but only the Codex caller can acknowledge understanding it.
            state["protocol_version"] = meta["protocol_version"]
            save_journal(path, state)
        if "project-overview" in meta.get("capabilities", []):
            project=relay.request("/projects/"+args.room)["project"]
            state["project_status"]=project["project_status"]
            member=next((m for m in project.get("members",[]) if m["sender"]==args.sender),None)
            state["member_active"]=member["active"] if member else 1
            output({"event":"project_context","project":{"id":project["id"],"name":project["name"],"goal":project["goal"],"milestone":project["milestone"],"status":project["project_status"]},"member":member})
            pending=[]; offset=0
            while True:
                page=relay.request("/projects/"+args.room+"/tasks?"+urllib.parse.urlencode({"filter":"open","assignee":args.sender,"limit":100,"offset":offset}))
                pending.extend({key:t[key] for key in ("id","title","status","assignee","assigned_to","needs_decision","blocker","due_at","version")} for t in page["tasks"])
                if not page["has_more"]: break
                offset=page["next_offset"]
            output({"event":"my_tasks","tasks":pending})
            if not meta.get("read_only") and state.get("project_status")=="active" and state.get("member_active"):
                pool=relay.request("/projects/"+args.room+"/tasks?filter=todo&limit=100")
                available=[{key:t.get(key) for key in ("id","title","criteria","assigned_to","recommended_to","dispatch_mode","priority","version")} for t in pool["tasks"] if not t["assigned_to"] or t["assigned_to"]==args.sender]
                output({"event":"available_orders","orders":available,"has_more":pool["has_more"],"instruction":"按真实分工与前置依赖判断；推荐不等于已接单，先原子claim成功再执行。完成本单后继续监听。"})
        count,relevant = sync_history(relay, args.room, path, state)
        if args.command == "join":
            first_join = not state.get("join_announced")
            if first_join:
                intro = args.intro or ROLES.get(args.role,args.role+"：按项目实际分工协作")
                message = relay.send(args.room, args.sender, f"## 身份与职责\n- **我是谁**：{args.sender}\n- **负责什么**：{intro}\n\n## 当前状态\n已读取历史，准备按项目现有规则参与协作。\n\n## 协作方式\n公开派活、接活、进展、阻塞和交付；点名消息仍然全群可见。", "status", client_id=state["join_id"], summary=f"{args.sender} 已入群，已说明职责并读取历史，准备接续协作。")
                state["join_announced"] = True
                save_journal(path, state)
                output({"event": "joined", "message": message["message"]})
            if first_join or not state.get("status_registered"):
                intro=args.intro or ROLES.get(args.role,args.role+"：按项目实际分工协作")
                output(relay.status(args.room, args.sender, args.role, "waiting", "项目已暂停或归档，等待主人恢复" if state.get("project_status") in ("paused","archived") else "已加入并同步历史；尚未确认定时巡检启用", mode="manual", last_read_id=state["last_read_id"],display_name=args.name or args.sender,responsibility=intro))
                state["status_registered"]=True;save_journal(path,state)
        cadence=update_cadence(state,time.time(),activity=relevant or protocol_changed or args.command=="join",working=bool(getattr(args,"active",False) or any(t["status"] in ("todo","claimed","in_progress") for t in pending)),can_work=not meta.get("read_only") and state.get("project_status","active")=="active" and bool(state.get("member_active",1)),available_ids=[t["id"] for t in available]);save_journal(path,state);output(cadence)
        output({"event": "synced", "room": args.room, "sender": args.sender, "last_read_id": state["last_read_id"], "messages_read": count, "state_file": str(path)})
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
