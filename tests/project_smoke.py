"""Real HTTP checks for project isolation, atomic task claims and owner review."""
import argparse
import concurrent.futures
import importlib.util
import pathlib
import uuid
import time
import urllib.request

spec=importlib.util.spec_from_file_location("relay",pathlib.Path(__file__).parents[1]/"clients"/"relay.py")
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--url",required=True);parser.add_argument("--overview-cookie-file",required=True);args=parser.parse_args()
    opener=urllib.request.build_opener();opener.addheaders=[("Cookie",pathlib.Path(args.overview_cookie_file).read_text().strip())];urllib.request.install_opener(opener)
    api=module.Relay(args.url)
    project="test-control-"+uuid.uuid4().hex[:8];other=project+"-other";owner=project+"-owner"
    for room in (project,other):
        value=api.request("/projects",{"id":room,"name":"总控台验收 "+room,"goal":"验证任务与验收闭环","milestone":"HTTP integration","is_test":True})
        assert value["project"]["id"]==room
    assert not api.request("/projects?q="+project)["projects"]
    assert api.request("/projects?include_test=1&q="+project)["total"]==2
    payload={"actor":owner,"title":"验收任务：单一认领与成果验证","description":"## 范围\n验证项目任务","criteria":"- 并发只能一人接单\n- 交付后需要验收","priority":"high","due_at":int(time.time()*1000)-1000,"client_id":str(uuid.uuid4())}
    created=api.request("/projects/"+project+"/tasks",payload);task=created["task"];task_id=task["id"]
    assert task["status"]=="todo" and task_id==created["message"]["id"]
    assert task["description"]==payload["description"]
    assert api.request("/projects/"+project+"/tasks",payload)["deduplicated"]
    def expect_error(status,call):
        try: call();raise AssertionError("expected error "+str(status))
        except RuntimeError as exc: assert "HTTP "+str(status)+":" in str(exc),str(exc)
    def claim(sender):
        try:return sender,api.send(project,sender,"## 接单\n我来验证","claim",reply_to=task_id,summary=sender+"接单")
        except RuntimeError as exc:return sender,str(exc)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        claims=list(pool.map(claim,("worker-a","worker-b")))
    winners=[(s,v) for s,v in claims if isinstance(v,dict)]
    assert len(winners)==1,claims
    winner=winners[0][0];loser="worker-b" if winner=="worker-a" else "worker-a"
    assert any("409" in v for _,v in claims if isinstance(v,str))
    current=lambda:api.request(f"/projects/{project}/tasks/{task_id}")["task"]
    assert current()["assignee"]==winner and current()["status"]=="claimed"
    def action(name,actor=winner,note="",**extra):
        t=current();return api.request(f"/projects/{project}/tasks/{task_id}/actions",{"actor":actor,"action":name,"note":note,"expected_version":t["version"],"client_id":str(uuid.uuid4()),**extra})
    v=current()["version"];action("start")
    expect_error(409,lambda:api.request(f"/projects/{project}/tasks/{task_id}/actions",{"actor":winner,"action":"block","note":"stale version","expected_version":v,"client_id":str(uuid.uuid4())}))
    action("block",note="等待 UI 补充尺寸",waiting_for="ui-member",needs_decision=True)
    p=api.request("/projects/"+project)["project"]
    assert p["blocked_tasks"]==1 and p["decision_tasks"]==1 and p["owner_tasks"]==1 and p["overdue_tasks"]==1
    action("resolve_decision",actor=owner,note="主人已明确尺寸")
    action("start")
    expect_error(409,lambda:api.send(project,loser,"冒充交付","result",reply_to=task_id,summary="不应通过"))
    delivered=api.send(project,winner,"## 成果\n已验证。\n- [x] 集成通过","result",reply_to=task_id,summary="成果已交付，待验收")
    assert delivered["task"]["status"]=="review"
    p=api.request("/projects/"+project)["project"]
    assert p["done_tasks"]==0 and p["review_tasks"]==1 and p["owner_tasks"]==1
    assert api.request("/tasks?include_test=1&filter=attention&q="+str(task_id))["tasks"][0]["id"]==task_id
    expect_error(409,lambda:action("accept",actor=loser))
    action("reject",actor=owner,note="补充验证范围")
    assert current()["status"]=="in_progress" and current()["rework_count"]==1
    action("submit",note="## 二次交付\n补齐验证证据")
    t=current()
    accepted={"actor":owner,"action":"accept","note":"验收通过","expected_version":t["version"],"client_id":str(uuid.uuid4())}
    api.request(f"/projects/{project}/tasks/{task_id}/actions",accepted)
    assert api.request(f"/projects/{project}/tasks/{task_id}/actions",accepted)["deduplicated"]
    p=api.request("/projects/"+project)["project"]
    assert p["done_tasks"]==1 and p["total_tasks"]==1 and p["review_tasks"]==0 and p["owner_tasks"]==0
    detail=api.request(f"/projects/{project}/tasks/{task_id}")
    assert len([e for e in detail["events"] if e["action"]=="accept"])==1
    assert any(e["action"]=="reject" for e in detail["events"])
    assert detail["task"]["completed_at"] and detail["task"]["reviewer"]==owner
    expect_error(404,lambda:api.request(f"/projects/{other}/tasks/{task_id}"))
    expect_error(404,lambda:api.request(f"/projects/{other}/tasks/{task_id}/actions",accepted))
    assert api.request("/projects/"+other+"/tasks")["total"]==0
    queued=api.request("/projects/"+project+"/tasks",{"actor":owner,"title":"暂停与归档检查","client_id":str(uuid.uuid4())})["task"]
    api.request("/projects/"+project,{"status":"paused"},method="PATCH")
    expect_error(409,lambda:api.send(project,"worker-c","接单","claim",reply_to=queued["id"],summary="接单"))
    api.request("/projects/"+project,{"status":"active","goal":"恢复推进"},method="PATCH")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        repeated=list(pool.map(lambda _: api.send(project,"worker-c","接单","claim",reply_to=queued["id"],summary="接单",client_id="same-claim-retry"),range(2)))
    assert len({r["message"]["id"] for r in repeated})==1
    api.request("/projects/"+project,{"status":"archived"},method="PATCH")
    assert not api.request("/projects?include_test=1&q="+project+"&filter=all")["projects"][0]["id"]==project
    assert api.request("/projects?include_test=1&q="+project+"&filter=archived")["projects"][0]["id"]==project
    expect_error(409,lambda:api.request("/projects/"+project+"/tasks",{"actor":owner,"title":"不该新增","client_id":str(uuid.uuid4())}))
    api.request("/projects/"+project,{"status":"active"},method="PATCH")
    print("PASS: project persistence+filters, task projection, concurrent single claim, idempotency, version conflicts, blocker+decision inbox, delivery vs acceptance, rework, isolation, pause/archive. project="+project)

if __name__=="__main__":
    main()
