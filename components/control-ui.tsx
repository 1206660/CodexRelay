"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCheck, CheckCircle2, CircleDot, CircleSlash, ClipboardCheck, Clock3, Hand, Hourglass, Lightbulb, LoaderCircle, Radio, SignalZero, X } from "lucide-react";
import { AGENT_STATES, TASK_STATES } from "../lib/control-model";
export async function controlApi<T=any>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch("/api/v1"+path,{...init,headers:{...(init?.body?{"Content-Type":"application/json"}:{}),...init?.headers}});
  const data:any=await response.json();
  if(!response.ok){const error=new Error(data.error?.message||"暂时无法连接，请重试") as Error&{status:number};error.status=response.status;throw error;}return data;
}
export function useLive<T>(path:string|null,interval=8000){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[tick,setTick]=useState(0);
  const previous=useRef<string|null>(null);
  useEffect(()=>{
    if(!path){setLoading(false);return;}
    if(previous.current!==path){setData(null);setError("");previous.current=path;}
    const controller=new AbortController();let stopped=false,busy=false;
    async function update(first=false){if(stopped||busy||(!first&&document.hidden))return;busy=true;
      try{const value=await controlApi<T>(path!,{signal:controller.signal});if(!stopped){setData(value);setError("");}}
      catch(e:any){if(!stopped&&e.name!=="AbortError")setError(e.message);}
      finally{busy=false;if(!stopped)setLoading(false);}
    }
    setLoading(true);void update(true);const timer=setInterval(()=>void update(),interval),focus=()=>void update(true);window.addEventListener("focus",focus);
    return()=>{stopped=true;controller.abort();clearInterval(timer);window.removeEventListener("focus",focus);};
  },[path,tick,interval]);
  return{data,error,loading,reload:()=>setTick(n=>n+1)};
}
export function since(time:number|null|undefined,now=Date.now()){
  if(!time)return "暂无记录";const seconds=Math.max(0,Math.floor((now-time)/1000));
  if(seconds<60)return "刚刚";if(seconds<3600)return Math.floor(seconds/60)+"分钟前";if(seconds<86400)return Math.floor(seconds/3600)+"小时前";return Math.floor(seconds/86400)+"天前";
}
const ICONS:Record<string,typeof Clock3>={todo:CircleDot,claimed:Hand,in_progress:LoaderCircle,blocked:AlertTriangle,review:ClipboardCheck,done:CheckCircle2,cancelled:CircleSlash,working:LoaderCircle,waiting:Hourglass,brainstorming:Lightbulb,listening:Radio,offline:CircleSlash,stale:Clock3,unknown:SignalZero};
export function StatusTag({state,label,compact=false}:{state:string;label?:string;compact?:boolean}){
  const Icon=ICONS[state]||CircleDot;const title=label||TASK_STATES[state as keyof typeof TASK_STATES]||AGENT_STATES[state]||({stale:"状态过期",unknown:"未上报"} as Record<string,string>)[state]||state;
  return <span className={"control-tag state-"+state+(compact?" compact":"")} title={title} aria-label={title}><Icon size={14}/><span>{title}</span></span>;
}
export function Metric({label,value,icon,active,onClick}:{label:string;value:number;icon:ReactNode;active?:boolean;onClick?:()=>void}){
  return <button className={"control-metric"+(active?" selected":"")} onClick={onClick}><span className="metric-icon">{icon}</span><span><strong>{value}</strong><small>{label}</small></span></button>;
}
export function ControlDialog({title,subtitle,children,onClose,wide=false}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>{if(dialog?.open)dialog.close();};},[]);
  return <dialog ref={ref} className={"control-dialog"+(wide?" wide":"")} aria-label={title} onCancel={e=>{e.preventDefault();close.current();}} onClick={e=>{if(e.target===e.currentTarget)close.current();}}>
    <div className="control-dialog-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="control-icon" onClick={()=>close.current()} aria-label="关闭"><X size={20}/></button></div>{children}
  </dialog>;
}
export function ControlError({message,onRetry}:{message:string;onRetry?:()=>void}){return <div className="control-error" role="alert"><AlertTriangle size={16}/><span>{message}</span>{onRetry&&<button onClick={onRetry}>重试</button>}</div>;}
export function Empty({icon,children,action}:{icon:ReactNode;children:ReactNode;action?:ReactNode}){return <div className="control-empty"><span>{icon}</span><p>{children}</p>{action}</div>;}
