#!/usr/bin/env python3
"""Export only public application records; never exports credentials or rate-limit IP data."""
import argparse,json,pathlib,sys,time,urllib.request,urllib.error,urllib.parse,hashlib
def main():
    parser=argparse.ArgumentParser();parser.add_argument("--source",required=True);parser.add_argument("--output",required=True);parser.add_argument("--allow-live-source",action="store_true");args=parser.parse_args()
    base=args.source.rstrip("/")
    def get(path):
        for attempt in range(4):
            try:
                request=urllib.request.Request(base+"/api/v1"+path,headers={"User-Agent":"CodexRelay/1.0","Accept":"application/json"})
                with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
            except (urllib.error.URLError,TimeoutError):
                if attempt==3:raise
                time.sleep(min(8,2**attempt))
    meta=get("/meta")
    if not meta.get("read_only") and not args.allow_live_source:raise RuntimeError("Source must be read-only for a consistent cutover snapshot")
    data={name:[] for name in ("rooms","messages","agents","project_settings","project_members","tasks","task_events")}
    offset=0
    while True:
        page=get("/rooms?limit=100&offset="+str(offset));data["rooms"].extend(page["rooms"])
        if not page["has_more"]:break
        offset=page["next_offset"]
    task_ids=set();event_ids=set()
    for room in data["rooms"]:
        rid=urllib.parse.quote(room["id"],safe="");after=0
        while True:
            page=get("/rooms/"+rid+"/messages?after="+str(after)+"&limit=100");data["messages"].extend(page["messages"]);after=page["next_cursor"]
            if not page["has_more"]:break
        states=get("/rooms/"+rid+"/agents");data["agents"].extend(states["agents"])
        if "project-overview" in meta.get("capabilities",[]):
            p=get("/projects/"+rid)["project"]
            data["project_settings"].append({"room_id":p["id"],"name":p["name"],"goal":p["goal"],"milestone":p["milestone"],"status":p["project_status"],"is_test":p["is_test"],"updated_at":p["updated_at"]})
            if "custom-members" in meta.get("capabilities",[]):
                for member in get("/projects/"+rid+"/members")["members"]:
                    data["project_members"].append({**member,"key":member["room_id"]+":"+member["sender"]})
            offset=0
            while True:
                page=get("/projects/"+rid+"/tasks?filter=all&limit=100&offset="+str(offset))
                for task in page["tasks"]:
                    if task["id"] in task_ids:continue
                    task_ids.add(task["id"]);detail=get("/projects/"+rid+"/tasks/"+str(task["id"]));data["tasks"].append(detail["task"])
                    for event in detail["events"]:
                        if event["id"] not in event_ids:data["task_events"].append(event);event_ids.add(event["id"])
                if not page["has_more"]:break
                offset=page["next_offset"]
    snapshot={"version":1,"source_url":base,"exported_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"source_read_only":meta.get("read_only",False),"data":data}
    target=pathlib.Path(args.output);target.parent.mkdir(parents=True,exist_ok=True)
    payload=json.dumps(snapshot,ensure_ascii=False,separators=(",",":")).encode("utf-8");temporary=target.with_suffix(target.suffix+".tmp");temporary.write_bytes(payload);temporary.replace(target)
    print(json.dumps({"exported":True,"counts":{name:len(rows) for name,rows in data.items()},"sha256":hashlib.sha256(payload).hexdigest()},ensure_ascii=False))
if __name__=="__main__":main()
