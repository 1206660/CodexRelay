"use client";
import {useEffect,useState} from "react";
import {ArrowUpRight,CheckCheck,Hand,Radio} from "lucide-react";
import type {ProjectRecord,TaskRecord} from "../lib/control-model";
import {ControlDialog,ControlError,useLive} from "./control-ui";
export default function OrderRadar({project,ids,onClose,onOpen}:{project:ProjectRecord;ids:number[];onClose:()=>void;onOpen:(id:number)=>void}){
  const live=useLive<{tasks:TaskRecord[]}>("/projects/"+project.id+"/tasks?ids="+ids.join(",")+"&limit=8",2000),[now,setNow]=useState(Date.now());
  const orders=live.data?.tasks||[],claimed=orders.filter(t=>t.assignee),waiting=orders.filter(t=>t.status==="todo"),allMatched=orders.length===ids.length&&claimed.length===orders.length,people=project.members.filter(m=>m.active).slice(0,6);
  useEffect(()=>{if(allMatched)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[allMatched]);
  const first=orders.length?Math.min(...orders.map(t=>t.created_at)):now,seconds=Math.max(0,Math.floor((now-first)/1000));
  const name=(sender:string)=>project.members.find(m=>m.sender===sender)?.display_name||sender;
  return <ControlDialog title={allMatched?"伙伴已接单":"订单已发布"} subtitle={project.name+" · 抢单结果实时同步"} onClose={onClose}>
    <section className={"order-radar-panel"+(allMatched?" matched":"")}><div className="order-radar" aria-hidden="true"><i className="radar-ring ring-one"/><i className="radar-ring ring-two"/><i className="radar-ring ring-three"/>{!allMatched&&<i className="radar-sweep"/>}<div className="radar-center">{allMatched?<CheckCheck size={30}/>:<Radio size={30}/>}</div>{people.map((p,i)=><span key={p.sender} className={"radar-person"+(!p.last_seen||p.stale?" stale":"")} style={{left:(50+39*Math.cos(i/Math.max(people.length,1)*Math.PI*2-Math.PI/2))+"%",top:(50+39*Math.sin(i/Math.max(people.length,1)*Math.PI*2-Math.PI/2))+"%"}} title={p.display_name+" · "+(p.stale?"状态过期":p.state||"未上报")}>{p.display_name.slice(0,1)}</span>)}</div>
    <h3>{allMatched?"交给伙伴，一起把它做好。":"正在等待伙伴抢单"}</h3><p>{allMatched?claimed.length+" 单已由实际成员接下，进入订单可继续跟进。":waiting.length?waiting.length+" 单待抢 · 已等待 "+seconds+" 秒":"正在读取订单状态…"}</p>{live.error&&<ControlError message={live.error} onRetry={live.reload}/>}
    <div className="radar-order-list">{orders.map(t=><button key={t.id} onClick={()=>onOpen(t.id)}><span className={"radar-order-icon"+(t.assignee?" claimed":"")}>{t.assignee?<Hand size={17}/>:<Radio size={17}/>}</span><span><strong>{t.title}</strong><small>{t.assignee?name(t.assignee)+" 已抢到":t.assigned_to?"等待 "+name(t.assigned_to)+" 接单":t.status==="cancelled"?"已取消":"已进入本项目抢单池"}</small></span><ArrowUpRight size={15}/></button>)}</div><small className="radar-note">动效表示等待状态；成员头像来自实际配置。关闭窗口不撤销订单。</small><button className="control-button" onClick={onClose}>{allMatched?"继续查看项目":"在后台等待"}</button></section>
  </ControlDialog>;
}
