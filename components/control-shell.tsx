"use client";
import { useState,type ReactNode } from "react";
import { ArrowUpRight, Boxes, Crown, Code2, LayoutDashboard, Menu, Plus, Radio, Settings2, LockKeyhole } from "lucide-react";
import type { ProjectRecord } from "../lib/control-model";
import { useLive,controlApi } from "./control-ui";
import { overviewAccessChanged } from "./overview-access";
import LiveNotifications from "./live-notifications";
export default function ControlShell({projects,activeId,activeView="overview",children,onCreate,owner=true}:{projects:ProjectRecord[];activeId?:string;activeView?:string;children:ReactNode;onCreate:()=>void;owner?:boolean}){
  const [open,setOpen]=useState(false);
  const platform=useLive<{read_only:boolean;canonical_url:string}>("/meta",20000);
  return <div className="control-app">{activeId&&<LiveNotifications room={activeId}/>}<aside className={"control-sidebar"+(open?" open":"")}><a className="control-brand" href="/"><span><Radio size={21}/></span><strong>LocoBuddy <em>抢单开发</em></strong></a><div className="control-owner"><Crown size={15}/><span>{owner?"主人总控台":"项目协作"}</span>{owner?<button className="control-lock" aria-label="锁定总览" title="锁定总览" onClick={async()=>{await controlApi("/owner/logout",{method:"POST"});overviewAccessChanged();}}><LockKeyhole size={14}/></button>:<small>当前项目</small>}</div>
    <nav className="control-navigation" aria-label="总控台导航"><a className={!activeId&&activeView!=="attention"?"selected":""} href="/"><LayoutDashboard size={17}/>项目总览</a><a className={!activeId&&activeView==="attention"?"selected":""} href="/?view=attention"><Boxes size={17}/>待我处理</a></nav>
    <div className="control-project-label"><span>项目</span><button onClick={onCreate} aria-label="创建项目" title="创建项目"><Plus size={16}/></button></div>
    <nav className="control-project-nav" aria-label="项目列表">{projects.filter(p=>(owner||p.id===activeId)&&(p.project_status!=="archived"||p.id===activeId)).map(p=><a key={p.id} href={"/projects/"+p.id} className={p.id===activeId?"selected":""}><span className="project-initial">{p.name.slice(0,1)}</span><span>{p.name}</span>{p.owner_tasks>0&&<b>{p.owner_tasks}</b>}</a>)}{!projects.length&&<p>正在读取项目…</p>}</nav>
    <a className="control-skill-link" href={"/join?room="+(activeId||"codex-shared")}><Settings2 size={18}/><span>协作 Skill<small>接入成员 · 同步规则</small></span><ArrowUpRight size={15}/></a>
    <div className="control-sidebar-footer"><a href="https://github.com/1206660/CodexRelay" target="_blank" rel="noreferrer" aria-label="GitHub源码"><Code2 size={14}/></a><span>消息公开 · 工作可追溯</span><small>2.2</small></div></aside>
    {open&&<button className="control-scrim" aria-label="关闭导航" onClick={()=>setOpen(false)}/>}
    <main className="control-main"><div className="control-mobile-bar"><button className="control-icon" onClick={()=>setOpen(true)} aria-label="打开项目导航"><Menu size={21}/></button><a href="/">LocoBuddy 抢单开发</a><button className="control-icon" onClick={onCreate} aria-label="创建项目"><Plus size={20}/></button></div>{platform.data?.read_only&&<div className="control-maintenance" role="status">迁移中 · 暂时只读，历史正在同步</div>}{children}</main>
  </div>;
}
