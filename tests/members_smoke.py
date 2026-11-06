"""Three same-role members and arbitrary names/roles must work without fixed seats."""
import argparse,importlib.util,pathlib,json,subprocess,sys,uuid,urllib.parse,urllib.request
spec=importlib.util.spec_from_file_location("relay",pathlib.Path(__file__).parents[1]/"clients"/"relay.py");module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def main():
    p=argparse.ArgumentParser();p.add_argument("--url",required=True);args=p.parse_args();api=module.Relay(args.url)
    room="test-members-"+uuid.uuid4().hex[:8];owner=room+"-owner"
    api.request("/projects",{"id":room,"name":"成员自由配置验收","is_test":True})
    senders=["程序120.111","program-front","program-back"]
    for index,sender in enumerate(senders):
        api.request("/projects/"+room+"/members",{"sender":sender,"display_name":"程序员"+str(index+1),"role":"程序员","responsibility":"本地测试负责范围"+str(index+1)})
        api.status(room,sender,"任意角色","working" if index==0 else "waiting","本地成员配置测试")
    members=api.request("/projects/"+room+"/members")["members"]
    assert len(members)==3 and {m["sender"] for m in members}==set(senders)
    assert all(m["role"]=="程序员" for m in members)
    assert not any(m["role"] in ("planner","ui") for m in members)
    encoded=urllib.parse.urlencode({"room":room,"role":"摄影师","sender":senders[0]})
    with urllib.request.urlopen(args.url.rstrip("/")+"/join.txt?"+encoded,timeout=20) as response:guide=response.read().decode()
    assert "程序120.111" in guide and "三位负责人的分工" not in guide
    task=api.request("/projects/"+room+"/tasks",{"actor":owner,"title":"停用成员接单检查","assigned_to":senders[0],"client_id":str(uuid.uuid4())})["task"]
    api.request("/projects/"+room+"/members",{"sender":senders[0],"display_name":"程序员1","role":"程序员","active":False})
    api.status(room,senders[0],"程序员","working","停用后继续报到不应重新激活")
    assert next(m for m in api.request("/projects/"+room+"/members")["members"] if m["sender"]==senders[0])["active"]==0
    try:api.send(room,senders[0],"接单","claim",reply_to=task["id"],summary="不应成功");raise AssertionError("inactive member claimed")
    except RuntimeError as error:assert "409" in str(error)
    api.request("/projects/"+room+"/members",{"sender":senders[0],"display_name":"程序员1","role":"程序员","active":True})
    assert api.send(room,senders[0],"接单","claim",reply_to=task["id"],summary="已恢复，可以接单")["task"]["assignee"]==senders[0]
    root=pathlib.Path(__file__).parents[1];script=root/"skills"/"codex-relay"/"scripts"/"relay.py"
    def join(state):
        result=subprocess.run([sys.executable,str(script),"--url",args.url,"--room",room,"--state-file",str(state),"join","--role","同角色程序"],capture_output=True,encoding="utf-8")
        assert result.returncode==0,result.stderr
        return json.loads(pathlib.Path(state).read_text(encoding="utf-8"))["sender"]
    state_a=root/".work"/"members-test"/(room+"-a.json");state_b=root/".work"/"members-test"/(room+"-b.json")
    a=join(state_a);b=join(state_b)
    assert a!=b and join(state_a)==a
    print("PASS: three programmers, arbitrary Unicode names+roles, configured profile preserved, disable/reactivate, unique same-role identities and stable state. project="+room)
if __name__=="__main__":main()
