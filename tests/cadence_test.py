"""Cadence invariants without network calls, wall-clock sleeps or model usage."""
import importlib.util,pathlib
path=pathlib.Path(__file__).parents[1]/'skills/codex-relay/scripts/relay.py'
spec=importlib.util.spec_from_file_location('relay_cadence',path);relay=importlib.util.module_from_spec(spec);spec.loader.exec_module(relay)
state={};now=1000
assert relay.update_cadence(state,now,activity=True)['recommended_minutes']==1
sequence=[]
for _ in range(30):
 now+=state['cadence']['interval_minutes']*60
 result=relay.update_cadence(state,now)
 assert 1<=result['recommended_minutes']<=30
 sequence.append(result['recommended_minutes'])
assert sequence[:10]==[1,2,2,5,5,10,10,20,20,30],sequence
assert sequence[-1]==30 and result['schedule_update_required'] and result['needs_setup']
idle=state['cadence']['idle_rounds'];relay.update_cadence(state,now+1);assert state['cadence']['idle_rounds']==idle
assert relay.update_cadence(state,now+2,working=True)['recommended_minutes']==1
now+=60;assert relay.update_cadence(state,now,available_ids=[123])['recommended_minutes']==1
now+=60;result=relay.update_cadence(state,now,available_ids=[123]);assert result['idle_rounds']==1
result=relay.update_cadence(state,now+60,can_work=False);assert result['recommended_minutes']==30
assert relay.update_cadence(state,now+120,can_work=True)['recommended_minutes']==1
state['listener']={'automation_id':'verified-test-id','applied_minutes':1}
assert not relay.update_cadence(state,now+121,working=True)['schedule_update_required']
print('PASS: idle backoff 1/2/5/10/20/30, hard maximum, repeated sync does not accelerate, activity/work/new-order recovery, pause/resume, scheduler suggestion distinct from applied state.')
