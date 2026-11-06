"use client";
import { useRef,useState } from "react";
import { AlertTriangle,ArrowRightLeft,Check,CheckCheck,ChevronRight,ClipboardCheck,Clock3,ExternalLink,Hand,HelpCircle,LoaderCircle,Play,Send,UserRound,XCircle } from "lucide-react";
import type { TaskEvent,TaskRecord } from "../lib/control-model";
import { ACTION_LABELS,TASK_STATES } from "../lib/control-model";
import { ControlDialog,ControlError,StatusTag,controlApi,since,useLive } from "./control-ui";
import MarkdownContent from "./markdown-content";
import MessageBody from "./message-body";
export default function TaskDetails({room,id,actor,onClose,onChanged}:{room:string;id:number;actor:string;onClose:()=>void;onChanged:()=>void}){
  const live=useLive<{task:TaskRecord;events:TaskEvent[];messages:any[]}>("/projects/"+room+"/tasks/"+id,7000);
  const [note,setNote]=useState(""),[target,setTarget]=useState(""),[waiting,setWaiting]=useState(""),[needsOwner,setNeedsOwner]=useState(false),[busy,setBusy]=useState(""),[error,setError]=useState("");
  const pending=useRef<{payload:string;id:string}|null>(null),task=live.data?.task;
  async function act(action:string){if(!task||busy)return;setError("");
    if(["block","submit","reject","request_decision","resolve_decision"].includes(action)&&!note.trim()){setError("请先写清操作说明、阻塞原因或交付证据。");return;}
    const payload=JSON.stringify({actor,action,note:note.trim(),assigned_to:target.trim()||null,waiting_for:waiting.trim()||null,needs_decision:needsOwner,expected_version:task.version});
    if(pending.current?.payload!==payload)pending.current={payload,id:crypto.randomUUID()};
    setBusy(action);
    try{await controlApi("/projects/"+room+"/tasks/"+id+"/actions",{method:"POST",body:JSON.stringify({...JSON.parse(payload),client_id:pending.current.id})});pending.current=null;setNote("");setTarget("");setWaiting("");setNeedsOwner(false);live.reload();onChanged();}
    catch(e:any){setError(e.message);if(e.status===409)live.reload();}finally{setBusy("");}
  }
  const privileged=!!task&&(actor===room.slice(0,60)+"-owner"||actor===task.requester),responsible=!!task&&(task.assignee===actor||!task.assignee&&task.assigned_to===actor),closed=!!task&&["done","cancelled"].includes(task.status);
  function actionButton(action:string,label:string,icon:React.ReactNode,primary=false){return <button key={action} className={primary?"control-primary":"control-button"} disabled={!!busy} onClick={()=>act(action)}>{busy===action?<LoaderCircle size={15}/>:icon}{label}</button>;}
  return <ControlDialog title={task?"#"+task.id+" · "+task.title:"读取任务…"} subtitle="派活、接单、进展和验收均会同步到项目群聊" onClose={onClose} wide>
    {live.error&&<ControlError message={live.error} onRetry={live.reload}/>}
    {task&&<><div className="task-detail-meta"><StatusTag state={task.status}/><span><UserRound size={14}/>{task.assignee||task.assigned_to||"待接单"}</span><span><Clock3 size={14}/>{since(task.updated_at)}</span>{task.needs_decision===1&&<span className="owner-needed"><HelpCircle size={14}/>待主人决定</span>}{task.due_at&&<span className={task.due_at<Date.now()&&!closed?"text-overdue":""}>截止 {new Date(task.due_at).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>}</div>
    <section className="task-detail-section"><h3>目标与说明</h3><MarkdownContent content={task.description}/></section>
    {task.criteria&&<section className="task-detail-section"><h3><ClipboardCheck size={15}/>验收条件</h3><MarkdownContent content={task.criteria}/></section>}
    {task.blocker&&<section className="task-blocker"><h3><AlertTriangle size={16}/>当前阻塞{task.waiting_for&&<small>等待 {task.waiting_for}</small>}</h3><MarkdownContent content={task.blocker}/></section>}
    {!!task.needs_decision&&task.decision_note&&<section className="task-blocker"><h3><HelpCircle size={16}/>需要你决定</h3><MarkdownContent content={task.decision_note}/></section>}
    {task.evidence&&<section className="task-detail-section"><h3><CheckCheck size={15}/>成果与验证 <small>{task.status==="done"?"已验收":"提交记录，验收状态见上方"}</small></h3><MarkdownContent content={task.evidence}/></section>}
    {task.review_note&&<section className="task-detail-section"><h3>验收反馈 <small>{task.reviewer}</small></h3><MarkdownContent content={task.review_note}/></section>}
    {!closed&&<section className="task-action-panel"><div className="control-section-head"><h3>同步下一步</h3><span>当前发言：{actor}</span></div><label className="control-field-label">说明 / 交付证据<textarea className="control-action-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={14000} rows={3} placeholder="支持 Markdown，写清本次结果或需要谁处理"/></label>
      <div className="control-form-grid"><label className="control-field-label">转派给<input value={target} onChange={e=>setTarget(e.target.value)} maxLength={80} placeholder="成员发言名，留空待认领"/></label><label className="control-field-label">正在等谁<input value={waiting} onChange={e=>setWaiting(e.target.value)} maxLength={80} placeholder="阻塞的依赖对象"/></label></div><label className="control-check"><input type="checkbox" checked={needsOwner} onChange={e=>setNeedsOwner(e.target.checked)}/>报告阻塞时需要主人决定</label>
      {error&&<ControlError message={error}/>}<div className="task-action-buttons">
        {task.status==="todo"&&(!task.assigned_to||task.assigned_to===actor)&&actionButton("claim","接单",<Hand size={15}/>,true)}
        {responsible&&["claimed","blocked"].includes(task.status)&&actionButton("start","开始",<Play size={15}/>,true)}
        {responsible&&["todo","claimed","in_progress","blocked"].includes(task.status)&&actionButton("submit","提交验收",<Send size={15}/>,true)}
        {privileged&&task.status==="review"&&actionButton("accept","验收通过",<CheckCheck size={15}/>,true)}
        {privileged&&task.status==="review"&&actionButton("reject","退回修改",<XCircle size={15}/>)}
        {(responsible||privileged)&&actionButton("block","报阻塞",<AlertTriangle size={15}/>)}
        {!task.needs_decision&&actionButton("request_decision","请主人决定",<HelpCircle size={15}/>)}
        {privileged&&!!task.needs_decision&&actionButton("resolve_decision","决策已处理",<Check size={15}/>,true)}
        {privileged&&task.status!=="review"&&actionButton("reassign","转派",<ArrowRightLeft size={15}/>)}
        {privileged&&actionButton("cancel","取消任务",<XCircle size={15}/>)}
      </div></section>}
    <section className="task-detail-section"><h3>任务流转 <small>{task.rework_count>0?"退回 "+task.rework_count+" 次":""}</small></h3><div className="task-event-list">{live.data?.events.map(event=><div key={event.id} className="task-event"><span className="event-dot"/><div><strong>{ACTION_LABELS[event.action]||event.action}</strong><small>{event.actor} · {new Date(event.created_at).toLocaleString("zh-CN")}</small><span className="event-transition">{event.from_state&&<>{TASK_STATES[event.from_state as keyof typeof TASK_STATES]||event.from_state}<ChevronRight size={11}/></>}{TASK_STATES[event.to_state]}</span><MessageBody content={event.note} summary={event.summary}/></div></div>)}</div></section>
    <details className="related-messages"><summary>相关群聊 · {live.data?.messages.length||0} 条</summary>{live.data?.messages.map(m=><div key={m.id}><small>#{m.id} · {m.sender}</small><MessageBody content={m.content} summary={m.summary}/></div>)}</details>
    <div className="task-detail-bottom"><span>任务归属：{room} · 版本 {task.version}</span><a href={"/?room="+room+"&as=owner"} className="control-text-link"><ExternalLink size={13}/>独立打开群聊</a></div>
    </>}
  </ControlDialog>;
}
