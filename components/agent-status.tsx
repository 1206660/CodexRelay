"use client";
import { useEffect,useState } from "react";
import { Activity,ChevronDown,Settings2,Users } from "lucide-react";
import type { MemberRecord } from "../lib/control-model";
import { ControlError,StatusTag,useLive,since } from "./control-ui";
import { guidePath } from "../lib/agent-guide";
import {MemberReputation} from "./order-reputation";
export default function AgentStatus({room,onOwner,onManage}:{room:string;onOwner:()=>void;onManage?:()=>void}){
  const live=useLive<{members:MemberRecord[];server_time:number}>("/rooms/"+room+"/agents",5000),[expanded,setExpanded]=useState(false);
  const active=(live.data?.members||[]).filter(m=>m.active),members=expanded?active:active.slice(0,4);
  const modes:Record<string,string>={manual:"手动接入",scheduled:"定时巡检",continuous:"本轮监听"};
  useEffect(()=>setExpanded(false),[room]);
  return <section className="agent-status" aria-label="AI 工作状态"><div className="agent-status-heading"><span><Activity size={15}/>成员状态 <small>{active.length||""}</small></span><small>工作3分 · 空闲按巡检计划</small><div className="agent-heading-actions">{onManage?<button className="text-button" onClick={onManage} title="管理成员"><Settings2 size={14}/>成员</button>:<a className="text-button" href={"/projects/"+room+"?tab=members"}><Users size={14}/>成员</a>}<button className="text-button" onClick={onOwner}>主人发需求 →</button></div></div>
    {live.error&&<ControlError message={live.error} onRetry={live.reload}/>}
    {!members.length?<div className="agent-empty"><Users size={18}/><span>{live.loading?"正在读取成员…":"尚无成员，按项目需要自由添加或邀请"}</span><a href={guidePath(room)}>接入 ↗</a></div>:<div className="agent-status-grid flexible">{members.map(member=>{
      const state=!member.last_seen?"unknown":member.stale?"stale":member.state||"unknown";
      return <article key={member.sender} className={"agent-card "+(!member.last_seen||member.stale?"inactive":state)}><div className="agent-card-head"><strong title={member.sender}>{member.display_name}</strong><StatusTag state={state} label={member.mode==="scheduled"&&["waiting","listening"].includes(state)?"待巡检":undefined} compact/></div><span className="agent-role-label">{member.role_label||member.role}</span><p title={member.task||member.responsibility||""}>{member.task||member.responsibility||"等待状态上报"}</p>{member.waiting_for&&<div className="agent-waiting">等待：{member.waiting_for}</div>}<MemberReputation member={member}/><div className="agent-card-footer"><span>{member.last_seen?modes[member.mode||""]||"已上报":"未接入"}</span><time title={member.last_seen?new Date(member.last_seen).toLocaleString("zh-CN"):"尚无报到"}>{member.mode==="scheduled"&&member.next_check_at&&["waiting","listening"].includes(state)?Math.max(0,Math.ceil((member.next_check_at-(live.data?.server_time||Date.now()))/60000))+"分后巡检":member.last_seen?since(member.last_seen,live.data?.server_time):""}</time></div></article>;
    })}</div>}
    {active.length>4&&<button className="agent-expand-members" onClick={()=>setExpanded(!expanded)}><ChevronDown size={13}/>{expanded?"收起":"全部 "+active.length+" 位成员"}</button>}
  </section>;
}
