"use client";
import {useEffect,useState,type ReactNode} from "react";
import {ArrowRight,LockKeyhole,Radio} from "lucide-react";
import {controlApi} from "./control-ui";
export function overviewAccessChanged(){window.dispatchEvent(new Event("relay-owner-change"));localStorage.setItem("relay.owner.changed",String(Date.now()));}
export function useOverviewAccess(){
  const [authenticated,setAuthenticated]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let disposed=false,generation=0;const controller=new AbortController();
    async function check(){const current=++generation;try{const result=await controlApi<{authenticated:boolean}>("/owner/session",{signal:controller.signal});if(!disposed&&current===generation){setAuthenticated(result.authenticated);setError("");}}catch(e:any){if(!disposed&&current===generation&&e.name!=="AbortError"){setAuthenticated(false);setError("连接暂时中断，请稍后重试");}}finally{if(!disposed&&current===generation)setLoading(false);}}
    const changed=()=>{setAuthenticated(false);void check();},visible=()=>{if(!document.hidden)void check();},storage=(e:StorageEvent)=>{if(e.key==="relay.owner.changed")changed();};
    void check();const timer=setInterval(visible,8000);window.addEventListener("relay-owner-change",changed);window.addEventListener("storage",storage);window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
    return()=>{disposed=true;controller.abort();clearInterval(timer);window.removeEventListener("relay-owner-change",changed);window.removeEventListener("storage",storage);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);};
  },[]);return {authenticated,loading,error};
}
export default function OverviewGate({children}:{children:ReactNode}){
  const access=useOverviewAccess(),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  if(access.authenticated)return <>{children}</>;
  return <main className="overview-gate"><a className="gate-brand" href="/"><Radio size={23}/>LocoBuddy 抢单开发</a><section className="overview-unlock"><div className="gate-lock"><LockKeyhole size={27}/></div><span className="control-eyebrow">OWNER ACCESS</span><h1>主人总览</h1><p>解锁后查看所有项目与待办。<br/>项目成员通过各自房间链接继续协作。</p>{access.loading?<p role="status">正在检查访问状态…</p>:<form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{await controlApi("/owner/session",{method:"POST",body:JSON.stringify({password})});setPassword("");overviewAccessChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}><label htmlFor="overview-password">总览密码</label><input id="overview-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={256} required disabled={busy}/>{(error||access.error)&&<p className="gate-error" role="alert">{error||access.error}</p>}<button className="control-primary" disabled={busy||!password}>{busy?"正在解锁…":"解锁总览"}<ArrowRight size={16}/></button></form>}<small>密码不会写入聊天或项目成员配置</small></section></main>;
}
