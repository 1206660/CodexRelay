"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { Copy,Edit3,LoaderCircle,Plus,Power,UserPlus,Users } from "lucide-react";
import type { MemberRecord } from "../lib/control-model";
import { inviteText } from "../lib/agent-guide";
import { ControlDialog,ControlError,Empty,StatusTag,controlApi,since } from "./control-ui";
import {MemberReputation} from "./order-reputation";
export default function MemberPanel({room,members,onChanged}:{room:string;members:MemberRecord[];onChanged:()=>void}){
  const [edit,setEdit]=useState<MemberRecord|null|undefined>(undefined),[error,setError]=useState(""),[busy,setBusy]=useState(""),[copied,setCopied]=useState("");
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(""),2500);return()=>clearTimeout(timer);},[copied]);
  async function toggle(member:MemberRecord){setBusy(member.sender);setError("");
    try{await controlApi("/projects/"+room+"/members",{method:"POST",body:JSON.stringify({sender:member.sender,display_name:member.display_name,role:member.role,responsibility:member.responsibility,active:!member.active,client_id:crypto.randomUUID()})});onChanged();}
    catch(e:any){setError(e.message);}finally{setBusy("");}
  }
  return <div><div className="control-section-head"><h2><Users size={17}/>项目成员 <small>{members.filter(m=>m.active).length}</small></h2><button className="control-primary" onClick={()=>setEdit(null)}><UserPlus size={16}/>添加成员</button></div>
    {error&&<ControlError message={error}/>}
    {!members.length?<Empty icon={<Users size={30}/>}>尚未配置成员；姓名、角色和人数均可自定义<button className="control-primary" onClick={()=>setEdit(null)}><Plus size={15}/>添加第一位成员</button></Empty>:
      <div className="member-list">{members.map(member=><article key={member.sender} className={"member-row"+(!member.active?" inactive":"")}><div className="member-avatar">{member.display_name.slice(0,1)}</div><div className="member-identity"><strong>{member.display_name}</strong><span>{member.role_label||member.role}</span><small>{member.sender}</small></div><div className="member-work"><MemberReputation member={member}/><StatusTag state={!member.active?"offline":!member.last_seen?"unknown":member.stale?"stale":member.state||"unknown"}/><p title={member.task||member.responsibility}>{member.task||member.responsibility||"尚未填写负责范围"}</p>{member.waiting_for&&<small>等待：{member.waiting_for}</small>}</div><time>{member.last_seen?since(member.last_seen):"未报状态"}</time><div className="member-actions"><button className="control-icon" aria-label={"复制"+member.display_name+"的邀请"} title="复制邀请" onClick={async()=>{try{await navigator.clipboard.writeText(inviteText(room,member.role,member.sender));setCopied(member.sender);}catch{setError("复制失败，请打开成员接入说明。");}}}><Copy size={15}/></button><button className="control-icon" aria-label={"编辑"+member.display_name} title="编辑成员" onClick={()=>setEdit(member)}><Edit3 size={15}/></button><button className="control-icon" aria-label={(member.active?"停用":"启用")+member.display_name} title={member.active?"停用（不删除任务和历史）":"启用"} disabled={busy===member.sender} onClick={()=>toggle(member)}>{busy===member.sender?<LoaderCircle size={15}/>:<Power size={15}/>}</button>{copied===member.sender&&<small role="status">已复制</small>}</div></article>)}</div>}
    <p className="member-footnote">角色仅说明分工，可重复或自定义；配置成员不代表已连接。停用不会删除其任务与历史。</p>
    {edit!==undefined&&<MemberForm room={room} member={edit} onClose={()=>setEdit(undefined)} onSaved={()=>{setEdit(undefined);onChanged();}}/>}
  </div>;
}
function MemberForm({room,member,onClose,onSaved}:{room:string;member:MemberRecord|null;onClose:()=>void;onSaved:()=>void}){
  const [sender,setSender]=useState(member?.sender||""),[name,setName]=useState(member?.display_name||""),[role,setRole]=useState(member?.role||""),[responsibility,setResponsibility]=useState(member?.responsibility||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<{payload:string;id:string}|null>(null);
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError("");const payload=JSON.stringify({sender:sender.trim(),display_name:name.trim()||sender.trim(),role:role.trim()||"成员",responsibility:responsibility.trim(),active:member?!!member.active:true});
    if(pending.current?.payload!==payload)pending.current={payload,id:crypto.randomUUID()};
    try{await controlApi("/projects/"+room+"/members",{method:"POST",body:JSON.stringify({...JSON.parse(payload),client_id:pending.current.id})});onSaved();}catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <ControlDialog title={member?"编辑成员":"添加成员"} subtitle="可以有多个相同角色，每人使用不同发言名" onClose={onClose}><form className="control-form" onSubmit={save}><div className="control-form-grid"><label>显示名<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="例如 阿杰"/></label><label>唯一发言名<input value={sender} onChange={e=>setSender(e.target.value)} maxLength={80} required disabled={!!member} placeholder="例如 developer-front"/></label></div><label>角色 / 岗位<input value={role} onChange={e=>setRole(e.target.value)} maxLength={40} placeholder="自定义，例如 前端程序员"/></label><label>负责范围<textarea rows={3} maxLength={2000} value={responsibility} onChange={e=>setResponsibility(e.target.value)} placeholder="具体负责哪些工作、向谁交付"/></label>{error&&<ControlError message={error}/>}<div className="control-form-actions"><button className="control-button" type="button" onClick={onClose}>取消</button><button className="control-primary" disabled={busy}>{busy?<LoaderCircle size={15}/>:<UserPlus size={15}/>}保存成员</button></div></form></ControlDialog>;
}
