"use client";
import { ArrowLeft,ArrowUpRight,Code2,Hash,Users } from "lucide-react";
import GuideInvite from "./guide-invite";
import { guidePath,guideText,roleInfo,type Role } from "../lib/agent-guide";
import type { MemberRecord } from "../lib/control-model";
export default function JoinView({room,role,sender,members=[]}:{room:string;role?:Role;sender?:string;members?:MemberRecord[]}){
  const profile=members.find(m=>m.sender===sender),actualRole=profile?.role||role;
  return <main className="guide-page"><header className="guide-nav"><a className="text-button" href="/"><ArrowLeft size={15}/>项目总览</a><span>CODEX / RELAY</span><a className="text-button" href={guidePath(room,actualRole,true,sender)}><Code2 size={15}/>纯文本说明</a></header>
    <span className="eyebrow">SHARED CONTEXT. FLEXIBLE TEAMS.</span><h1>Codex 接入说明</h1><p className="guide-lead">{room==="poorking"?"PoorKing":room}{profile?" · "+profile.display_name:actualRole?" · "+roleInfo(actualRole).label:" · 自定义团队"}</p>
    <div className="guide-room"><Hash size={17}/><strong>{room}</strong><a className="text-button" href={"/projects/"+room}>项目工作台<ArrowUpRight size={14}/></a></div>
    <GuideInvite room={room} role={actualRole} sender={sender}/>
    <section className="skill-entry"><div><h2>推荐用协作 Skill</h2><p>姓名、角色和人数均按项目配置；可以是三个程序员，也可以是任意组合。</p></div><code>使用 $codex-relay 加入 {room}{actualRole?"，角色是"+roleInfo(actualRole).label:"，自定义姓名和负责范围"}{sender?"，发言名用 "+sender:""}，启用持续协作。</code><a className="text-button" href="https://github.com/1206660/CodexRelay/tree/main/skills/codex-relay" target="_blank" rel="noreferrer">技能源码与安装入口<ArrowUpRight size={14}/></a></section>
    <section className="guide-team"><div className="guide-section-title"><h2><Users size={16}/>项目成员</h2><a className="text-button" href={"/projects/"+room+"?tab=members"}>配置成员<ArrowUpRight size={14}/></a></div><div className="role-grid">{members.filter(m=>m.active).map(member=><a key={member.sender} className={"role-card"+(member.sender===sender?" current":"")} href={guidePath(room,member.role,false,member.sender)}><div><h3>{member.display_name}</h3><ArrowUpRight size={16}/></div><span>{member.role_label||roleInfo(member.role).label}</span><p>{member.responsibility||"接入时说明具体负责范围"}</p><small>{member.sender}</small><span>{member.sender===sender?"当前成员":"打开成员说明"}</span></a>)}</div>{!members.some(m=>m.active)&&<p className="muted">尚未配置成员。可以在工作台添加，或让 Codex 选择独立姓名、自定义职责后接入；不会自动补出不存在的岗位。</p>}</section>
    <section className="guide-instructions"><div className="guide-section-title"><h2>完整接入与协作步骤</h2><a className="text-button" href={guidePath(room,actualRole,true,sender)}>读取纯文本<ArrowUpRight size={14}/></a></div><pre>{guideText(room,actualRole,sender,members)}</pre></section>
  </main>;
}
