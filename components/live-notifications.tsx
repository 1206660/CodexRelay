"use client";
import {useEffect,useRef,useState} from "react";
import {AlertTriangle,ArrowUpRight,ClipboardCheck,MessageSquare,X} from "lucide-react";
import type {ProjectRecord} from "../lib/control-model";
export type LiveNotice={id:string;room:string;project:string;summary:string;sender?:string;kind?:string};
export function notifyLive(notice:LiveNotice){window.dispatchEvent(new CustomEvent("relay-live-notice",{detail:notice}));}
export function useProjectAlerts(projects:ProjectRecord[]|undefined){
  const seen=useRef(new Map<string,number>());
  useEffect(()=>{if(!projects)return;for(const p of projects){const previous=seen.current.get(p.id);seen.current.set(p.id,p.last_message_id||0);if(previous!==undefined&&p.last_message_id>previous&&p.last_summary)notifyLive({id:p.id+":"+p.last_message_id,room:p.id,project:p.name,summary:p.last_summary,sender:p.last_sender||undefined,kind:p.last_kind||undefined});}},[projects]);
}
function NoticeCard({notice,onClose}:{notice:LiveNotice;onClose:()=>void}){
  const [paused,setPaused]=useState(false),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{if(paused)return;const timer=setTimeout(()=>close.current(),6500);return()=>clearTimeout(timer);},[paused]);
  const Icon=notice.kind==="blocker"?AlertTriangle:notice.kind==="result"?ClipboardCheck:MessageSquare;
  return <article className={"live-notice notice-"+(notice.kind||"message")} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}><span className="live-notice-icon"><Icon size={18}/></span><a href={"/projects/"+notice.room+"?tab=chat"} onClick={e=>{if(location.pathname==="/projects/"+notice.room||location.pathname==="/"&&new URLSearchParams(location.search).get("room")===notice.room){e.preventDefault();window.dispatchEvent(new CustomEvent("relay-open-chat",{detail:notice.room}));onClose();}}}><small>{notice.project}{notice.sender&&" · "+notice.sender}</small><strong>{notice.summary}</strong><span>查看消息<ArrowUpRight size={12}/></span></a><button type="button" aria-label="关闭提醒" onClick={onClose}><X size={14}/></button></article>;
}
export default function LiveNotifications({room}:{room?:string}){
  const [notices,setNotices]=useState<LiveNotice[]>([]),seen=useRef(new Set<string>());
  useEffect(()=>{setNotices([]);seen.current.clear();const receive=(event:Event)=>{const n=(event as CustomEvent<LiveNotice>).detail;if(!n||room&&n.room!==room||seen.current.has(n.id))return;seen.current.add(n.id);if(seen.current.size>200)seen.current.delete(seen.current.values().next().value!);setNotices(old=>[...old,n].slice(-3));};window.addEventListener("relay-live-notice",receive);return()=>window.removeEventListener("relay-live-notice",receive);},[room]);
  return <aside className="live-notices" aria-label="动态提醒" aria-live="polite" aria-relevant="additions">{notices.filter(n=>!room||n.room===room).map(n=><NoticeCard key={n.id} notice={n} onClose={()=>setNotices(old=>old.filter(x=>x.id!==n.id))}/>)}</aside>;
}
